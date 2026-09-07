# ASL Learning App — Architecture & Interface Specification

## Project Root
`c:\Users\kenne\Desktop\em-res\ASL-OD\handspeak`

## Tech Stack
- Vanilla JS with ES modules, bundled by Vite
- npm for package management
- Source code in `src/`
- Static assets in `public/` (models served at `/models/asl/`)
- TensorFlow.js (`@tensorflow/tfjs`) for model inference
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) for hand landmarks

## Directory Layout
```
handspeak/
├── index.html
├── package.json
├── vite.config.js
├── public/models/asl/{model.json, group1-shard1of1.bin, labels.json}
├── src/
│   ├── main.js
│   ├── router.js
│   ├── style.css
│   ├── ai/
│   │   ├── aslModel.js
│   │   ├── handLandmarker.js
│   │   ├── predictionEngine.js
│   │   └── cameraManager.js
│   ├── data/
│   │   ├── alphabet.js
│   │   └── words.js
│   ├── utils/
│   │   ├── storage.js
│   │   ├── scoring.js
│   │   └── quiz.js
│   ├── components/
│   │   ├── camera.js
│   │   ├── predictionDisplay.js
│   │   ├── debugPanel.js
│   │   ├── navbar.js
│   │   ├── progressBar.js
│   │   └── letterCard.js
│   └── pages/
│       ├── home.js
│       ├── alphabet.js
│       ├── practiceLetter.js
│       ├── practiceWord.js
│       ├── letterQuiz.js
│       ├── spellingQuiz.js
│       └── quizResults.js
```

---

## CSS Design System

All CSS variables are on `:root` in `src/style.css`. Every component uses these variables.

```css
--color-primary: #6C63FF;
--color-primary-dark: #5A52D5;
--color-primary-light: #8B83FF;
--color-secondary: #2EC4B6;
--color-success: #28A745;
--color-danger: #DC3545;
--color-warning: #FFC107;
--color-bg: #F8F9FA;
--color-bg-dark: #1A1A2E;
--color-surface: #FFFFFF;
--color-text: #212529;
--color-text-light: #6C757D;
--color-text-muted: #ADB5BD;
--color-border: #DEE2E6;
--shadow-sm: 0 2px 4px rgba(0,0,0,0.08);
--shadow-md: 0 4px 12px rgba(0,0,0,0.12);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.16);
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--font-family: 'Inter', system-ui, -apple-system, sans-serif;
--transition: all 0.3s ease;
```

### CSS Class Naming
BEM-style with `asl-` prefix:
- Block: `.asl-camera`, `.asl-navbar`, `.asl-quiz`
- Element: `.asl-camera__video`, `.asl-camera__canvas`
- Modifier: `.asl-btn--primary`, `.asl-letter-card--practiced`
- States: `.asl-correct`, `.asl-incorrect`, `.asl-loading`
- Utility: `.asl-container`, `.asl-grid`, `.asl-text-center`

---

## HTML Shell (index.html)

```html
<div id="app">
  <!-- navbar rendered here by main.js -->
  <main id="page-content">
    <!-- page content rendered here by router -->
  </main>
  <!-- debug panel rendered here by main.js -->
</div>
```

---

## Router Interface — `src/router.js`

```js
// Initialize router with route config
export function initRouter(routes, container);

// Navigate programmatically
export function navigate(path);

// Get current path
export function getCurrentPath();
```

**Route config format:**
```js
const routes = {
  '/': { mount, unmount },
  '/learn': { mount, unmount },
  '/learn/:letter': { mount, unmount },
  '/practice/letter': { mount, unmount },
  '/practice/letter/:letter': { mount, unmount },
  '/practice/word': { mount, unmount },
  '/practice/word/:word': { mount, unmount },
  '/quiz/letter': { mount, unmount },
  '/quiz/spelling': { mount, unmount },
  '/quiz/results': { mount, unmount },
};
```

Routes use hash: `#/`, `#/learn`, `#/learn/A`, `#/practice/letter/B`, etc.

Each page module exports:
- `mount(container: HTMLElement, params: object)` — called when route matches. `params` has route params (e.g., `{ letter: 'A' }`)
- `unmount()` — called on navigation away. Must clean up listeners, intervals, camera, etc.

---

## AI Layer Interfaces

### `src/ai/aslModel.js`

```js
// Load TF.js graph model (call once at app start)
export async function loadModel();

// Run prediction on 21 hand landmarks
// landmarks = array of 21 objects with {x, y, z}
// Returns: { label: string, index: number, confidence: number,
//            topPredictions: [{label, index, confidence}...], isValidLetter: boolean }
export function predict(landmarks);

export function isLoaded();
export function getModelInfo(); // { inputShape: 63, outputClasses: 30, loaded: bool }
```

