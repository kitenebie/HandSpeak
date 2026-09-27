# HandSpeak System

HandSpeak is a web-based Filipino Sign Language (FSL) learning system. It helps students learn the alphabet, practise fingerspelling through a webcam, take teacher-assigned quizzes, and view their progress. Teachers can manage their classroom and assessments, while administrators manage teacher access and view school-wide activity.

> **Important scope:** the alphabet recognizer handles static hand signs for **A–Z**. The word-sign recognizer is a separate, motion-based model and currently supports **Good, Morning, and Night**. These two models should not be treated as the same feature.

## Main features

- FSL alphabet lessons with 26 visual letter cards and hand-shape guidance.
- Real-time A–Z recognition from the webcam using MediaPipe hand landmarks and TensorFlow.js.
- Letter practice and word practice through **fingerspelling** (for example, `HELLO` is completed one letter at a time).
- Teacher-published Letter, Spelling, and Word Sign quizzes with attempt limits and saved results.
- Motion-based word-sign quiz that records a three-second sign sequence.
- Student, teacher, and administrator dashboards with role-based access.
- Multiple classrooms/rooms, classroom codes, teacher invitations, performance records, and charts.
- Supabase Authentication and database security through Row Level Security (RLS).

## Technology used

| Area | Technology | Purpose |
| --- | --- | --- |
| Front end | Vanilla JavaScript, ES modules, Vite | Single-page application and development/build tooling |
| UI | CSS, Lucide icons, ApexCharts | Responsive interface, icons, and dashboard charts |
| Alphabet AI | TensorFlow.js | Runs the exported alphabet model in the browser |
| Landmark detection | MediaPipe Tasks Vision | Detects hand landmarks; the word model also uses pose landmarks |
| Word-sign AI | TensorFlow.js temporal CNN | Classifies a short sequence of movements instead of a single image |
| Backend | Supabase Auth, PostgreSQL, Edge Functions | Accounts, roles, classrooms, quizzes, attempts, and teacher invitations |
| Training | Python, TensorFlow/Keras, MediaPipe, OpenCV, scikit-learn | Used by the included word-sign training notebook |

## System flow

```text
Webcam
  -> MediaPipe landmarks
  -> feature processing
  -> TensorFlow.js model
  -> confidence + stability/quiz rule
  -> feedback, score, and saved progress
```

The alphabet flow uses 21 hand landmarks (63 x/y/z values) from one hand in each frame. The word-sign flow uses both hands, upper-body pose, and movement over time, so it needs a wider camera frame and a short recording.

## Pages of the website

### Public and account pages

| Route | Page | What it does |
| --- | --- | --- |
| `#/` | Home | Welcomes visitors and directs learners to lessons, practice, or quizzes. Signed-in users are sent to the dashboard for their role. |
| `#/auth/login` | Sign in | Lets an existing student, teacher, or admin sign in; includes resend-confirmation and password-reset links. |
| `#/auth/register` | Student registration | Creates a student account using full name, gender, email, password, and an open classroom code. Teacher accounts are created by admin invitation. |
| `#/auth/forgot-password` | Forgot password | Sends a password-reset email. |
| `#/auth/reset-password` | Reset password | Accepts a valid reset link and saves a new password. |
| `#/auth/set-password` | Teacher password setup | Lets an invited teacher set the password for the first time. |

### Student learning pages

| Route | Page | What it does |
| --- | --- | --- |
| `#/student` | Student Dashboard | Shows classroom summary, quiz-attempt count, average score, open quizzes, recent scores, room cards, and a live A–Z camera interpreter. |
| `#/student/rooms` | My Rooms | Lists all rooms joined by the student. Opening a room shows its quizzes, attempt usage, and available actions. |
| `#/learn` | FSL Alphabet Lessons | Displays the A–Z lesson grid, previously practised letters, and teacher-published learning activities. |
| `#/learn/:letter` | Letter shortcut | Redirects a selected letter to its corresponding practice page. |
| `#/practice/letter` | Letter Practice | Picks a target letter (or uses the route letter), opens the camera, and waits for a stable correct prediction before moving on. |
| `#/practice/letter/:letter` | Focused Letter Practice | Practises a specific letter, for example `#/practice/letter/A`. |
| `#/practice/word` | Word Practice | Lets the learner choose from `CAT`, `DOG`, `BOOK`, `GOOD`, `HELLO`, `MORNING`, `NIGHT`, `HELP`, `HOME`, `SCHOOL`, `FRIEND`, and `FAMILY`. It checks each character with the A–Z model; it is **fingerspelling practice**, not word-sign classification. |
| `#/practice/word/:word` | Focused Word Practice | Performs letter-by-letter practice for the selected word. |

