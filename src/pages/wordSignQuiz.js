import { createCamera } from '../components/camera.js';
import { navigate } from '../router.js';
import { saveQuizResult } from '../utils/storage.js';
import { WordSignQuizEngine } from '../utils/quiz.js';
import {
  buildWordFrameFeatures,
  getWordModelInfo,
  isWordModelLoaded,
  loadWordSignModel,
  predictWordSequence
} from '../ai/wordSignModel.js';
import {
  areWordLandmarkersReady,
  detectWordLandmarks,
  initWordLandmarkers,
  WORD_HAND_CONNECTIONS,
  WORD_POSE_CONNECTIONS
} from '../ai/wordLandmarkers.js';
import { getSupportedWordSigns, normalizeWordSign } from '../data/wordSigns.js';
import { updateDebugPanel } from '../main.js';
import { saveAttempt, startQuizAttempt, submitQuizAttempt, updateQuizAttempt } from '../lib/classroom.js';

const CAPTURE_DURATION_MS = 3000;
const COUNTDOWN_START_SECONDS = 7;
const SAMPLE_INTERVAL_MS = 50;
const MIN_VALID_HAND_FRAMES = 8;
const CONFIDENCE_THRESHOLD = 0.60;

let animFrameId = null;
let camera = null;
let quiz = null;
let assignedQuiz = null;
let capture = null;
let countdownTimer = null;
let countdownRemaining = null;
let processing = false;
let activeAttemptId = null;
let attemptFinalized = false;
let progressSaveTimer = null;
let transitionTimer = null;
let pageContainer = null;
let activeWordQuizType = 'single_word';

function setSubmitVisibility(button, isVisible) {
  if (!button) return;
  button.hidden = !isVisible;
  button.style.display = isVisible ? '' : 'none';
  button.setAttribute('aria-hidden', String(!isVisible));
}

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function getAssignedQuiz() {
  try {
    const value = JSON.parse(sessionStorage.getItem('assignedQuiz') || 'null');
    return value?.quiz_type === 'word_sign' ? value : null;
  } catch {
    return null;
  }
}

function getAttemptPayload() {
  const results = quiz?.getResults();
  if (!results) return null;
  return {
    score: results.score,
    maxScore: results.maxScore,
    accuracy: results.accuracy,
    detail: { mistakes: results.mistakes, total_questions: results.totalQuestions, word_quiz_type: results.quizType }
  };
}

async function saveAttemptProgress() {
  const payload = getAttemptPayload();
  if (!activeAttemptId || !payload || attemptFinalized) return;
  await updateQuizAttempt(activeAttemptId, payload);
}

function scheduleAttemptSave() {
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(() => {
    saveAttemptProgress().catch(error => console.warn('Could not save word quiz progress:', error.message));
  }, 250);
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
  finalizeAttempt().catch(error => console.warn('Could not auto-submit word quiz:', error.message));
}

