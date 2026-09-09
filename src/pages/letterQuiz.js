import { detectHands } from '../ai/handLandmarker.js';
import { PredictionEngine } from '../ai/predictionEngine.js';
import { createCamera } from '../components/camera.js';
import { createPredictionDisplay } from '../components/predictionDisplay.js';
import { LetterQuizEngine, DIFFICULTY } from '../utils/quiz.js';
import { saveQuizResult } from '../utils/storage.js';
import { navigate } from '../router.js';
import { updateDebugPanel } from '../main.js';
import { isLoaded, getModelInfo } from '../ai/aslModel.js';
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

function getAttemptPayload() {
  const results = quiz?.getResults();
  if (!results) return null;
  return {
    score: results.score,
    maxScore: results.maxScore,
    accuracy: results.accuracy,
    detail: { mistakes: results.mistakes, total_questions: results.totalQuestions }
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
    const range = assigned.settings || {};
    const questions = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(letter => letter >= (range.range_start || 'A') && letter <= (range.range_end || 'Z'));
    startQuiz(container, Math.min(assigned.question_count, questions.length), 'normal', questions, assigned);
    return;
  }
  navigate('#/quiz');
}

function getAssignedQuiz() {
  try {
    const quiz = JSON.parse(sessionStorage.getItem('assignedQuiz') || 'null');
    return quiz?.quiz_type === 'alphabet' ? quiz : null;
  } catch { return null; }
}

async function startQuiz(container, questionCount, difficulty, questions = null, assignedQuiz = null) {
  quiz = new LetterQuizEngine({ questionCount, difficulty, questions });
  engine = new PredictionEngine(DIFFICULTY[difficulty] || DIFFICULTY.normal);
  answered = false;
  activeAttemptId = null;
  attemptFinalized = false;
  const initialResults = quiz.getResults();
  try {
    const attempt = await startQuizAttempt({
      quizId: assignedQuiz?.id,
      classroomId: assignedQuiz?.classroom_id || null,
      quizType: 'alphabet',
      maxScore: initialResults.maxScore,
      detail: { mistakes: [], total_questions: initialResults.totalQuestions }
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
    <div class="asl-quiz asl-container">
      <div class="asl-quiz__layout">
        <div class="asl-quiz__info asl-card">
          <div class="asl-quiz__header" style="margin-bottom: 0;"><div class="asl-quiz__question-counter" id="question-counter"></div></div>
          
          <div class="asl-text-center" style="margin: 1.5rem 0;">
            <span style="color: var(--color-text-light); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px;">Show the sign for</span>
            <div class="asl-target-letter" id="target-letter-display" style="margin: 0.5rem 0;"></div>
          </div>

        </div>

        <div class="asl-practice__camera">
          <div id="camera-container" style="width: 100%;"></div>
          <div id="prediction-container" style="width: 100%;"></div>
        </div>
      </div>
    </div>
  `;

  camera = createCamera(container.querySelector('#camera-container'));
  predictionDisplay = createPredictionDisplay(container.querySelector('#prediction-container'), { feedbackOnly: true });

  updateQuestionDisplay(container);

  try {
    await camera.start();
    startInferenceLoop((result) => onStablePrediction(result, container));
  } catch (err) {
    camera.showError('Could not start camera.');
  }
}

function updateQuestionDisplay(container) {
  if (!quiz) return;
  const current = quiz.getCurrentQuestion();
  const counterEl = container.querySelector('#question-counter');
  const targetEl = container.querySelector('#target-letter-display');
  
  if (counterEl && current) counterEl.textContent = `Question ${current.questionNumber} / ${current.totalQuestions}`;
  if (targetEl && current) targetEl.textContent = current.letter;
}

function onStablePrediction(result, container) {
  if (answered || !quiz) return;

  const answerResult = quiz.checkAnswer(result.label);
  scheduleAttemptSave();

  if (answerResult.correct) {
    answered = true;
    predictionDisplay.showCorrect(result.label);
    updateQuestionDisplay(container);

    setTimeout(() => {
      if (!quiz) return;
      if (quiz.isComplete()) {
        const results = quiz.getResults();
        sessionStorage.setItem('quizResults', JSON.stringify({ type: 'letter', quizId: assignedQuiz?.id || null, assignedTitle: assignedQuiz?.title || null, ...results }));
        saveQuizResult('letter', results);
        if (activeAttemptId) {
          finalizeAttempt().catch(error => console.warn('Could not submit cloud attempt:', error.message));
        } else {
          saveAttempt({ quizId: assignedQuiz?.id, classroomId: assignedQuiz?.classroom_id || null, quizType: 'alphabet', score: results.score, maxScore: results.maxScore, accuracy: results.accuracy, detail: { mistakes: results.mistakes, total_questions: results.totalQuestions } }).catch(error => console.warn('Could not save cloud attempt:', error.message));
        }
        if (assignedQuiz) sessionStorage.removeItem('assignedQuiz');
        navigate('#/quiz/results');
      } else {
        quiz.nextQuestion();
        if (engine) engine.reset();
        if (predictionDisplay) predictionDisplay.reset();
        answered = false;
        updateQuestionDisplay(container);
      }
    }, 1500);
  } else if (result.rawPrediction && result.rawPrediction.isValidLetter) {
    predictionDisplay.showIncorrect(answerResult.targetLetter, answerResult.detectedLetter);
  }
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
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (camera) { camera.stop(); camera.destroy(); camera = null; }
  if (predictionDisplay) { predictionDisplay.destroy(); predictionDisplay = null; }
  engine = null;
  quiz = null;
  answered = false;
  activeAttemptId = null;
  attemptFinalized = false;
}
