import { detectHands } from '../ai/handLandmarker.js';
import { PredictionEngine } from '../ai/predictionEngine.js';
import { createCamera } from '../components/camera.js';
import { createPredictionDisplay } from '../components/predictionDisplay.js';
import { WORDS } from '../data/words.js';
import { saveWordPracticed } from '../utils/storage.js';
import { navigate } from '../router.js';
import { updateDebugPanel } from '../main.js';
import { isLoaded, getModelInfo } from '../ai/aslModel.js';
import { isReady } from '../ai/handLandmarker.js';

let animFrameId = null;
let camera = null;
let predictionDisplay = null;
let engine = null;
let currentWord = '';
let letters = [];
let currentLetterIndex = 0;
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;
let feedbackTimer = null;

export async function mount(container, params) {
  if (!params.word) {
    // Show word picker
    let wordsHtml = WORDS.map(w => `<button class="asl-word-picker__word" data-word="${w}">${w}</button>`).join('');
    container.innerHTML = `
      <div class="asl-word-picker asl-container">
        <h1 class="asl-text-center">Word Practice</h1>
        <p class="asl-text-center" style="color: var(--color-text-light);">Choose a word to practice fingerspelling letter by letter</p>
        <div class="asl-word-picker__grid" style="margin-top: 2rem;">
          ${wordsHtml}
        </div>
      </div>
    `;
    container.querySelectorAll('.asl-word-picker__word').forEach(btn => {
      btn.addEventListener('click', (e) => {
        navigate('#/practice/word/' + e.target.dataset.word);
      });
    });
    return;
  }

  currentWord = params.word.toUpperCase();
  letters = currentWord.split('');
  currentLetterIndex = 0;

  container.innerHTML = `
    <div class="asl-practice asl-container">
      <div class="asl-practice__layout">
        <div class="asl-practice__info asl-card">
          <div class="asl-text-center">
            <span style="color: var(--color-text-light); font-size: 1rem; text-transform: uppercase; letter-spacing: 1px;">Practice Word</span>
            <h2 style="font-size: 2.2rem; color: var(--color-primary); letter-spacing: 2px; margin: 0.5rem 0;">${currentWord}</h2>
          </div>
          
          <div class="asl-word-progress" id="word-progress-container"></div>
          
        </div>

        <div class="asl-practice__camera">
          <div id="camera-container" style="width: 100%;"></div>
          <div id="prediction-container" style="width: 100%;"></div>
        </div>
      </div>
    </div>
  `;

  renderProgress(container);

  engine = new PredictionEngine({ stabilityFrames: 5, minConfidence: 0.75 });
  camera = createCamera(container.querySelector('#camera-container'));
  predictionDisplay = createPredictionDisplay(container.querySelector('#prediction-container'), { feedbackOnly: true });

  try {
    await camera.start();
    startInferenceLoop(result => onStablePrediction(result, container));
  } catch (err) {
    camera.showError('Could not start camera.');
  }
}

function renderProgress(container) {
  const progressContainer = container.querySelector('#word-progress-container');
  if (!progressContainer) return;
  
  let html = '';
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i];
    if (i < currentLetterIndex) {
      html += `<div class="asl-word-progress__letter asl-word-progress__letter--completed">✓ ${l}</div>`;
    } else if (i === currentLetterIndex) {
      html += `<div class="asl-word-progress__letter asl-word-progress__letter--current">${l}</div>`;
    } else {
      html += `<div class="asl-word-progress__letter asl-word-progress__letter--pending">○ ${l}</div>`;
    }
  }
  progressContainer.innerHTML = html;
}

function onStablePrediction(result, container) {
  if (currentLetterIndex >= letters.length) return;

  if (result.label === letters[currentLetterIndex]) {
    predictionDisplay.showCorrect(result.label);
    const nextIndex = currentLetterIndex + 1;
    currentLetterIndex = nextIndex;
    
    if (currentLetterIndex >= letters.length) {
      // Done
      saveWordPracticed(currentWord);
      renderProgress(container);
      feedbackTimer = setTimeout(() => navigate('#/practice/word'), 1200);
    } else {
      renderProgress(container);
      setTimeout(() => {
        if (engine) engine.reset();
        if (predictionDisplay) predictionDisplay.reset();
      }, 1000);
    }
  } else if (result.rawPrediction?.isValidLetter) {
    predictionDisplay.showIncorrect(letters[currentLetterIndex], result.label);
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => predictionDisplay?.reset(), 900);
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
  clearTimeout(feedbackTimer);
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (camera) { camera.stop(); camera.destroy(); camera = null; }
  if (predictionDisplay) { predictionDisplay.destroy(); predictionDisplay = null; }
  engine = null;
  currentWord = '';
  letters = [];
  currentLetterIndex = 0;
}
