import { createIcons, icons } from 'lucide';
import { getProfile, getPublishedQuizzes, getStudentAttempts, joinClassroomByCode } from '../lib/classroom.js';
import { navigate } from '../router.js';

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const quizMeta = type => ({
  alphabet: { label: 'Letter quiz', icon: 'scan-line', route: '#/quiz/letter' },
  spelling: { label: 'Spelling quiz', icon: 'spell-check', route: '#/quiz/spelling' },
  word_sign: { label: 'Word sign quiz', icon: 'scan-face', route: '#/quiz/word-sign' }
})[type] || { label: 'Quiz', icon: 'clipboard-check', route: '#/quiz' };
const questionLabel = count => `${count} ${Number(count) === 1 ? 'question' : 'questions'}`;
const quizInfo = quiz => {
  if (quiz.quiz_type === 'word_sign' && quiz.settings?.quiz_type === 'two_words') {
    return `${questionLabel(quiz.question_count)} · ${(quiz.settings.words || []).join(' → ')} · signs must be in order`;
  }
  return `${questionLabel(quiz.question_count)} · randomized for each student`;
};

export async function mount(container) {
  container.innerHTML = '<div class="asl-container"><div class="asl-card">Loading available quizzes…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role === 'admin') { navigate('#/admin'); return; }
    const [quizzes, attempts] = await Promise.all([getPublishedQuizzes(), getStudentAttempts()]);
    render(container, quizzes, attempts);
  } catch (error) {
    container.innerHTML = `<div class="asl-container"><div class="asl-card"><h2>Quizzes unavailable</h2><p>${escape(error.message)}</p><p>Ask your teacher to publish a quiz, or check that the classroom database setup is complete.</p></div></div>`;
  }
}

function render(container, quizzes, attempts) {
  const activities = quizzes.map(item => ({ ...item, kind: 'quiz' }));
  const card = activity => {
    const alreadyTaken = attempts.some(attempt => attempt.quiz_id === activity.id);
    const meta = quizMeta(activity.quiz_type);
    const info = quizInfo(activity);
    return `<article class="asl-assignment asl-classroom-activity ${alreadyTaken ? 'asl-classroom-activity--completed' : ''}" data-kind="${activity.kind}" data-id="${activity.id}">
      <span class="asl-classroom-activity__icon"><i data-lucide="${meta.icon}"></i></span>
      <span class="asl-assignment__type">${meta.label}</span>
      ${alreadyTaken ? '<span class="asl-status asl-status--taken">Already taken</span>' : ''}
      <h3>${escape(activity.title)}</h3>
      <p>${escape(info)}</p>
      <button class="asl-btn asl-btn--secondary activity-open" data-id="${activity.id}" ${alreadyTaken ? 'disabled aria-disabled="true"' : ''}>${alreadyTaken ? 'Already taken' : 'Start quiz'} <i data-lucide="arrow-right"></i></button>
    </article>`;
  };
  container.innerHTML = `
    <div class="asl-quizzes-hub asl-container">
      <div class="asl-classroom-header">
        <div><span class="asl-eyebrow">My classroom</span><h1>Available quizzes</h1><p>Select a Letter, Spelling, or Word Sign Quiz published by your teacher.</p></div>
        <div class="asl-classroom-header__count"><strong>${activities.length}</strong><span>Available quizzes</span></div>
      </div>
      <section class="asl-section">
        <div id="teacher-activities" class="asl-dashboard-grid">${activities.map(card).join('') || '<div class="asl-empty-card"><h3>Join your teacher’s classroom</h3><p>Enter the room code shared by your teacher to see their Letter, Spelling, and Word Sign quizzes.</p><form id="join-classroom-form" class="asl-form"><label>Teacher room code<input name="roomCode" required maxlength="32" autocomplete="off" style="text-transform:uppercase" placeholder="e.g. A1B2C3D4"></label><div id="join-classroom-message" class="asl-form__message" aria-live="polite"></div><button class="asl-btn asl-btn--primary" type="submit">Join classroom</button></form></div>'}</div>
      </section>
    </div>`;
  createIcons({ icons });
  container.querySelectorAll('.activity-open').forEach(button => button.addEventListener('click', () => {
    const activity = activities.find(item => item.id === button.dataset.id);
    if (attempts.some(attempt => attempt.quiz_id === activity.id)) return;
    sessionStorage.setItem('assignedQuiz', JSON.stringify(activity));
    navigate(quizMeta(activity.quiz_type).route);
  }));
  const joinForm = container.querySelector('#join-classroom-form');
  if (joinForm) {
    joinForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = joinForm.querySelector('button');
      const message = container.querySelector('#join-classroom-message');
      button.disabled = true;
      try {
        await joinClassroomByCode(new FormData(joinForm).get('roomCode'));
        message.className = 'asl-form__message asl-form__message--success';
        message.textContent = 'Classroom joined. Loading available quizzes…';
        setTimeout(() => mount(container), 450);
      } catch (error) {
        message.className = 'asl-form__message asl-form__message--error';
        message.textContent = error.message || 'Could not join this classroom.';
        button.disabled = false;
      }
    });
  }
}

export function unmount() {}