**Critical implementation details:**
- Use `tf.loadGraphModel('/models/asl/model.json')`
- Feature extraction MUST match training: `[lm0.x, lm0.y, lm0.z, lm1.x, lm1.y, lm1.z, ..., lm20.x, lm20.y, lm20.z]`
- Use `tf.tidy()` to prevent memory leaks
- Input tensor shape: `[1, 63]`
- Output: softmax probabilities, shape `[1, 30]`
- Valid letters: indices 0–25 (A–Z)
- Special classes: 26=asl_alphabet_test, 27=del, 28=nothing, 29=space
- `topPredictions` returns top 5 sorted by confidence

### `src/ai/handLandmarker.js`

```js
// Initialize MediaPipe HandLandmarker (call once)
export async function initHandLandmarker();

// Detect hands in video frame
// Returns: { landmarks: [{x,y,z},...] | null, handDetected: boolean }
export function detectHands(videoElement);

export function isReady();
```

**Implementation details:**
- Use `FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm')`
- Model: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`
- Running mode: `VIDEO`
- numHands: 1
- Use first detected hand only
- Returns 21 landmarks, each with x, y, z

### `src/ai/predictionEngine.js`

```js
export class PredictionEngine {
  // config: { stabilityFrames: 5, minConfidence: 0.75 }
  constructor(config);

  // Process landmarks through model + stability filter
  // Returns: { label: string|null, confidence: number, isStable: boolean,
  //            handDetected: boolean, status: 'no-hand'|'low-confidence'|'unstable'|'stable',
  //            rawPrediction: object|null }
  process(landmarks);

  // Reset stability buffer (call between quiz questions)
  reset();

  // Update config (for difficulty levels)
  updateConfig(newConfig);

  // Get current engine state for debug panel
  getState();
}
```

**Difficulty presets:**
- Easy: `{ stabilityFrames: 3, minConfidence: 0.6 }`
- Normal: `{ stabilityFrames: 5, minConfidence: 0.75 }`
- Hard: `{ stabilityFrames: 8, minConfidence: 0.85 }`

### `src/ai/cameraManager.js`

```js
export class CameraManager {
  constructor();

  // Start webcam stream on given video element
  // Throws on permission denied / no camera
  async start(videoElement);

  // Stop camera stream
  stop();

  // Check if camera is active
  isActive();

  // Get current MediaStream
  getStream();
}
```

**Error handling:** Throw descriptive errors:
- `'PERMISSION_DENIED'` — user denied camera
- `'NOT_FOUND'` — no camera device
- `'GENERAL_ERROR'` — other errors

---

## Data Layer Interfaces

### `src/data/alphabet.js`

```js
// All 30 labels in model output order
export const LABELS = ['A','B','C',...'Z','asl_alphabet_test','del','nothing','space'];

// Just the 26 valid letters
export const VALID_LETTERS = ['A','B','C',...'Z'];

// Special class indices
export const SPECIAL_CLASSES = { ASL_TEST: 26, DEL: 27, NOTHING: 28, SPACE: 29 };

// Letter info with ASL sign description
// Returns: { letter, index, description: string (how to form the sign) }
export function getLetterInfo(letter);

// Get label by model output index
export function getLetterByIndex(index);

// Check if model output index is a valid A-Z letter
export function isValidLetterIndex(index);
```

### `src/data/words.js`

```js
export const WORDS = ['CAT','DOG','BOOK','GOOD','HELLO','MORNING','NIGHT','HELP','HOME','SCHOOL','FRIEND','FAMILY'];

export function getRandomWord();
export function getRandomWords(count);
export function getWordsByLength(minLen, maxLen);
```

---

## Utility Interfaces

### `src/utils/storage.js`

```js
// All data stored under localStorage key "aslProgress"
export function getProgress(); // returns full progress object
export function saveLetterPracticed(letter);
export function saveWordPracticed(word);
export function saveQuizResult(type, result);
// type: 'letter' | 'spelling'
// result: { score, maxScore, accuracy, correct, incorrect, mistakes: string[], date }
export function getQuizHistory(type?);
export function clearProgress();
export function getStats();
// Returns: { lettersLearned, totalLetters: 26, wordsPracticed, bestQuizScore, bestSpellingScore, quizzesTaken }
```

### `src/utils/scoring.js`

```js
export const LETTER_QUIZ_POINTS = { correct: 10, incorrect: 0 };
export const SPELLING_QUIZ_POINTS = { correctLetter: 10, wordBonus: 20 };

export function calculateLetterQuizScore(correct, total);
// Returns: { score, maxScore, accuracy }

export function calculateSpellingScore(lettersCorrect, totalLetters, wordsCompleted);
// Returns: { score, maxScore, accuracy }
```

### `src/utils/quiz.js`

```js
export class LetterQuizEngine {
  // config: { questionCount: 10, difficulty: 'normal' }
  constructor(config);

