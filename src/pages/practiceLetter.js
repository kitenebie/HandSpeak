import { detectHands } from '../ai/handLandmarker.js';
import { PredictionEngine } from '../ai/predictionEngine.js';
import { createCamera } from '../components/camera.js';
import { createPredictionDisplay } from '../components/predictionDisplay.js';
import { VALID_LETTERS, isValidLetterIndex } from '../data/alphabet.js';
import { saveLetterPracticed } from '../utils/storage.js';
import { navigate } from '../router.js';
import { updateDebugPanel } from '../main.js';
import { isLoaded, getModelInfo } from '../ai/aslModel.js';
import { isReady } from '../ai/handLandmarker.js';

let animFrameId = null;
let camera = null;
let predictionDisplay = null;
let engine = null;
let targetLetter = '';
let answered = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;
let feedbackTimer = null;

export async function mount(container, params) {
  targetLetter = params.letter ? params.letter.toUpperCase() : VALID_LETTERS[Math.floor(Math.random() * VALID_LETTERS.length)];
  answered = false;

  container.innerHTML = `
    <div class="asl-practice asl-container">
      <div class="asl-practice__layout">
        <div class="asl-practice__info asl-card">
          <div class="asl-text-center">
            <span style="color: var(--color-text-light); font-size: 1rem; text-transform: uppercase; letter-spacing: 1px;">Practice Letter</span>
            <div class="asl-target-letter" style="margin: 0.5rem 0;">${targetLetter}</div>
          </div>
        </div>
        <div class="asl-practice__camera">
          <div id="camera-container" style="width: 100%;"></div>
          <div id="prediction-container" style="width: 100%;"></div>
        </div>
      </div>
    </div>
  `;

  engine = new PredictionEngine({ stabilityFrames: 5, minConfidence: 0.75 });
  camera = createCamera(container.querySelector('#camera-container'));
  predictionDisplay = createPredictionDisplay(container.querySelector('#prediction-container'), { feedbackOnly: true });

  try {
    await camera.start();
    startInferenceLoop(onStablePrediction);
  } catch (err) {
    console.error('Camera error:', err);
    camera.showError('Could not start camera.');
  }
}

function onStablePrediction(result) {
  if (answered) return;

  if (result.label === targetLetter) {
    answered = true;
    predictionDisplay.showCorrect(result.label);
    saveLetterPracticed(targetLetter);
    const currentIndex = VALID_LETTERS.indexOf(targetLetter);
    const nextLetter = VALID_LETTERS[(currentIndex + 1) % VALID_LETTERS.length];
    feedbackTimer = setTimeout(() => navigate('#/practice/letter/' + nextLetter), 1200);
  } else if (result.rawPrediction && isValidLetterIndex(result.rawPrediction.index)) {
    predictionDisplay.showIncorrect(targetLetter, result.label);
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
  answered = false;
  targetLetter = '';
}