export async function mount(container) {
  pageContainer = container;
  assignedQuiz = getAssignedQuiz();
  container.innerHTML = '<div class="FSL-container"><div class="FSL-card">Loading word-sign model and pose tracking…</div></div>';

  try {
    const [supportedWords] = await Promise.all([
      getSupportedWordSigns(),
      loadWordSignModel(),
      initWordLandmarkers()
    ]);
    if (pageContainer !== container) return;

    const supportedLookup = new Map(supportedWords.map(word => [normalizeWordSign(word), word]));
    activeWordQuizType = assignedQuiz?.settings?.quiz_type === 'two_words' ? 'two_words' : 'single_word';
    const configuredWords = assignedQuiz
      ? (assignedQuiz.settings?.words || [])
      : supportedWords;
    const normalizedWords = configuredWords
      .map(word => supportedLookup.get(normalizeWordSign(word)))
      .filter(Boolean);
    const validWords = activeWordQuizType === 'two_words'
      ? normalizedWords.slice(0, 2)
      : [...new Set(normalizedWords)];

    if (!validWords.length || (activeWordQuizType === 'two_words' && validWords.length !== 2)) {
      throw new Error('This quiz has no words supported by the current model.');
    }

    const questionCount = activeWordQuizType === 'two_words' ? 1 : Math.min(
      Number(assignedQuiz?.question_count || validWords.length),
      validWords.length
    );
    quiz = new WordSignQuizEngine({ words: validWords, questionCount, quizType: activeWordQuizType });
    activeAttemptId = null;
    attemptFinalized = false;

    const initialResults = quiz.getResults();
    try {
      const attempt = await startQuizAttempt({
        quizId: assignedQuiz?.id || null,
        classroomId: assignedQuiz?.classroom_id || null,
        quizType: 'word_sign',
        maxScore: initialResults.maxScore,
        detail: { mistakes: [], total_questions: initialResults.totalQuestions, word_quiz_type: initialResults.quizType }
      });
      activeAttemptId = attempt?.id || null;
    } catch (error) {
      if (assignedQuiz && /already been taken|maximum number of attempts|attempt limit/i.test(error.message || '')) {
        sessionStorage.removeItem('assignedQuiz');
        navigate('#/quiz');
        return;
      }
      console.warn('Could not start cloud word quiz attempt:', error.message);
    }

    renderQuiz(container);
    window.addEventListener('pagehide', handleQuizExit);
  } catch (error) {
    container.innerHTML = `<div class="FSL-container"><div class="FSL-card"><h2>Word quiz unavailable</h2><p>${escape(error.message)}</p><button id="word-quiz-back" class="FSL-btn FSL-btn--secondary">Back to quizzes</button></div></div>`;
    container.querySelector('#word-quiz-back')?.addEventListener('click', () => navigate('#/quiz'));
  }
}

async function renderQuiz(container) {
  container.innerHTML = `
    <div class="FSL-quiz FSL-container">
      <div class="FSL-quiz__layout">
        <section class="FSL-quiz__info FSL-card">
          <div class="FSL-quiz__header"><div class="FSL-quiz__question-counter" id="word-sign-counter"></div></div>
          <div class="FSL-text-center" style="margin: 1.5rem 0;">
            <span class="FSL-eyebrow">Sign:</span>
            <div class="FSL-target-letter" id="word-sign-target" style="font-size: clamp(2rem, 7vw, 4rem); width: auto; padding: 0 1rem;"></div>
            <div class="FSL-word-sequence" id="word-sign-sequence" aria-label="Word signing progress"></div>
          </div>
          <p class="FSL-muted FSL-text-center">Keep your upper body and both hands inside the frame. Press the button, then perform the sign naturally.</p>
          <button id="word-sign-capture" class="FSL-btn FSL-btn--primary FSL-btn--lg" type="button" disabled>Preparing camera…</button>
          <div id="word-sign-status" class="FSL-form__message" aria-live="polite">Loading hand and posture tracking…</div>
          <div class="FSL-quiz__actions">
            <button id="word-sign-prev" class="FSL-btn FSL-btn--secondary" type="button">Previous</button>
            <button id="word-sign-skip" class="FSL-btn FSL-btn--secondary" type="button">Skip</button>
            <button id="word-sign-submit" class="FSL-btn FSL-btn--primary" type="button" hidden style="display:none" aria-hidden="true">Submit quiz</button>
          </div>
        </section>
        <div class="FSL-practice__camera"><div id="word-sign-camera" style="width:100%"></div></div>
      </div>
    </div>`;

  camera = createCamera(container.querySelector('#word-sign-camera'));
  camera.setWideMode(true);
  updateQuestionDisplay();
  bindQuizControls();
  const captureButton = container.querySelector('#word-sign-capture');
  captureButton.addEventListener('click', beginCapture);

  try {
    await camera.start();
    captureButton.disabled = false;
    captureButton.textContent = 'Record sign (3 seconds)';
    const current = quiz.getCurrentQuestion();
    setStatus(`Ready. Sign ${current.expectedWord} first.`);
    startInferenceLoop();
  } catch {
    setStatus('Camera access is required for this quiz.', 'error');
  }
}

