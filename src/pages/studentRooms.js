import { createIcons, icons } from 'lucide';
import { getProfile, getStudentClassrooms, getPublishedQuizzes, getStudentAttempts } from '../lib/classroom.js';
import { renderStudentRooms, bindStudentRooms } from '../components/studentRooms.js';
import { navigate } from '../router.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const quizRoutes = { alphabet: '#/quiz/letter', spelling: '#/quiz/spelling', word_sign: '#/quiz/word-sign' };
const quizLabels = { alphabet: 'Letter quiz', spelling: 'Spelling quiz', word_sign: 'Word sign quiz' };
let generation = 0;
let dismissDrawer = null;

export function quizState(quiz, attempts) {
  const used = attempts.filter(attempt => attempt.quiz_id === quiz.id).length;
  const max = Math.max(1, Number(quiz.max_attempts || 1));
  return { used, max, complete: used >= max };
}

export async function mount(container) {
  const current = ++generation;
  dismissDrawer?.();
  container.innerHTML = '<div class="FSL-container"><p>Loading your rooms…</p></div>';
  try {
    const profile = await getProfile();
    if (current !== generation) return;
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role !== 'student') { navigate(profile.role === 'admin' ? '#/admin' : '#/teacher'); return; }
    const [rooms, quizzes, attempts] = await Promise.all([getStudentClassrooms(), getPublishedQuizzes(), getStudentAttempts()]);
    if (current !== generation) return;
    container.innerHTML = `<div class="FSL-container FSL-rooms-page"><header class="FSL-rooms-heading"><div><span class="FSL-eyebrow">YOUR LEARNING SPACE</span><h1>My rooms<span>.</span></h1><p>Different teachers. More ways to learn. All your classrooms in one place.</p></div><span class="FSL-rooms-heading__mark" aria-hidden="true"><i data-lucide="blocks"></i></span></header>${renderStudentRooms(rooms, { interactive: true, quizzes, attempts })}</div>`;
    createIcons({ icons });
    bindStudentRooms(container, () => mount(container));
    container.querySelectorAll('[data-room-id]').forEach(button => button.addEventListener('click', () => {
      const room = rooms.find(item => item.id === button.dataset.roomId);
      if (room) openRoom(container, room, quizzes.filter(quiz => quiz.classroom_id === room.id), attempts, button);
    }));
  } catch (error) {
    if (current !== generation) return;
    container.innerHTML = `<div class="FSL-container FSL-card"><h2>Rooms unavailable</h2><p>${escape(error.message)}</p><button class="FSL-btn FSL-btn--primary" type="button">Try again</button></div>`;
    container.querySelector('button').addEventListener('click', () => mount(container));
  }
}

function openRoom(container, room, quizzes, attempts, trigger) {
  dismissDrawer?.();
  const backdrop = document.createElement('div');
  backdrop.className = 'FSL-drawer-backdrop is-open';
  const drawer = document.createElement('aside');
  drawer.className = 'FSL-info-drawer FSL-room-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'student-room-title');
  drawer.innerHTML = `<div class="FSL-form-drawer__header"><div><span class="FSL-room-tile__icon"><i data-lucide="school" aria-hidden="true"></i></span><span class="FSL-eyebrow">Room quizzes</span><h2 id="student-room-title">${escape(room.name)}</h2><p>Room code: ${escape(room.join_code)}</p></div><button type="button" class="FSL-form-drawer__close" aria-label="Close room"><i data-lucide="x" aria-hidden="true"></i></button></div>
    <div class="FSL-info-list">${quizzes.map(quiz => {
      const state = quizState(quiz, attempts);
      return `<article class="FSL-room-quiz"><span class="FSL-room-quiz__type"><i data-lucide="clipboard-list" aria-hidden="true"></i>QUIZ</span><strong>${escape(quiz.title)}</strong><span>${escape(quizLabels[quiz.quiz_type] || 'Quiz')} · ${quiz.question_count} questions</span>
        <span class="FSL-status ${state.used ? 'FSL-status--taken' : ''}"><i data-lucide="${state.used ? 'circle-check' : 'circle-play'}" aria-hidden="true"></i>${state.used ? 'Already taken' : 'Ready to take'}</span><small>${state.used}/${state.max} attempts used</small>
        <button type="button" class="FSL-btn FSL-btn--primary" data-take-quiz="${escape(quiz.id)}" ${state.complete || !quizRoutes[quiz.quiz_type] ? 'disabled' : ''}>${state.complete ? 'No attempts left' : state.used ? 'Take another attempt' : 'Take quiz'}<i data-lucide="${state.complete ? 'check' : 'arrow-right'}" aria-hidden="true"></i></button></article>`;
    }).join('') || '<div class="FSL-rooms-empty"><i data-lucide="notebook-pen" aria-hidden="true"></i><h3>You’re all caught up</h3><p>Your teacher hasn’t published quizzes in this room yet. Check back soon.</p></div>'}</div>`;
  container.append(backdrop, drawer);
  createIcons({ icons });
  document.body.classList.add('FSL-drawer-open');
  dismissDrawer = () => {
    backdrop.remove();
    drawer.remove();
    document.body.classList.remove('FSL-drawer-open');
    if (trigger.isConnected) trigger.focus();
    dismissDrawer = null;
  };
  backdrop.addEventListener('click', () => dismissDrawer?.());
  drawer.querySelector('.FSL-form-drawer__close').addEventListener('click', () => dismissDrawer?.());
  drawer.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismissDrawer?.(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...drawer.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  drawer.querySelectorAll('[data-take-quiz]').forEach(button => button.addEventListener('click', () => {
    const quiz = quizzes.find(item => item.id === button.dataset.takeQuiz);
    if (!quiz || quizState(quiz, attempts).complete || !quizRoutes[quiz.quiz_type]) return;
    sessionStorage.setItem('assignedQuiz', JSON.stringify(quiz));
    dismissDrawer?.();
    navigate(quizRoutes[quiz.quiz_type]);
  }));
  drawer.querySelector('button').focus();
}

export function unmount() {
  generation++;
  dismissDrawer?.();
}
