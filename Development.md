# HandSpeak System — Development Guide

This document explains how the HandSpeak System was assembled: the alphabet model, the word-sign model, the web application, the classroom backend, and the purpose of every page. It is based on the files currently included in this repository.

## 1. Development goal

The project was built as an FSL learning environment with three connected goals:

1. Teach the learner the FSL alphabet visually.
2. Give immediate feedback while the learner performs a sign in front of a webcam.
3. Let teachers assign and monitor learning activities through classroom accounts.

The system deliberately uses two recognition approaches because the inputs are different:

| Recognition task | Input type | Current output |
| --- | --- | --- |
| Alphabet / fingerspelling | One hand shape in one video frame | A–Z plus four special classes in the exported alphabet model |
| Word-sign recognition | A short sequence of movement, two hands, and body pose | `Good`, `Morning`, or `Night` |

## 2. Alphabet recognition: letters and fingerspelling

### What was prepared

The alphabet model files are stored in `public/models/FSL/`:

- `model.json` — TensorFlow.js graph-model definition.
- `group1-shard1of1.bin` — model weights.
- `labels.json` — output class order.

The label file has 30 classes:

```text
A–Z, FSL_alphabet_test, del, nothing, space
```

Only indices 0–25 (A–Z) are accepted as valid alphabet answers in the learning and quiz flows. The other classes are retained in the model output but do not count as a letter response.

### Runtime processing

1. `src/ai/handLandmarker.js` loads MediaPipe Hand Landmarker in `VIDEO` mode.
2. The webcam frame is passed to MediaPipe, which returns 21 hand landmarks.
3. `src/ai/fslModel.js` flattens every landmark into `[x, y, z]`, producing `21 × 3 = 63` numeric input features.
4. TensorFlow.js runs the alphabet model with tensor shape `[1, 63]`.
5. The output probabilities are sorted to produce the best label and the top five predictions.
6. `src/ai/predictionEngine.js` prevents accidental answers by requiring the same predicted label over several frames and above a confidence threshold.

The normal application setting is five stable frames and at least 0.75 confidence. The quiz utility also defines easy (3 / 0.60), normal (5 / 0.75), and hard (8 / 0.85) stability presets.

### Where it is used

- **Alphabet lessons:** shows the A–Z reference cards, image, and hand-shape description.
- **Letter practice:** waits until the intended letter is predicted stably.
- **Word practice:** checks each letter of a selected word in order. It is a fingerspelling activity, even when the word is `GOOD`, `MORNING`, or `NIGHT`.
- **Letter quiz:** scores individual letter signs.
- **Spelling quiz:** scores the letters of a word in sequence.
- **Student dashboard interpreter:** continuously displays a stable A–Z prediction.

### Training provenance note

The repository contains the already exported alphabet model and label list, but it does **not** contain the alphabet dataset or a letter-training notebook/script. Therefore this guide describes the verified browser input/output pipeline and does not invent dataset size, train/validation accuracy, or the original training procedure. Those details should be added if the original letter-training materials become available.

## 3. Word-sign training: Good, Morning, and Night

The complete reproducible workflow for the current word-sign model is in [`train_word_sign_language.ipynb`](train_word_sign_language.ipynb). It is designed for Google Colab and exports browser-ready artifacts.

### Dataset arrangement

The notebook expects video data, organized by label, inside a ZIP file:

```text
datasets.zip
└── datasets/
    └── videos/
        ├── Good/
        │   └── *.mp4
        ├── Morning/
        │   └── *.mp4
        └── Night/
            └── *.mp4
```

The notebook discovers video files recursively and uses the first folder beneath `videos/` as each sample’s class label. It accepts `.mp4`, `.avi`, `.mov`, `.mkv`, and `.webm` files. The notebook recommends at least about 20 varied clips per word and more signers, lighting conditions, distances, and backgrounds for stronger real-world generalization.

### Libraries used during training

The notebook installs/pins and uses:

- Python
- TensorFlow/Keras 2.20.0
- MediaPipe 1.0.1
- OpenCV 4.11.0.86
- NumPy 2.0.2 and pandas 2.2.3
- scikit-learn for stratified splitting, class weights, reports, and confusion matrix
- Matplotlib and Seaborn for visual inspection and evaluation charts

### Landmark extraction and features

Every video is sampled into a sequence of up to 80 source frames, then resampled to 40 frames for model input. The notebook detects:

- **Left hand:** 21 landmarks × x/y/z = 63 values
- **Right hand:** 21 landmarks × x/y/z = 63 values
- **Pose:** 33 landmarks × x/y/z/visibility = 132 values
- **Presence flags:** left hand, right hand, and pose = 3 values

This yields `63 + 63 + 132 + 3 = 261` features in every frame. Missing landmarks are represented with zero values and a corresponding presence flag.

To reduce differences caused by a signer’s distance or position, coordinates are centered on the midpoint of the shoulders and scaled by shoulder width. The extracted sequences are cached using the version name `tasks_pose33_hands21_shoulder_norm_v2` so retraining does not repeat expensive landmark extraction unnecessarily.