function updateQuestionDisplay() {
  const current = quiz?.getCurrentQuestion();
  if (!current || !pageContainer) return;
  const counter = pageContainer.querySelector('#word-sign-counter');
  const target = pageContainer.querySelector('#word-sign-target');
  const sequence = pageContainer.querySelector('#word-sign-sequence');
  if (counter) counter.textContent = `Question ${current.questionNumber} / ${current.totalQuestions}`;
  if (target) target.textContent = current.word;
  camera?.setFullscreenPrompt(`Question ${current.questionNumber}: Sign ${current.word}`);
  if (sequence) {
    sequence.innerHTML = current.progress.map((item, index) => `
      ${index ? '<span class="FSL-word-sequence__arrow" aria-hidden="true">→</span>' : ''}
      <span class="FSL-word-sequence__item${item.completed ? ' FSL-word-sequence__item--complete' : ''}${index === current.currentWordIndex ? ' FSL-word-sequence__item--current' : ''}">
        ${item.completed ? '<span aria-hidden="true">✓</span> ' : ''}${escape(item.word)}
      </span>`).join('');
  }
  updateQuizControls();
}

function updateQuizControls() {
  const current = quiz?.getCurrentQuestion();
  if (!current || !pageContainer) return;
  const previous = pageContainer.querySelector('#word-sign-prev');
  const submit = pageContainer.querySelector('#word-sign-submit');
  const isLastQuestion = current.questionNumber === current.totalQuestions;
  if (previous) previous.disabled = current.questionNumber === 1;
  setSubmitVisibility(submit, isLastQuestion);
}

function resetCaptureState() {
  clearTimeout(transitionTimer);
  clearCountdown();
  capture = null;
  processing = false;
  camera?.clearFullscreenFeedback();
}

function resetForCurrentQuestion() {
  resetCaptureState();
  updateQuestionDisplay();
  const current = quiz?.getCurrentQuestion();
  if (current?.correct) {
    setStatus('This question is already answered.');
    enableCaptureButton('Answered');
    const button = pageContainer?.querySelector('#word-sign-capture');
    if (button) button.disabled = true;
    return;
  }
  const expectedWord = current?.expectedWord;
  setStatus(`Ready. Sign ${expectedWord}.`);
  enableCaptureButton();
}

function bindQuizControls() {
  pageContainer.querySelector('#word-sign-prev')?.addEventListener('click', () => {
    if (!quiz) return;
    quiz.previousQuestion();
    resetForCurrentQuestion();
  });
  pageContainer.querySelector('#word-sign-skip')?.addEventListener('click', () => {
    if (!quiz) return;
    const current = quiz.getCurrentQuestion();
    if (current?.correct) quiz.nextQuestion();
    else quiz.skipQuestion();
    resetForCurrentQuestion();
    scheduleAttemptSave();
  });
  pageContainer.querySelector('#word-sign-submit')?.addEventListener('click', completeQuiz);
}

function setStatus(message, type = '') {
  const element = pageContainer?.querySelector('#word-sign-status');
  if (!element) return;
  element.className = `FSL-form__message${type ? ` FSL-form__message--${type}` : ''}`;
  element.textContent = message;
}

function beginCapture() {
  if (capture || countdownTimer || processing || !camera?.isActive()) return;
  countdownRemaining = COUNTDOWN_START_SECONDS;
  camera.showCountdown(countdownRemaining);
  updateCountdownStatus();
  const button = pageContainer.querySelector('#word-sign-capture');
  button.disabled = true;
  button.textContent = `Starting in ${countdownRemaining}…`;

  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining >= 0) {
      camera?.showCountdown(countdownRemaining);
      updateCountdownStatus();
      if (button) button.textContent = countdownRemaining ? `Starting in ${countdownRemaining}…` : 'Starting…';
      return;
    }
    clearCountdown();
    startRecordingCapture();
  }, 1000);
}

