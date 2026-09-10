import { createIcons, icons } from 'lucide';
import { getProfile, getPublishedQuizzes, getStudentAttempts, getStudentClassrooms, getMyTeacherNames } from '../lib/classroom.js';
import { navigate } from '../router.js';

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const quizMeta = type => ({
  alphabet: { label: 'Letter quiz', icon: 'scan-line', route: '#/quiz/letter' },
  spelling: { label: 'Spelling quiz', icon: 'spell-check', route: '#/quiz/spelling' },
  word_sign: { label: 'Word sign quiz', icon: 'scan-face', route: '#/quiz/word-sign' }
})[type] || { label: 'Quiz', icon: 'clipboard-check', route: '#/quiz' };
const questionLabel = count => `${count} ${Number(count) === 1 ? 'question' : 'questions'}`;
const getMaxAttempts = quiz => Math.max(1, Number(quiz?.max_attempts || 1));
const getQuizAttempts = (attempts, quizId) => attempts.filter(attempt => attempt.quiz_id === quizId);
const quizInfo = quiz => {
  if (quiz.quiz_type === 'word_sign' && quiz.settings?.quiz_type === 'two_words') {
    return `${questionLabel(quiz.question_count)} · ${(quiz.settings.words || []).join(' → ')} · signs must be in order`;
  }
  return `${questionLabel(quiz.question_count)} · randomized for each student`;
};

export async function mount(container) {
  container.innerHTML = '<div class="FSL-container"><div class="FSL-card">Loading available quizzes…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role === 'admin') { navigate('#/admin'); return; }
    const [quizzes, attempts, rooms] = await Promise.all([getPublishedQuizzes(), getStudentAttempts(), getStudentClassrooms()]);
    let teachers = [];
    try { teachers = await getMyTeacherNames(); }
    catch (error) { console.warn('Teacher names could not be loaded:', error.message); }
    render(container, quizzes, attempts, rooms, teachers);
  } catch (error) {
    container.innerHTML = `<div class="FSL-container"><div class="FSL-card"><h2>Quizzes unavailable</h2><p>${escape(error.message)}</p><p>Ask your teacher to publish a quiz, or check that the classroom database setup is complete.</p></div></div>`;
  }
}

function render(container, quizzes, attempts, rooms, teachers) {
  const teacherNames = new Map(teachers.map(teacher => [teacher.teacher_id, teacher.full_name]));
  const roomNames = new Map(rooms.map(room => [room.id, room.name]));
  const activities = quizzes.map(item => ({ ...item, kind: 'quiz' }));
  const card = activity => {
    const usedAttempts = getQuizAttempts(attempts, activity.id).length;
    const maxAttempts = getMaxAttempts(activity);
    const attemptsComplete = usedAttempts >= maxAttempts;
    const nextAttempt = Math.min(usedAttempts + 1, maxAttempts);
    const meta = quizMeta(activity.quiz_type);
    const info = quizInfo(activity);
    return `<article class="FSL-assignment FSL-classroom-activity ${attemptsComplete ? 'FSL-classroom-activity--completed' : ''}" data-kind="${activity.kind}" data-id="${activity.id}">
      <span class="FSL-classroom-activity__icon"><i data-lucide="${meta.icon}"></i></span>
      <span class="FSL-assignment__type">${meta.label}</span>
      <span class="FSL-status ${attemptsComplete ? 'FSL-status--taken' : ''}">${usedAttempts}/${maxAttempts} attempts used</span>
      <h3>${escape(activity.title)}</h3><small>${escape(roomNames.get(activity.classroom_id) || 'Classroom')}</small>
      <p>${escape(info)}</p>
      <br/>
      <button class="FSL-btn FSL-btn--secondary activity-open" data-id="${activity.id}" ${attemptsComplete ? 'disabled aria-disabled="true"' : ''}>${attemptsComplete ? 'Attempts complete' : `Start attempt ${nextAttempt}`} <i data-lucide="arrow-right"></i></button>
    </article>`;
  };
  container.innerHTML = `
    <div class="FSL-quizzes-hub FSL-container">
      <div class="FSL-classroom-header">
        <div><span class="FSL-eyebrow">My classrooms</span><h1>Available quizzes</h1><p>Select a Letter, Spelling, or Word Sign Quiz published by your teachers.</p></div>
        <div class="FSL-classroom-header__count"><strong>${activities.length}</strong><span>Available quizzes</span></div>
      </div>
      <section class="FSL-section">
        <div id="teacher-activities" class="FSL-dashboard-grid">${activities.map(card).join('') || '<div class="FSL-empty-card">No published quizzes in your classrooms yet.</div>'}</div>
      </section>
    </div>`;
  createIcons({ icons });
  container.querySelectorAll('.activity-open').forEach(button => button.addEventListener('click', () => {
    const activity = activities.find(item => item.id === button.dataset.id);
    if (getQuizAttempts(attempts, activity.id).length >= getMaxAttempts(activity)) return;
    sessionStorage.setItem('assignedQuiz', JSON.stringify(activity));
    navigate(quizMeta(activity.quiz_type).route);
  }));
}

export function unmount() {}