### Assessment pages

| Route | Page | What it does |
| --- | --- | --- |
| `#/quiz` or `#/quizzes` | Available Quizzes | Shows quizzes published by teachers in the student’s classrooms, including the remaining number of attempts. |
| `#/quiz/letter` | Letter Quiz | Shows target alphabet letters and scores the stable sign detected from the webcam. Students can go back, skip, or submit. |
| `#/quiz/spelling` | Spelling Quiz | Tests a word by asking the learner to sign its letters in sequence. |
| `#/quiz/word-sign` | Word Sign Quiz | Counts down, records a three-second sign, analyzes hand movement and upper-body posture, then compares the result with the expected word. A teacher may configure single-word questions or a two-word ordered sequence. |
| `#/quiz/results` | Quiz Results | Shows score, accuracy, correct/incorrect totals where applicable, completed words, and practice links for alphabet mistakes. |

### Teacher pages

| Route | Page | What it does |
| --- | --- | --- |
| `#/teacher` | Teacher Dashboard | Gives a class overview, counts for activities/students/attempts, and performance charts. |
| `#/teacher/activities` | Activities | Creates, edits, publishes, or deletes classroom quizzes. Quiz types are Alphabet, Spelling, and Word Sign; settings include question count, schedule, and maximum attempts. |
| `#/teacher/students` | Student List | Displays students in the teacher’s classroom and provides student-record management actions. |
| `#/teacher/performance` | Performance | Lists and filters student attempts by quiz/type and supports reviewing classroom performance. |

### Administrator pages

| Route | Page | What it does |
| --- | --- | --- |
| `#/admin` | Admin Dashboard | Presents a school-level overview of teachers, students, rooms, and activity charts. |
| `#/admin/teachers` | Teacher List | Registers/invites teachers, edits teacher details, views pending invitations, and manages teacher records. |
| `#/admin/activities` | Activities | Lets the administrator inspect teacher activities and the students handled by each teacher. |

## Project structure

```text
handspeak/
├── public/
│   ├── images/alpha/              # A–Z reference images
│   └── models/
│       ├── FSL/                   # alphabet model and labels
│       └── word-sign/             # temporal word-sign model and metadata
├── src/
│   ├── ai/                        # camera, landmarks, model inference
│   ├── components/                # reusable interface pieces
│   ├── data/                      # alphabet, word-practice, word-sign labels
│   ├── lib/                       # Supabase and classroom operations
│   ├── pages/                     # route/page modules
│   ├── utils/                     # quiz, scoring, and local progress helpers
│   ├── main.js                    # application initialization and routes
│   └── router.js                  # hash-based router
├── supabase/                      # schema, migrations/repairs, Edge Functions
├── tests/                         # automated checks
├── train_word_sign_language.ipynb # word-sign training and export notebook
└── Development.md                 # detailed implementation and training guide
```

## Local setup

### Prerequisites

- Node.js 18 or newer
- npm
- A modern browser with webcam permission
- A Supabase project for sign-in, classrooms, and persisted quiz data

### Install and run

```bash
npm install
npm run dev
```

Vite starts the local app on `http://localhost:3000` based on `vite.config.js`.

Create a `.env` file in the project root with the public Supabase values:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor for a new database. The other SQL files in `supabase/` are targeted additions or repairs and should be applied only when their change is needed. Deploy the invitation/deletion Edge Functions when using the admin teacher-management flow.

### Build and test

```bash
npm run build
node --test tests/multiple-classrooms.test.mjs
```

The production files are generated in `dist/`.

## Camera and privacy notes

- The browser asks for camera permission when a recognition/practice/quiz page starts.
- Alphabet prediction runs in the browser from landmarks extracted from the live video.
- The word-sign quiz samples landmarks during its three-second capture; the application code uses the landmark sequence for prediction.
- For better recognition, use good lighting, keep the relevant hand(s) visible, and hold alphabet signs steady. For word signs, keep the upper body and both hands inside the frame.

## Further documentation

Read [Development.md](Development.md) for the detailed AI training process, preprocessing, model architecture, exported files, database design, and development workflow.