function updateCountdownStatus() {
  const expectedWord = quiz?.getCurrentQuestion()?.expectedWord;
  const prompt = expectedWord ? ` Get ready to sign ${expectedWord}.` : '';
  setStatus(`Recording starts in ${countdownRemaining}.${prompt}`);
}

function clearCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  countdownRemaining = null;
  camera?.hideCountdown();
}

function startRecordingCapture() {
  if (capture || processing || !camera?.isActive()) return;
  capture = {
    startedAt: performance.now(),
    lastSampleAt: 0,
    frames: [],
    validHandFrames: 0,
    validPoseFrames: 0
  };
  const button = pageContainer.querySelector('#word-sign-capture');
  button.disabled = true;
  button.textContent = 'Recording…';
  const expectedWord = quiz?.getCurrentQuestion()?.expectedWord;
  setStatus(`Recording—perform the sign for ${expectedWord || 'the expected word'} now.`);
}

function startInferenceLoop() {
  let lastDebugUpdate = 0;

  const loop = now => {
    if (!camera) return;
    const video = camera.getVideoElement();
    if (video?.readyState >= 2) {
      const landmarks = detectWordLandmarks(video, now);
      camera.drawWordLandmarks({
        hands: landmarks.hands,
        pose: landmarks.pose,
        handConnections: WORD_HAND_CONNECTIONS,
        poseConnections: WORD_POSE_CONNECTIONS
      });

      if (capture) {
        const remaining = Math.max(0, CAPTURE_DURATION_MS - (now - capture.startedAt));
        setStatus(`Recording… ${(remaining / 1000).toFixed(1)} seconds remaining`);
        if (now - capture.lastSampleAt >= SAMPLE_INTERVAL_MS) {
          capture.lastSampleAt = now;
          if (landmarks.handDetected) {
            capture.frames.push(buildWordFrameFeatures(landmarks));
            capture.validHandFrames++;
            if (landmarks.poseDetected) capture.validPoseFrames++;
          }
        }
        if (remaining <= 0) finishCapture();
      }

      if (now - lastDebugUpdate >= 500) {
        lastDebugUpdate = now;
        const info = getWordModelInfo();
        camera.showStatus(landmarks.handDetected
          ? `Camera Status: Active - tracking ${landmarks.handCount} hand${landmarks.handCount === 1 ? '' : 's'}`
          : 'Camera Status: Active - move both hands fully into frame');
        updateDebugPanel({
          modelLoaded: isWordModelLoaded(),
          mediapipeReady: areWordLandmarkersReady(),
          cameraActive: camera.isActive(),
          handDetected: landmarks.handDetected,
          poseDetected: landmarks.poseDetected,
          inputShape: info.inputShape?.slice(1).join(' × '),
          outputClasses: info.labels?.length,
          prediction: processing ? 'Processing sequence' : null
        });
      }
    }
    animFrameId = requestAnimationFrame(loop);
  };
  animFrameId = requestAnimationFrame(loop);
}

