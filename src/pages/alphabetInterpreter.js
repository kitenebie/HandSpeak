import { detectHands, isReady } from '../ai/handLandmarker.js';
import { PredictionEngine } from '../ai/predictionEngine.js';
import { isLoaded, getModelInfo } from '../ai/FSLModel.js';
import { createCamera } from '../components/camera.js';
import { createPredictionDisplay } from '../components/predictionDisplay.js';
import { updateDebugPanel } from '../main.js';

let animationFrameId = null;
let camera = null;
let predictionDisplay = null;
let engine = null;
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;

export async function mount(container) {
  container.innerHTML = `
    <main class="FSL-interpreter FSL-container">
      <header class="FSL-interpreter__heading">
        <div><span class="FSL-eyebrow">Live camera tool</span><h1>Alphabet hand-sign interpreter</h1><p>Place one hand inside the frame and hold your sign steady. The detected FSL letter will appear beside the camera.</p></div>
        <span class="FSL-interpreter__privacy">Camera video stays on this device.</span>
      </header>
      <div class="FSL-interpreter__layout">
        <section class="FSL-interpreter__camera" aria-label="Camera feed"><div id="interpreter-camera"></div></section>
        <aside class="FSL-interpreter__result" aria-label="Interpreter result">
          <span class="FSL-eyebrow">Recognized sign</span>
          <div id="interpreter-prediction" aria-live="polite"></div>
          <div class="FSL-interpreter__tips"><h2>For a clear result</h2><ul><li>Keep your full hand visible.</li><li>Use even lighting.</li><li>Hold the sign steady for a moment.</li></ul></div>
        </aside>
      </div>
    </main>`;

  engine = new PredictionEngine({ stabilityFrames: 5, minConfidence: 0.75 });
  camera = createCamera(container.querySelector('#interpreter-camera'));
  camera.setWideMode(true);
  predictionDisplay = createPredictionDisplay(container.querySelector('#interpreter-prediction'), { showConfidence: true });

  try {
    await camera.start();
    startInferenceLoop();
  } catch (error) {
    console.error('Camera error:', error);
  }
}

function startInferenceLoop() {
  lastFrameTime = performance.now();
  frameCount = 0;

  function loop() {
    if (!camera) return;
    const now = performance.now();
    frameCount += 1;
    if (now - lastFrameTime >= 1000) {
      currentFps = (frameCount * 1000) / (now - lastFrameTime);
      frameCount = 0;
      lastFrameTime = now;
    }

    const video = camera.getVideoElement();
    if (video && video.readyState >= 2) {
      const { landmarks, handDetected } = detectHands(video);
      const result = handDetected && landmarks ? engine.process(landmarks) : engine.process(null);

      if (handDetected && landmarks) camera.drawLandmarks(landmarks);
      else camera.clearCanvas();

      predictionDisplay.update(result);
      updateDebugPanel({
        modelLoaded: isLoaded(),
        mediapipeReady: isReady(),
        cameraActive: camera.isActive(),
        handDetected: Boolean(handDetected),
        inputShape: getModelInfo().inputShape,
        outputClasses: getModelInfo().outputClasses,
        prediction: result.label,
        classIndex: result.rawPrediction?.index,
        confidence: result.confidence,
        fps: currentFps,
        topPredictions: result.rawPrediction?.topPredictions
      });
    }
    animationFrameId = requestAnimationFrame(loop);
  }

  loop();
}

export function unmount() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (camera) {
    camera.destroy();
    camera = null;
  }
  if (predictionDisplay) {
    predictionDisplay.destroy();
    predictionDisplay = null;
  }
  engine = null;
}