  getCurrentQuestion(); // { letter, questionNumber, totalQuestions }
  checkAnswer(detectedLabel); // { correct, targetLetter, detectedLetter, points }
  nextQuestion();
  isComplete();
  getResults(); // { score, maxScore, accuracy, correct, incorrect, mistakes, totalQuestions }
  getScore();
}

export class SpellingQuizEngine {
  // config: { words: string[] }  (array of words to spell)
  constructor(config);

  getCurrentTarget(); // { word, letterIndex, letter, progress: [{letter, completed}], wordNumber, totalWords }
  checkAnswer(detectedLabel); // { correct, targetLetter, detectedLetter, wordComplete }
  advanceLetter(); // move to next letter (called after correct answer)
  nextWord(); // move to next word
  isComplete();
  getResults(); // { score, maxScore, accuracy, wordsCompleted, totalWords, mistakes }
  getScore();
}

// Difficulty configs
export const DIFFICULTY = {
  easy:   { stabilityFrames: 3, minConfidence: 0.6 },
  normal: { stabilityFrames: 5, minConfidence: 0.75 },
  hard:   { stabilityFrames: 8, minConfidence: 0.85 },
};
```

---

## Component Interfaces

All components create DOM elements and return controller objects. Components do NOT import from pages.

### `src/components/camera.js`

```js
// Create camera UI with video + canvas overlay
export function createCamera(container) {
  // Returns controller:
  return {
    start(),       // Start camera + create video element
    stop(),        // Stop camera stream
    getVideoElement(), // HTMLVideoElement
    getCanvasElement(), // HTMLCanvasElement (overlay)
    drawLandmarks(landmarks), // Draw hand skeleton on canvas
    clearCanvas(),
    showError(message),  // Show error message in camera area
    showStatus(text),    // Update status line
    isActive(),
    destroy(),     // Remove all DOM, stop camera
  };
}
```

Renders:
```html
<div class="asl-camera">
  <div class="asl-camera__viewport">
    <video class="asl-camera__video" autoplay playsinline></video>
    <canvas class="asl-camera__canvas"></canvas>
  </div>
  <div class="asl-camera__status">Camera Status: ● Active</div>
</div>
```

Draw 21 landmarks + connections (the MediaPipe hand skeleton). Use:
- Landmark points: small colored circles
- Connections: lines between connected landmarks
- MediaPipe HAND_CONNECTIONS defines the pairs

### `src/components/predictionDisplay.js`

```js
export function createPredictionDisplay(container) {
  return {
    update({ label, confidence, isStable, handDetected, status }),
    showCorrect(letter),    // flash green ✓ feedback
    showIncorrect(target, detected), // flash red ✕ feedback
    reset(),
    destroy(),
  };
}
```

Shows different states:
- **no-hand**: "No hand detected — Place your hand in frame"
- **low-confidence**: "Detected: — | Confidence: 42% | Hold your hand steady"
- **unstable**: "Detected: A | Confidence: 88% | Hold steady..."
- **stable**: "Detected: A | Confidence: 96% | ✓ Stable"

### `src/components/debugPanel.js`

```js
export function createDebugPanel(container) {
  return {
    update({ modelLoaded, mediapipeReady, cameraActive, handDetected,
             inputShape, outputClasses, prediction, classIndex,
             confidence, fps, topPredictions }),
    toggle(),
    show(),
    hide(),
    destroy(),
  };
}
```

Renders a collapsible panel (hidden by default, toggled with Ctrl+Shift+D) showing model status, prediction data, FPS, and top-5 predictions table.

### `src/components/navbar.js`

```js
export function createNavbar(container) {
  return {
    setActive(path),
    destroy(),
  };
}
```

Renders:
```html
<nav class="asl-navbar">
  <a class="asl-navbar__brand" href="#/">ASL Learning</a>
  <div class="asl-navbar__links">
    <a href="#/">Home</a>
    <a href="#/learn">Learning</a>
    <a href="#/practice/letter">Practice</a>
    <a href="#/quiz/letter">Quizzes</a>
  </div>
  <button class="asl-navbar__menu-btn">☰</button> <!-- mobile toggle -->
</nav>
```

### `src/components/progressBar.js`

```js
export function createProgressBar(container, { label, max, value, showPercentage }) {
  return {
    update(value),
    setMax(max),
    destroy(),
  };
}
```

Renders an animated progress bar with optional label and percentage.

### `src/components/letterCard.js`

```js
// Create a single letter card element (returns HTMLElement, not a controller)
export function createLetterCard(letter, { practiced, onClick });

