import { detectHands } from '../ai/handLandmarker.js';
import { PredictionEngine } from '../ai/predictionEngine.js';
import { createCamera } from '../components/camera.js';
import { createPredictionDisplay } from '../components/predictionDisplay.js';
import { SpellingQuizEngine, DIFFICULTY } from '../utils/quiz.js';
import { getRandomWords } from '../data/words.js';
import { saveQuizResult } from '../utils/storage.js';
import { navigate } from '../router.js';
import { updateDebugPanel } from '../main.js';
import { isLoaded, getModelInfo } from '../ai/FSLModel.js';
import { isReady } from '../ai/handLandmarker.js';
import { saveAttempt, startQuizAttempt, submitQuizAttempt, updateQuizAttempt } from '../lib/classroom.js';

let animFrameId = null;
let camera = null;
let predictionDisplay = null;
let engine = null;
let quiz = null;
let answered = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;
let activeAttemptId = null;
let attemptFinalized = false;
let progressSaveTimer = null;
let transitionTimer = null;
let activeAssignedQuiz = null;

function setSubmitVisibility(button, isVisible) {
  if (!button) return;
  button.hidden = !isVisible;
  button.style.display = isVisible ? '' : 'none';
  button.setAttribute('aria-hidden', String(!isVisible));
}

function getAttemptPayload() {
  const results = quiz?.getResults();
  if (!results) return null;
  return {
    score: results.score,
    maxScore: results.maxScore,
    accuracy: results.accuracy,
    detail: { mistakes: results.mistakes, words_completed: results.wordsCompleted, total_words: results.totalWords }
  };
}

async function saveAttemptProgress() {
  const payload = getAttemptPayload();
  if (!activeAttemptId || !payload || attemptFinalized) return;
  await updateQuizAttempt(activeAttemptId, payload);
}

function scheduleAttemptSave() {
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(() => saveAttemptProgress().catch(error => console.warn('Could not save quiz progress:', error.message)), 250);
}

async function finalizeAttempt() {
  const payload = getAttemptPayload();
  if (!activeAttemptId || !payload || attemptFinalized) return;
  attemptFinalized = true;
  clearTimeout(progressSaveTimer);
  try {
    await submitQuizAttempt(activeAttemptId, payload);
  } catch (error) {
    attemptFinalized = false;
    throw error;
  }
}

function handleQuizExit() {
  finalizeAttempt().catch(error => console.warn('Could not auto-submit quiz attempt:', error.message));
}

export function mount(container, params) {
  const assigned = getAssignedQuiz();
  if (assigned) {
    const words = (assigned.settings?.words || []).map(word => String(word).toUpperCase()).filter(Boolean);
    startQuiz(container, Math.min(assigned.question_count, words.length), 'normal', words, assigned);
    return;
  }
  navigate('#/quiz');
}

function getAssignedQuiz() {
  try {
    const quiz = JSON.parse(sessionStorage.getItem('assignedQuiz') || 'null');
    return quiz?.quiz_type === 'spelling' ? quiz : null;
  } catch { return null; }
}