### Train, validation, and test split

The notebook uses a stratified split at the **video level**:

- 70% training data
- 15% validation data
- 15% test data

Video-level splitting prevents frames from the same clip from leaking into another split. If clips came from the same extended recording, the recommended improvement is grouping the split by signer or session.

Feature mean and standard deviation are calculated from the training split only. The notebook applies those statistics to validation/test data and later exports them so browser inference uses the exact same normalization.

### Temporal CNN architecture

The word model is a Keras temporal convolutional neural network:

```text
Input: (40 frames, 261 features)
  → Conv1D 96, kernel size 3, ReLU
  → Batch Normalization → Max Pooling
  → Conv1D 128, kernel size 3, ReLU
  → Batch Normalization → Max Pooling
  → Conv1D 160, kernel size 3, ReLU
  → Global Average Pooling
  → Dense 96, ReLU
  → Dropout 0.35
  → Dense number-of-labels, Softmax
```

Training uses Adam with learning rate `0.001`, sparse categorical cross-entropy, balanced class weights, batch size 8, and up to 100 epochs. The callbacks save the best validation-accuracy checkpoint, restore early-stopped weights after 12 non-improving validation-loss epochs, and reduce learning rate when validation loss plateaus.

The notebook evaluates held-out videos with loss, accuracy, a classification report, a confusion matrix, and a per-video prediction table. No numeric accuracy is written in this guide because the generated notebook output/metrics are not committed to the repository.

### Exporting the model for the website

The notebook exports:

```text
public/models/word-sign/
├── model.json
├── group1-shard1of1.bin
├── labels.json
└── feature_config.json
```

`feature_config.json` preserves sequence length, feature order, shoulder normalization description, and the training mean/std values. This is critical: changing the feature order or preprocessing in the web app without retraining will invalidate predictions.

The notebook writes the TensorFlow.js weight bundle directly because its documented export path avoids reliance on the Python TensorFlow.js converter.

## 4. Word-sign inference inside the website

`src/ai/wordLandmarkers.js` loads MediaPipe Hand Landmarker and Pose Landmarker. It attempts a GPU delegate first and falls back to CPU if necessary. It tracks up to two hands and one pose.

`src/ai/wordSignModel.js` reconstructs the temporal CNN in TensorFlow.js, loads the exported binary weights, and reproduces the training preprocessing:

1. Build a 261-value feature vector per captured frame.
2. Center/scale hand and pose coordinates using the shoulders.
3. Resample the capture to 40 frames with linear interpolation.
4. Apply the exported per-feature z-score normalization.
5. Run the TensorFlow.js temporal CNN.
6. Return the highest ranking label only if it meets the 0.60 confidence threshold; otherwise return `Unknown`.

In `src/pages/wordSignQuiz.js`, the learner receives a seven-second preparation countdown, then performs a three-second recording. Frames are sampled approximately every 50 ms. At least eight frames with detected hands are required before prediction; otherwise the learner is asked to record again.

The word-sign quiz supports two forms:

- **Single word:** each configured word is a question.
- **Two words:** the learner must sign the configured two words in the displayed order; the question completes only after both are correctly recognized.

## 5. Web application structure

### Application startup and routing

`src/main.js` first loads the A–Z TensorFlow.js model and initializes MediaPipe. It then creates the navigation, debug panel, and hash router. Routes are defined in the same file and rendered by `src/router.js`.

The application is a single-page app: navigation uses URLs such as `#/learn` instead of server-side pages. Each page module exports `mount()` to render/start its resources and `unmount()` to release camera streams, animations, timers, and listeners when the learner moves away.

### Key folders

| Folder/file | Responsibility |
| --- | --- |
| `src/pages/` | Page-specific interface and behavior |
| `src/components/` | Camera view, navigation, card, progress, prediction display, and debug UI |
| `src/ai/` | Camera manager, MediaPipe detection, model loading, feature building, and prediction stabilization |
| `src/data/` | Alphabet descriptions, word-practice word list, and supported word-sign labels |
| `src/utils/` | Local browser progress, quiz engines, and scoring helpers |
| `src/lib/classroom.js` | Supabase calls for profiles, classrooms, quizzes, materials, and attempts |
| `supabase/` | Database schema, repair scripts, and Edge Functions |

### User interface and feedback

The reusable camera component asks for webcam access, shows the live feed, overlays landmarks, and reports camera errors. The prediction display provides no-hand, low-confidence, unstable, correct, and incorrect feedback.

A hidden debug panel can be toggled with `Ctrl + Shift + D`. It displays model/camera status, FPS, confidence, and leading alphabet predictions for development troubleshooting.

## 6. Database, accounts, and access control

The main schema is [`supabase/schema.sql`](supabase/schema.sql). It defines:

