import { getProfile, getPublishedQuizzes, getStudentAttempts } from '../lib/classroom.js';
import { navigate } from '../router.js';

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export async function mount(container) {
  container.innerHTML = '<div class="asl-container"><div class="asl-card">Loading your classroom…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role === 'teacher') { navigate('#/teacher'); return; }
    if (profile.role === 'admin') { navigate('#/admin'); return; }
    const [quizzes, attempts] = await Promise.all([getPublishedQuizzes(), getStudentAttempts()]);
    const average = attempts.length ? Math.round(attempts.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / attempts.length) : 0;
    container.innerHTML = `
      <div class="asl-dashboard asl-container">
        <div class="asl-dashboard__heading"><div><span class="asl-eyebrow">Student dashboard</span><h1>Hello, ${escape(profile.full_name || 'learner')}!</h1><p>Pick up where you left off or take a quiz assigned by your teacher.</p></div><button id="go-learn" class="asl-btn asl-btn--secondary">Practice A–Z</button></div>
        <div class="asl-metric-grid"><div class="asl-metric"><strong>${attempts.length}</strong><span>Quizzes completed</span></div><div class="asl-metric"><strong>${average}%</strong><span>Average score</span></div><div class="asl-metric"><strong>${quizzes.length}</strong><span>Available quizzes</span></div></div>
        <section class="asl-section"><div class="asl-section__heading"><div><h2>Teacher quizzes</h2><p>Questions are randomized for each attempt.</p></div></div><div id="assigned-quizzes" class="asl-dashboard-grid"></div></section>
        <section class="asl-section"><h2>Recent scores</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Quiz</th><th>Score</th><th>Accuracy</th><th>Completed</th></tr></thead><tbody>${attempts.slice(0, 8).map(a => `<tr><td>${escape(a.quiz_type === 'alphabet' ? 'Alphabet translation' : 'Word spelling')}</td><td>${a.score} / ${a.max_score}</td><td>${Math.round(a.accuracy || 0)}%</td><td>${new Date(a.completed_at).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="4" class="asl-empty">No scores yet — your results will appear here.</td></tr>'}</tbody></table></div></section>
      </div>`;
    const list = container.querySelector('#assigned-quizzes');
    list.innerHTML = quizzes.length ? quizzes.map((quiz, index) => {
      const alreadyTaken = attempts.some(attempt => attempt.quiz_id === quiz.id);
      return `<article class="asl-assignment ${alreadyTaken ? 'asl-classroom-activity--completed' : ''}"><span class="asl-assignment__type">${quiz.quiz_type === 'alphabet' ? '🔤 Alphabet translation' : '✍️ Word spelling'}</span>${alreadyTaken ? '<span class="asl-status asl-status--taken">Already taken</span>' : ''}<h3>${escape(quiz.title)}</h3><p>${quiz.question_count} questions · ${quiz.quiz_type === 'alphabet' ? `${quiz.settings?.range_start || 'A'}–${quiz.settings?.range_end || 'Z'}` : 'Words selected by your teacher'}</p><button class="asl-btn asl-btn--primary start-assignment" data-index="${index}" ${alreadyTaken ? 'disabled aria-disabled="true"' : ''}>${alreadyTaken ? 'Already taken' : 'Start quiz'}</button></article>`;
    }).join('') : '<div class="asl-empty-card">No teacher quizzes are open right now.</div>';
    container.querySelector('#go-learn').addEventListener('click', () => navigate('#/learn'));
    list.querySelectorAll('.start-assignment').forEach(button => button.addEventListener('click', () => {
      const quiz = quizzes[Number(button.dataset.index)];
      if (attempts.some(attempt => attempt.quiz_id === quiz.id)) return;
      sessionStorage.setItem('assignedQuiz', JSON.stringify(quiz));
      navigate(quiz.quiz_type === 'alphabet' ? '#/quiz/letter' : '#/quiz/spelling');
    }));
  } catch (error) {
    container.innerHTML = `<div class="asl-container"><div class="asl-card"><h2>Classroom setup needed</h2><p>${escape(error.message)}</p><p>Run the supplied <code>supabase/schema.sql</code> in your Supabase SQL Editor to create the classroom tables.</p></div></div>`;
  }
}
export function unmount() {}