async function startQuiz(container, count, difficulty, assignedWords = null, assignedQuiz = null) {
  activeAssignedQuiz = assignedQuiz;
  const words = assignedWords ? [...assignedWords].sort(() => Math.random() - 0.5).slice(0, count) : getRandomWords(count);
  quiz = new SpellingQuizEngine({ words });
  engine = new PredictionEngine(DIFFICULTY[difficulty] || DIFFICULTY.normal);
  answered = false;
  activeAttemptId = null;
  attemptFinalized = false;
  const initialResults = quiz.getResults();
  try {
    const attempt = await startQuizAttempt({
      quizId: assignedQuiz?.id,
      classroomId: assignedQuiz?.classroom_id || null,
      quizType: 'spelling',
      maxScore: initialResults.maxScore,
      detail: { mistakes: [], words_completed: 0, total_words: initialResults.totalWords }
    });
    activeAttemptId = attempt?.id || null;
  } catch (error) {
    console.warn('Could not start cloud quiz attempt:', error.message);
    if (assignedQuiz && /already been taken|maximum number of attempts|attempt limit/i.test(error.message || '')) {
      sessionStorage.removeItem('assignedQuiz');
      navigate('#/quiz');
      return;
    }
  }
  window.addEventListener('pagehide', handleQuizExit);

  container.innerHTML = `
    <div class="FSL-quiz FSL-container">
      <div class="FSL-quiz__layout">
        <div class="FSL-quiz__info FSL-card">
          <div class="FSL-quiz__header" style="margin-bottom: 0;"><div class="FSL-quiz__question-counter" id="word-counter"></div></div>

          <div class="FSL-text-center" style="margin: 1rem 0 0.5rem;">
            <span style="color: var(--color-text-light); font-size: 1rem; text-transform: uppercase; letter-spacing: 1px;">Spell this word</span>
            <div id="word-display" style="text-align: center; font-size: 2.5rem; font-weight: 700; color: var(--color-primary); letter-spacing: 3px; margin: 0.5rem 0;"></div>
          </div>

          <div class="FSL-word-progress" id="letter-progress" style="margin: 0 auto;"></div>
          <div class="FSL-quiz__actions">
            <button id="spelling-prev" class="FSL-btn FSL-btn--secondary" type="button">Previous</button>
            <button id="spelling-skip" class="FSL-btn FSL-btn--secondary" type="button">Skip</button>
            <button id="spelling-submit" class="FSL-btn FSL-btn--primary" type="button" hidden style="display:none" aria-hidden="true">Submit quiz</button>
          </div>

        </div>

        <div class="FSL-practice__camera">
          <div id="camera-container" style="width: 100%;"></div>
          <div id="prediction-container" style="width: 100%;"></div>
        </div>
      </div>
    </div>
  `;

  camera = createCamera(container.querySelector('#camera-container'));
  predictionDisplay = createPredictionDisplay(container.querySelector('#prediction-container'), { feedbackOnly: true });

  updateDisplay(container);
  bindQuizControls(container);

  try {
    await camera.start();
    startInferenceLoop((result) => onStablePrediction(result, container));
  } catch (err) {
    camera.showError('Could not start camera.');
  }
}

function updateDisplay(container) {
  if (!quiz) return;
  const current = quiz.getCurrentTarget();
  const counterEl = container.querySelector('#word-counter');
  const wordEl = container.querySelector('#word-display');
  const progressEl = container.querySelector('#letter-progress');
  
  if (counterEl && current) counterEl.textContent = `Word ${current.wordNumber} / ${current.totalWords}`;
  if (wordEl && current) wordEl.textContent = current.word;
  camera?.setFullscreenPrompt(current ? `Word ${current.wordNumber}: Spell ${current.word}${current.letter ? ` - sign ${current.letter}` : ''}` : '');
  
  if (progressEl && current) {
    progressEl.innerHTML = current.progress.map((p, idx) => {
      if (p.completed) {
        return `<div class="FSL-word-progress__letter FSL-word-progress__letter--completed">✓ ${p.letter}</div>`;
      }
      if (idx === current.letterIndex) {
        return `<div class="FSL-word-progress__letter FSL-word-progress__letter--current">${p.letter}</div>`;
      }
      return `<div class="FSL-word-progress__letter FSL-word-progress__letter--pending">○ ${p.letter}</div>`;
    }).join('');
  }
  answered = Boolean(current?.completed);
  updateQuizControls(container);
}

function updateQuizControls(container) {
  const current = quiz?.getCurrentTarget();
  if (!current) return;
  const previous = container.querySelector('#spelling-prev');
  const submit = container.querySelector('#spelling-submit');
  const isLastWord = current.wordNumber === current.totalWords;
  if (previous) previous.disabled = current.wordNumber === 1;
  setSubmitVisibility(submit, isLastWord);
}

function resetForCurrentWord(container) {
  clearTimeout(transitionTimer);
  if (engine) engine.reset();
  if (predictionDisplay) predictionDisplay.reset();
  camera?.clearFullscreenFeedback();
  updateDisplay(container);
}

function bindQuizControls(container) {
  container.querySelector('#spelling-prev')?.addEventListener('click', () => {
    if (!quiz) return;
    quiz.previousWord();
    resetForCurrentWord(container);
  });
  container.querySelector('#spelling-skip')?.addEventListener('click', () => {
    if (!quiz) return;
    const current = quiz.getCurrentTarget();
    if (current?.completed) quiz.nextWord();
    else quiz.skipWord();
    resetForCurrentWord(container);
    scheduleAttemptSave();
  });
  container.querySelector('#spelling-submit')?.addEventListener('click', completeQuiz);
}

