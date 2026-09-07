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
const SAMPLE_INTERVAL_MS = 50;
const MIN_VALID_FRAMES = 10;
const CONFIDENCE_THRESHOLD = 0.60;

let animFrameId = null;
let camera = null;
let quiz = null;
let assignedQuiz = null;
let capture = null;
let processing = false;
let activeAttemptId = null;
let attemptFinalized = false;
let progressSaveTimer = null;
let transitionTimer = null;
let pageContainer = null;

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
  container.innerHTML = '<div class="asl-container"><div class="asl-card">Loading word-sign model and pose tracking…</div></div>';

  try {
    const [supportedWords] = await Promise.all([
      getSupportedWordSigns(),
      loadWordSignModel(),
      initWordLandmarkers()
    ]);
    if (pageContainer !== container) return;

    const supportedLookup = new Map(supportedWords.map(word => [normalizeWordSign(word), word]));
    const configuredWords = assignedQuiz
      ? (assignedQuiz.settings?.words || [])
      : supportedWords;
    const validWords = [...new Set(configuredWords
      .map(word => supportedLookup.get(normalizeWordSign(word)))
      .filter(Boolean))];

    if (!validWords.length) {
      throw new Error('This quiz has no words supported by the current model.');
    }

    const questionCount = Math.min(
      Number(assignedQuiz?.question_count || validWords.length),
      validWords.length
    );
    quiz = new WordSignQuizEngine({ words: validWords, questionCount });
    activeAttemptId = null;
    attemptFinalized = false;

    const initialResults = quiz.getResults();
    try {
      const attempt = await startQuizAttempt({
        quizId: assignedQuiz?.id || null,
        classroomId: assignedQuiz?.classroom_id || null,
        quizType: 'word_sign',
        maxScore: initialResults.maxScore,
        detail: { mistakes: [], total_questions: initialResults.totalQuestions }
      });
      activeAttemptId = attempt?.id || null;
    } catch (error) {
      if (assignedQuiz && /already been taken/i.test(error.message || '')) {
        sessionStorage.removeItem('assignedQuiz');
        navigate('#/quiz');
        return;
      }
      console.warn('Could not start cloud word quiz attempt:', error.message);
    }

    renderQuiz(container);
    window.addEventListener('pagehide', handleQuizExit);
  } catch (error) {
    container.innerHTML = `<div class="asl-container"><div class="asl-card"><h2>Word quiz unavailable</h2><p>${escape(error.message)}</p><button id="word-quiz-back" class="asl-btn asl-btn--secondary">Back to quizzes</button></div></div>`;
    container.querySelector('#word-quiz-back')?.addEventListener('click', () => navigate('#/quiz'));
  }
}

async function renderQuiz(container) {
  container.innerHTML = `
    <div class="asl-quiz asl-container">
      <div class="asl-quiz__layout">
        <section class="asl-quiz__info asl-card">
          <div class="asl-quiz__header"><div class="asl-quiz__question-counter" id="word-sign-counter"></div></div>
          <div class="asl-text-center" style="margin: 1.5rem 0;">
            <span class="asl-eyebrow">Show the complete sign for</span>
            <div class="asl-target-letter" id="word-sign-target" style="font-size: clamp(2rem, 7vw, 4rem); width: auto; padding: 0 1rem;"></div>
          </div>
          <p class="asl-muted asl-text-center">Keep your upper body and both hands inside the frame. Press the button, then perform the sign naturally.</p>
          <button id="word-sign-capture" class="asl-btn asl-btn--primary asl-btn--lg" type="button" disabled>Preparing camera…</button>
          <div id="word-sign-status" class="asl-form__message" aria-live="polite">Loading hand and posture tracking…</div>
        </section>
        <div class="asl-practice__camera"><div id="word-sign-camera" style="width:100%"></div></div>
      </div>
    </div>`;

  camera = createCamera(container.querySelector('#word-sign-camera'));
  updateQuestionDisplay();
  const captureButton = container.querySelector('#word-sign-capture');
  captureButton.addEventListener('click', beginCapture);

  try {
    await camera.start();
    captureButton.disabled = false;
    captureButton.textContent = 'Record sign (3 seconds)';
    setStatus('Ready. Press record when you are in position.');
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
  if (counter) counter.textContent = `Question ${current.questionNumber} / ${current.totalQuestions}`;
  if (target) target.textContent = current.word;
}

function setStatus(message, type = '') {
  const element = pageContainer?.querySelector('#word-sign-status');
  if (!element) return;
  element.className = `asl-form__message${type ? ` asl-form__message--${type}` : ''}`;
  element.textContent = message;
}

function beginCapture() {
  if (capture || processing || !camera?.isActive()) return;
  capture = {
    startedAt: performance.now(),
    lastSampleAt: 0,
    frames: [],
    validFrames: 0
  };
  const button = pageContainer.querySelector('#word-sign-capture');
  button.disabled = true;
  button.textContent = 'Recording…';
  setStatus('Recording—perform the complete sign now.');
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
          capture.frames.push(buildWordFrameFeatures(landmarks));
          if (landmarks.poseDetected && landmarks.handDetected) capture.validFrames++;
        }
        if (remaining <= 0) finishCapture();
      }

      if (now - lastDebugUpdate >= 500) {
        lastDebugUpdate = now;
        const info = getWordModelInfo();
        updateDebugPanel({
          modelLoaded: isWordModelLoaded(),
          mediapipeReady: areWordLandmarkersReady(),
          cameraActive: camera.isActive(),
          handDetected: landmarks.handDetected,
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
    if (completedCapture.validFrames < MIN_VALID_FRAMES) {
      setStatus('Not enough hand and posture landmarks were visible. Adjust your framing and record again.', 'error');
      enableCaptureButton('Try recording again');
      return;
    }

    const prediction = await predictWordSequence(completedCapture.frames, CONFIDENCE_THRESHOLD);
    const answer = quiz.checkAnswer(prediction.label);
    scheduleAttemptSave();
    if (answer.correct) {
      setStatus(`Correct! ${prediction.label} (${Math.round(prediction.confidence * 100)}%)`, 'success');
    } else {
      const detected = prediction.label === 'Unknown'
        ? 'No confident word detected'
        : `Detected ${prediction.label} (${Math.round(prediction.confidence * 100)}%)`;
      setStatus(`${detected}. The correct answer was ${answer.targetWord}.`, 'error');
    }

    transitionTimer = setTimeout(moveToNextQuestion, 1800);
  } catch (error) {
    console.error('Word-sign inference failed:', error);
    setStatus(`Could not analyze the sign: ${error.message}`, 'error');
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
  if (quiz.isComplete()) {
    completeQuiz();
    return;
  }
  updateQuestionDisplay();
  setStatus('Ready for the next word.');
  enableCaptureButton();
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
      detail: { mistakes: results.mistakes, total_questions: results.totalQuestions }
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
  pageContainer = null;
}