async function finishCapture() {
  if (!capture || processing) return;
  const completedCapture = capture;
  capture = null;
  processing = true;
  setStatus('Analyzing your hand movement and posture…');

  try {
    if (completedCapture.validHandFrames < MIN_VALID_HAND_FRAMES) {
      setStatus('Not enough hand landmarks were visible. Keep both hands inside the camera box and record again.', 'error');
      camera?.showFullscreenFeedback('Hands not visible enough.', 'error');
      enableCaptureButton('Try recording again');
      return;
    }

    const prediction = await predictWordSequence(completedCapture.frames, CONFIDENCE_THRESHOLD);
    const answer = quiz.checkAnswer(prediction.label);
    if (answer.correct) {
      updateQuestionDisplay();
      if (answer.questionComplete) {
        scheduleAttemptSave();
        setStatus(`Correct! ${answer.targetPhrase} (${Math.round(prediction.confidence * 100)}% on the final sign)`, 'success');
        camera?.showFullscreenFeedback('Correct!', 'success');
        transitionTimer = setTimeout(moveAfterAnsweredQuestion, 1800);
      } else {
        setStatus(`${prediction.label} detected. Next, sign ${answer.nextExpectedWord}.`, 'success');
        camera?.showFullscreenFeedback(`Correct - next: ${answer.nextExpectedWord}.`, 'success');
        enableCaptureButton(`Record ${answer.nextExpectedWord} (3 seconds)`);
      }
    } else {
      const detected = prediction.label === 'Unknown'
        ? 'No confident word detected'
        : `Detected ${prediction.label} (${Math.round(prediction.confidence * 100)}%)`;
      if (answer.retryRequired) {
        setStatus(`${detected}. Expected ${answer.targetWord}. Try that word again.`, 'error');
        camera?.showFullscreenFeedback('Wrong sign - try again.', 'error');
        enableCaptureButton(`Try ${answer.targetWord} again`);
      } else {
        scheduleAttemptSave();
        setStatus(`${detected}. The correct answer was ${answer.targetWord}.`, 'error');
        camera?.showFullscreenFeedback('Wrong sign.', 'error');
        transitionTimer = setTimeout(moveAfterAnsweredQuestion, 1800);
      }
    }
  } catch (error) {
    console.error('Word-sign inference failed:', error);
    setStatus(`Could not analyze the sign: ${error.message}`, 'error');
    camera?.showFullscreenFeedback('Could not analyze the sign.', 'error');
    enableCaptureButton('Try recording again');
  } finally {
    processing = false;
  }
}

function enableCaptureButton(label = 'Record sign (3 seconds)') {
  const button = pageContainer?.querySelector('#word-sign-capture');
  if (!button) return;
  button.disabled = false;
  button.textContent = label;
}

function moveToNextQuestion() {
  if (!quiz) return;
  quiz.nextQuestion();
  camera?.clearFullscreenFeedback();
  updateQuestionDisplay();
  const expectedWord = quiz.getCurrentQuestion()?.expectedWord;
  setStatus(`Ready. Sign ${expectedWord}.`);
  enableCaptureButton();
}

function moveAfterAnsweredQuestion() {
  const current = quiz?.getCurrentQuestion();
  if (!current) return;
  if (current.questionNumber === current.totalQuestions) {
    updateQuizControls();
    enableCaptureButton(current.correct ? 'Answered' : 'Try recording again');
    const button = pageContainer?.querySelector('#word-sign-capture');
    if (button && current.correct) button.disabled = true;
    setStatus(current.correct ? 'Last question answered. Submit when you are ready.' : 'Last question done. Submit or record again.');
    return;
  }
  moveToNextQuestion();
}

function completeQuiz() {
  const results = quiz.getResults();
  sessionStorage.setItem('quizResults', JSON.stringify({
    type: 'word_sign',
    quizId: assignedQuiz?.id || null,
    assignedTitle: assignedQuiz?.title || 'Word sign quiz',
    ...results
  }));
  saveQuizResult('word_sign', results);

  if (activeAttemptId) {
    finalizeAttempt().catch(error => console.warn('Could not submit word quiz:', error.message));
  } else {
    saveAttempt({
      quizId: assignedQuiz?.id || null,
      classroomId: assignedQuiz?.classroom_id || null,
      quizType: 'word_sign',
      score: results.score,
      maxScore: results.maxScore,
      accuracy: results.accuracy,
      detail: { mistakes: results.mistakes, total_questions: results.totalQuestions, word_quiz_type: results.quizType }
    }).catch(error => console.warn('Could not save word quiz:', error.message));
  }
  if (assignedQuiz) sessionStorage.removeItem('assignedQuiz');
  navigate('#/quiz/results');
}

export function unmount() {
  handleQuizExit();
  window.removeEventListener('pagehide', handleQuizExit);
  clearTimeout(progressSaveTimer);
  clearTimeout(transitionTimer);
  clearCountdown();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = null;
  capture = null;
  processing = false;
  if (camera) {
    camera.destroy();
    camera = null;
  }
  quiz = null;
  assignedQuiz = null;
  activeAttemptId = null;
  attemptFinalized = false;
  activeWordQuizType = 'single_word';
  pageContainer = null;
}