function onStablePrediction(result, container) {
  if (answered || !quiz) return;

  const answerResult = quiz.checkAnswer(result.label);
  scheduleAttemptSave();

  if (answerResult.correct) {
    answered = true;
    predictionDisplay.showCorrect(answerResult.targetLetter);
    camera?.showFullscreenFeedback(answerResult.wordComplete ? 'Correct!' : `Correct - next letter.`, 'success');
    quiz.advanceLetter();
    
    if (answerResult.wordComplete) {
      updateDisplay(container);
      
      transitionTimer = setTimeout(() => {
        if (!quiz) return;
        const current = quiz.getCurrentTarget();
        if (current?.wordNumber === current?.totalWords) {
          updateQuizControls(container);
        } else {
          quiz.nextWord();
          if (engine) engine.reset();
          if (predictionDisplay) predictionDisplay.reset();
          camera?.clearFullscreenFeedback();
          answered = false;
          updateDisplay(container);
        }
      }, 1500);
    } else {
      updateDisplay(container);
      answered = true;
      setTimeout(() => {
        if (engine) engine.reset();
        if (predictionDisplay) predictionDisplay.reset();
        camera?.clearFullscreenFeedback();
        answered = false;
        updateDisplay(container);
      }, 1000);
    }
  } else if (result.rawPrediction && result.rawPrediction.isValidLetter) {
    predictionDisplay.showIncorrect(answerResult.targetLetter, answerResult.detectedLetter);
    camera?.showFullscreenFeedback('Wrong sign - try again.', 'error');
  }
}

function completeQuiz() {
  if (!quiz) return;
  const results = quiz.getResults();
  sessionStorage.setItem('quizResults', JSON.stringify({ type: 'spelling', quizId: activeAssignedQuiz?.id || null, assignedTitle: activeAssignedQuiz?.title || null, ...results }));
  saveQuizResult('spelling', results);
  if (activeAttemptId) {
    finalizeAttempt().catch(error => console.warn('Could not submit cloud attempt:', error.message));
  } else {
    saveAttempt({ quizId: activeAssignedQuiz?.id, classroomId: activeAssignedQuiz?.classroom_id || null, quizType: 'spelling', score: results.score, maxScore: results.maxScore, accuracy: results.accuracy, detail: { mistakes: results.mistakes, words_completed: results.wordsCompleted, total_words: results.totalWords } }).catch(error => console.warn('Could not save cloud attempt:', error.message));
  }
  if (activeAssignedQuiz) sessionStorage.removeItem('assignedQuiz');
  navigate('#/quiz/results');
}

function startInferenceLoop(onStablePredictionCallback) {
  lastFrameTime = performance.now();
  frameCount = 0;

  function loop() {
    if (!camera) return;
    const now = performance.now();
    frameCount++;
    if (now - lastFrameTime >= 1000) {
      currentFps = (frameCount * 1000) / (now - lastFrameTime);
      frameCount = 0;
      lastFrameTime = now;
    }

    const video = camera.getVideoElement();
    if (video && video.readyState >= 2) {
      const { landmarks, handDetected } = detectHands(video);
      if (handDetected && landmarks) {
        camera.drawLandmarks(landmarks);
        const result = engine.process(landmarks);
        predictionDisplay.update(result);
        
        updateDebugPanel({
          modelLoaded: isLoaded(),
          mediapipeReady: isReady(),
          cameraActive: camera.isActive(),
          handDetected: true,
          inputShape: getModelInfo().inputShape,
          outputClasses: getModelInfo().outputClasses,
          prediction: result.label,
          classIndex: result.rawPrediction?.index,
          confidence: result.confidence,
          fps: currentFps,
          topPredictions: result.rawPrediction?.topPredictions
        });

        if (result.isStable && result.label) {
          onStablePredictionCallback(result);
        }
      } else {
        camera.clearCanvas();
        const noHandResult = engine.process(null);
        predictionDisplay.update(noHandResult);
        
        updateDebugPanel({
          modelLoaded: isLoaded(),
          mediapipeReady: isReady(),
          cameraActive: camera.isActive(),
          handDetected: false,
          inputShape: getModelInfo().inputShape,
          outputClasses: getModelInfo().outputClasses,
          prediction: null,
          classIndex: null,
          confidence: null,
          fps: currentFps,
          topPredictions: null
        });
      }
    }
    animFrameId = requestAnimationFrame(loop);
  }
  loop();
}

export function unmount() {
  handleQuizExit();
  window.removeEventListener('pagehide', handleQuizExit);
  clearTimeout(progressSaveTimer);
  clearTimeout(transitionTimer);
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (camera) { camera.stop(); camera.destroy(); camera = null; }
  if (predictionDisplay) { predictionDisplay.destroy(); predictionDisplay = null; }
  engine = null;
  quiz = null;
  answered = false;
  activeAttemptId = null;
  attemptFinalized = false;
  activeAssignedQuiz = null;
}