| Table | Purpose |
| --- | --- |
| `profiles` | User name, email, gender, and role (`student`, `teacher`, or `admin`) |
| `teacher_invites` | Admin-created teacher invitation information |
| `classrooms` | One classroom/room owned by a teacher, including its join code and open status |
| `classroom_members` | Student-to-classroom membership, allowing students to join multiple rooms |
| `quizzes` | Teacher quiz configuration, publication state, schedule, and attempt limit |
| `quiz_attempts` | Progress and final records for every attempt |
| `classroom_materials` | Teacher-published learning or practice materials |

Supabase Auth creates the account. A database trigger creates the matching profile and, for students, uses the entered classroom code to create their first membership. Teacher accounts require an admin invitation and receive a classroom during setup.

RLS policies ensure that students see only their own profile, memberships, published room content, and attempts; teachers see/manage their own room, activities, and students; and administrators have school-wide access. A database trigger also prevents attempts beyond the configured maximum.

The `supabase/functions/` folder contains Edge Functions for teacher invitation and deletion actions.

## 7. Page-by-page implementation map

| Page group | Primary source file(s) | Implementation summary |
| --- | --- | --- |
| Home and navigation | `pages/home.js`, `components/navbar.js` | Redirects authenticated roles to their dashboard; navigation items change based on role. |
| Authentication | `pages/auth.js`, `lib/classroom.js` | Student registration, sign-in, email confirmation resend, password reset, and invited-teacher password creation. |
| Alphabet lessons | `pages/alphabet.js`, `components/letterCard.js`, `data/alphabet.js` | Renders the A–Z grid, visual references, descriptions, practice links, local practice state, and teacher lessons. |
| Letter practice | `pages/practiceLetter.js` | Uses one-hand landmarks, the alphabet model, and the stability engine to verify one target letter. |
| Word/fingerspelling practice | `pages/practiceWord.js`, `data/words.js` | Splits a selected word into characters and verifies each character in order with the alphabet model. |
| Quiz catalogue | `pages/quizzes.js` | Retrieves published classroom quizzes, displays metadata and attempts used, and stores the selected assignment before routing to its quiz page. |
| Letter and spelling quizzes | `pages/letterQuiz.js`, `pages/spellingQuiz.js`, `utils/quiz.js` | Uses the alphabet webcam pipeline, supports skip/previous/submit, saves in-progress state, and finalizes attempts. |
| Word-sign quiz | `pages/wordSignQuiz.js`, `ai/wordLandmarkers.js`, `ai/wordSignModel.js` | Records a timed movement sequence, classifies it with the temporal CNN, and enforces configured word order. |
| Results | `pages/quizResults.js` | Reads the latest session result, shows scoring summary, and links alphabet mistakes back to practice. |
| Student pages | `pages/studentDashboard.js`, `pages/studentRooms.js`, `components/studentRooms.js` | Shows summary metrics, joined rooms, quizzes, recent attempts, and the A–Z live interpreter. |
| Teacher pages | `pages/teacherDashboard.js` | Manages classroom quizzes and students; charts and filters performance using ApexCharts. |
| Admin pages | `pages/adminDashboard.js` | Manages teachers/invitations and provides school-wide classroom/activity views. |

## 8. Local development workflow

### Start the app

```bash
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` before testing account-dependent pages. The app still needs a camera-enabled browser for practice and quiz flows.

### Validate changes

```bash
npm run build
node --test tests/multiple-classrooms.test.mjs
```

Before accepting an AI-related change, test these cases manually:

1. Camera permission accepted, denied, and unavailable.
2. No hand in frame, a low-confidence sign, and a stable correct A–Z sign.
3. Navigation away from a camera page, confirming the camera turns off.
4. Letter/spelling quiz progress, submit, and maximum-attempt behavior.
5. Word-sign recording with both hands and upper body visible, too few visible-hand frames, correct recognition, and `Unknown`/wrong recognition.
6. Student, teacher, and admin access with their corresponding navigation and data permissions.

## 9. Retraining the word-sign model

1. Add more labeled video clips under `datasets/videos/<Word>/`.
2. Open `train_word_sign_language.ipynb` in Google Colab.
3. Upload/mount the expected `datasets.zip` location and run cells from top to bottom.
4. Inspect landmark previews, label counts, learning curves, classification report, and confusion matrix before deployment.
5. Copy the newly exported `model.json`, shard file, `labels.json`, and `feature_config.json` into `public/models/word-sign/` as one matching set.
6. Run a production build and test the word-sign quiz in the browser.

Do not mix a newly trained `model.json` with an old shard, label file, or feature configuration. All four artifacts must come from the same training run.

## 10. Known boundaries and future improvements

- The word model currently recognizes only the three labels included in its `labels.json`: Good, Morning, and Night.
- The word model classifies one trimmed sign recording at a time; it is not a continuous full-sentence recognizer.
- A broader dataset should include more signers and an explicit `Unknown`/non-target class before use in more varied real-world settings.
- Motion-heavy alphabet letters such as J and Z may need a temporal alphabet model if static landmark classification is insufficient.
- The alphabet model’s original dataset and training report are not in this repository; adding them would make the alphabet training documentation reproducible.
