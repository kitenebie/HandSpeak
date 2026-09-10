import { getProfile, getPublishedQuizzes, getStudentAttempts } from '../lib/classroom.js';
import { navigate } from '../router.js';

const quizMeta = type => ({
  alphabet: { label: '🔤 Alphabet translation', detail: quiz => `${quiz.settings?.range_start || 'A'}–${quiz.settings?.range_end || 'Z'}`, route: '#/quiz/letter' },
  spelling: { label: '✍️ Word spelling', detail: () => 'Words selected by your teacher', route: '#/quiz/spelling' },
  word_sign: {
    label: '🤟 Word sign recognition',
    detail: quiz => quiz.settings?.quiz_type === 'two_words'
      ? `${(quiz.settings?.words || []).join(' → ')} · signs in order`
      : `${quiz.settings?.words?.length || quiz.question_count} selectable signs`,
    route: '#/quiz/word-sign'
  }
})[type] || { label: 'Quiz', detail: () => '', route: '#/quiz' };

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const getMaxAttempts = quiz => Math.max(1, Number(quiz?.max_attempts || 1));
const getQuizAttempts = (attempts, quizId) => attempts.filter(attempt => attempt.quiz_id === quizId);
const ordinalAttempt = value => ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][value - 1] || `Attempt ${value}`;
const attemptsWithNumbers = attempts => {
  const counts = new Map();
  return [...attempts]
    .sort((a, b) => new Date(a.started_at || a.completed_at || 0) - new Date(b.started_at || b.completed_at || 0))
    .map(attempt => {
      const key = `${attempt.student_id || 'student'}:${attempt.quiz_id || attempt.id}`;
      const attemptNumber = (counts.get(key) || 0) + 1;
      counts.set(key, attemptNumber);
      return { ...attempt, attemptNumber };
    })
    .sort((a, b) => new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0));
};

export async function mount(container) {
  container.innerHTML = '<div class="FSL-container"><div class="FSL-card">Loading your classroom…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role === 'teacher') { navigate('#/teacher'); return; }
    if (profile.role === 'admin') { navigate('#/admin'); return; }
    const [quizzes, attempts] = await Promise.all([getPublishedQuizzes(), getStudentAttempts()]);
    const numberedAttempts = attemptsWithNumbers(attempts);
    const openQuizzes = quizzes.filter(quiz => getQuizAttempts(attempts, quiz.id).length < getMaxAttempts(quiz));
    const average = attempts.length ? Math.round(attempts.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / attempts.length) : 0;
    container.innerHTML = `
      <div class="FSL-dashboard FSL-container">
        <div class="FSL-dashboard__heading"><div><span class="FSL-eyebrow">Student dashboard</span><h1>Hello, ${escape(profile.full_name || 'learner')}!</h1><p>Pick up where you left off or take a quiz assigned by your teacher.</p></div><button id="go-learn" class="FSL-btn FSL-btn--secondary">Practice A–Z</button></div>
        <div class="FSL-metric-grid"><div class="FSL-metric"><strong>${attempts.length}</strong><span>Quiz attempts completed</span></div><div class="FSL-metric"><strong>${average}%</strong><span>Average score</span></div><div class="FSL-metric"><strong>${openQuizzes.length}</strong><span>Quizzes with attempts left</span></div></div>
        <section class="FSL-section"><div class="FSL-section__heading"><div><h2>Teacher quizzes</h2><p>Questions are randomized for each attempt.</p></div></div><div id="assigned-quizzes" class="FSL-dashboard-grid"></div></section>
        <section class="FSL-section"><h2>Recent scores</h2><div class="FSL-table-wrap"><table class="FSL-table"><thead><tr><th>Quiz</th><th>Attempt</th><th>Score</th><th>Accuracy</th><th>Completed</th></tr></thead><tbody>${numberedAttempts.slice(0, 8).map(a => `<tr><td>${escape(a.quizzes?.title || quizMeta(a.quiz_type).label.replace(/^[^ ]+ /, ''))}</td><td>${ordinalAttempt(a.attemptNumber)} attempt</td><td>${a.score} / ${a.max_score}</td><td>${Math.round(a.accuracy || 0)}%</td><td>${new Date(a.completed_at).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="5" class="FSL-empty">No scores yet — your results will appear here.</td></tr>'}</tbody></table></div></section>
      </div>`;
    const list = container.querySelector('#assigned-quizzes');
    list.innerHTML = quizzes.length ? quizzes.map((quiz, index) => {
      const usedAttempts = getQuizAttempts(attempts, quiz.id).length;
      const maxAttempts = getMaxAttempts(quiz);
      const attemptsComplete = usedAttempts >= maxAttempts;
      const nextAttempt = Math.min(usedAttempts + 1, maxAttempts);
      const meta = quizMeta(quiz.quiz_type);
      return `<article class="FSL-assignment ${attemptsComplete ? 'FSL-classroom-activity--completed' : ''}"><span class="FSL-assignment__type">${meta.label}</span><span class="FSL-status ${attemptsComplete ? 'FSL-status--taken' : ''}">${usedAttempts}/${maxAttempts} attempts used</span><h3>${escape(quiz.title)}</h3><p>${quiz.question_count} ${Number(quiz.question_count) === 1 ? 'question' : 'questions'} · ${escape(meta.detail(quiz))}</p><br/><button class="FSL-btn FSL-btn--primary start-assignment" data-index="${index}" ${attemptsComplete ? 'disabled aria-disabled="true"' : ''}>${attemptsComplete ? 'Attempts complete' : `Start attempt ${nextAttempt}`}</button></article>`;
    }).join('') : '<div class="FSL-empty-card">No teacher quizzes are open right now.</div>';
    container.querySelector('#go-learn').addEventListener('click', () => navigate('#/learn'));
    list.querySelectorAll('.start-assignment').forEach(button => button.addEventListener('click', () => {
      const quiz = quizzes[Number(button.dataset.index)];
      if (getQuizAttempts(attempts, quiz.id).length >= getMaxAttempts(quiz)) return;
      sessionStorage.setItem('assignedQuiz', JSON.stringify(quiz));
      navigate(quizMeta(quiz.quiz_type).route);
    }));
  } catch (error) {
    container.innerHTML = `<div class="FSL-container"><div class="FSL-card"><h2>Classroom setup needed</h2><p>${escape(error.message)}</p><p>Run the supplied <code>supabase/schema.sql</code> in your Supabase SQL Editor to create the classroom tables.</p></div></div>`;
  }
}
export function unmount() {}