// Create the full A-Z grid in a container
export function createAlphabetGrid(container, { onLetterClick, practicedLetters }) {
  return {
    update(practicedLetters), // update which letters show as practiced
    destroy(),
  };
}
```

Letter card shows the letter, practiced checkmark if applicable. Grid is 5 columns responsive.

---

## Page Interfaces

Every page exports `mount(container, params)` and `unmount()`.

### `src/pages/home.js`
- Dashboard with stats from `storage.getStats()`
- Navigation cards: Learning, Practice, Quizzes
- Progress bar showing letters learned / 26
- Model loading status indicator

### `src/pages/alphabet.js`
- A–Z grid using `createAlphabetGrid`
- When `params.letter` is set, show letter detail view:
  - Letter, ASL sign description, "Practice this" button
  - Back to grid button

### `src/pages/practiceLetter.js`
- If `params.letter` is set, practice that letter. Otherwise show letter picker or random.
- Camera + prediction display
- Target letter shown prominently
- ✓/✕ feedback on stable detection (no scoring)
- Buttons: Try Again, Next Letter, Back to Alphabet
- Uses shared inference loop: camera → handLandmarker → predictionEngine → UI update

### `src/pages/practiceWord.js`
- If `params.word` is set, practice that word. Otherwise show word picker.
- Shows word with letter progress (✓/○ for each letter)
- Current target letter highlighted
- Camera + prediction for current letter
- Auto-advance to next letter on correct stable detection
- Complete word → congratulations + option to practice another

### `src/pages/letterQuiz.js`
- Settings screen first: question count (5/10/20/26), difficulty (Easy/Normal/Hard)
- Start Quiz → quiz flow
- Target letter display
- Camera + prediction
- On stable correct: +10 points, auto-advance after brief delay
- On stable incorrect: show "Not quite. Target: G, Detected: B" + retry
- Running score display
- Completes → navigate to quiz/results with results in sessionStorage

### `src/pages/spellingQuiz.js`
- Settings screen: number of words, difficulty
- Shows current word, letter progress, current target letter
- Camera + prediction
- Correct letter → advance, word complete → bonus + next word
- Completes → navigate to quiz/results

### `src/pages/quizResults.js`
- Reads results from sessionStorage
- Shows: score, accuracy, correct/incorrect counts
- Practice Mistakes: lists incorrect letters with "Practice" button each
- Buttons: Try Again, Back to Quizzes

---

## Inference Loop Pattern

Every page with a webcam uses this shared pattern:

```js
import { detectHands } from '../ai/handLandmarker.js';
import { PredictionEngine } from '../ai/predictionEngine.js';
import { createCamera } from '../components/camera.js';
import { createPredictionDisplay } from '../components/predictionDisplay.js';

let animFrameId = null;
const engine = new PredictionEngine({ stabilityFrames: 5, minConfidence: 0.75 });
const camera = createCamera(container);
const display = createPredictionDisplay(container);

await camera.start();

function inferenceLoop() {
  const video = camera.getVideoElement();
  if (video.readyState >= 2) {
    const { landmarks, handDetected } = detectHands(video);
    if (handDetected && landmarks) {
      const result = engine.process(landmarks);
      display.update(result);
      camera.drawLandmarks(landmarks);
      // page-specific logic: check quiz answer, etc.
    } else {
      display.update({ handDetected: false, status: 'no-hand' });
      camera.clearCanvas();
    }
  }
  animFrameId = requestAnimationFrame(inferenceLoop);
}

inferenceLoop();

// On unmount:
function cleanup() {
  cancelAnimationFrame(animFrameId);
  camera.stop();
  camera.destroy();
  display.destroy();
}
```

---

## Global App Bootstrap (`src/main.js`)

1. Show loading screen
2. Load TF.js model (`loadModel()`)
3. Initialize MediaPipe (`initHandLandmarker()`)
4. Create navbar
5. Create debug panel (hidden)
6. Initialize router
7. Hide loading screen, show app
8. Listen for Ctrl+Shift+D to toggle debug panel

The debug panel is updated by each active page's inference loop by importing and calling the debug panel's update method. Export debug panel controller from main.js or use a global event.

To share the debug panel across pages, main.js should export:
```js
export function updateDebugPanel(data);
export function getDebugPanel();
```

Or use a simple event bus. Simplest: export a reference.

---

## Important Constraints

1. **NO fake AI** — real MediaPipe + TF.js pipeline only
2. **NO normalization** of landmarks — raw x,y,z as MediaPipe provides them
3. **Feature order**: `[lm0.x, lm0.y, lm0.z, lm1.x, lm1.y, lm1.z, ..., lm20.x, lm20.y, lm20.z]`
4. **Tensor disposal**: always use `tf.tidy()` or manual dispose
5. **Single instances**: one model, one MediaPipe, one camera stream
6. **Labels 26-29 are NOT valid quiz answers**
7. **Stability required**: never accept single-frame predictions for quiz answers
