import { createQuiz, getMyClassroom, getProfile, getTeacherAttempts, getTeacherQuizzes, getTeacherStudents } from '../lib/classroom.js';
import { navigate } from '../router.js';
import { WORDS } from '../data/words.js';
import { getSupportedWordSigns, normalizeWordSign } from '../data/wordSigns.js';
import { createIcons, icons } from 'lucide';

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const quizTypeLabel = type => ({
  alphabet: 'Alphabet translation',
  spelling: 'Word spelling',
  word_sign: 'Word sign recognition'
})[type] || type;

export async function mount(container) {
  container.innerHTML = '<div class="asl-container"><div class="asl-card">Loading teacher panel…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role !== 'teacher') {
      container.innerHTML = '<div class="asl-container"><div class="asl-card"><h2>Teacher access required</h2><p>Your account is currently registered as a student. Ask an administrator to update your role in Supabase.</p></div></div>';
      return;
    }
    const [quizzes, students, attempts, classroom, supportedWordSigns] = await Promise.all([
      getTeacherQuizzes(), getTeacherStudents(), getTeacherAttempts(), getMyClassroom(), getSupportedWordSigns()
    ]);
    render(container, profile, quizzes, students, attempts, classroom, supportedWordSigns);
  } catch (error) {
    container.innerHTML = `<div class="asl-container"><div class="asl-card"><h2>Teacher panel setup needed</h2><p>${escape(error.message)}</p><p>Run <code>supabase/schema.sql</code> in Supabase before using the panel.</p></div></div>`;
  }
}

function render(container, profile, quizzes, students, attempts, classroom, supportedWordSigns) {
  const attemptedStudents = new Set(attempts.map(a => a.student_id)).size;
  const average = attempts.length ? Math.round(attempts.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / attempts.length) : 0;
  container.innerHTML = `
    <div class="asl-dashboard asl-container">
      <div class="asl-dashboard__heading"><div><span class="asl-eyebrow">Teacher panel</span><h1>${escape(profile.full_name || 'Teacher')}’s classroom</h1><p>Create protected randomized quizzes and keep an eye on every learner.</p></div><div class="asl-room-code"><span>Student room code</span><strong>${escape(classroom?.join_code || 'Not available')}</strong><small>Students use this code when registering.</small></div></div>
      <div class="asl-metric-grid"><div class="asl-metric"><strong>${students.length}</strong><span>Registered students</span></div><div class="asl-metric"><strong>${attemptedStudents}</strong><span>Students assessed</span></div><div class="asl-metric"><strong>${average}%</strong><span>Class average</span></div><div class="asl-metric"><strong>${quizzes.filter(q => q.is_published).length}</strong><span>Active quizzes</span></div></div>
      <div class="asl-teacher-grid">
        <section class="asl-card"><h2>Create a quiz</h2><p class="asl-muted">Each student receives a randomized question order from the range you set.</p>
          <button type="button" class="asl-btn asl-btn--secondary asl-form-toggle" data-form-id="quiz-create-form" data-label="Create new quiz" aria-controls="quiz-create-form" aria-expanded="false">Create new quiz</button>
          <form id="quiz-create-form" class="asl-form" hidden>
            <label>Quiz title<input name="title" required maxlength="100" placeholder="e.g. Alphabet review 1"></label>
            <label>Quiz type<select name="quizType" id="quiz-type"><option value="alphabet">Alphabet translation</option><option value="spelling">Word spelling</option><option value="word_sign">Word sign recognition</option></select></label>
            <div id="alphabet-options"><div class="asl-form-row"><label>From<select name="rangeStart">${letters.map(l => `<option>${l}</option>`).join('')}</select></label><label>To<select name="rangeEnd">${letters.map(l => `<option ${l === 'Z' ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
            <div id="spelling-options" hidden><label>Words (comma-separated)<input name="words" value="${WORDS.slice(0, 5).join(', ')}" placeholder="HELLO, SCHOOL, FRIEND"></label></div>
            <div id="word-sign-options" hidden><label>Recognizable words<select name="wordSigns" id="word-sign-select" multiple size="${Math.max(3, supportedWordSigns.length)}" required>${supportedWordSigns.map(word => `<option value="${escape(word)}" selected>${escape(word)}</option>`).join('')}</select><small>Only words included in the trained model are available. Use Ctrl/Cmd-click to change multiple selections.</small></label></div>
            <label>Questions per student<input name="questionCount" type="number" min="1" max="26" value="10" required></label>
            <div class="asl-form-row"><label>Available from<input name="availableFrom" type="datetime-local"></label><label>Available until<input name="availableUntil" type="datetime-local"></label></div>
            <label class="asl-checkbox"><input type="checkbox" name="published" checked> Publish immediately</label>
            <div id="create-message" class="asl-form__message" aria-live="polite"></div><button class="asl-btn asl-btn--primary" type="submit">Create quiz</button>
          </form>
        </section>
        <section class="asl-card"><h2>Student list &amp; progression</h2><p class="asl-muted">Every registered student, with their quiz activity and average score.</p><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Student</th><th>Joined</th><th>Attempts</th><th>Average</th></tr></thead><tbody>${students.map(student => {
          const own = attempts.filter(a => a.student_id === student.id); const avg = own.length ? Math.round(own.reduce((sum,a) => sum + Number(a.accuracy || 0),0) / own.length) : '—';
          return `<tr><td>${escape(student.full_name || student.email)}</td><td>${new Date(student.created_at).toLocaleDateString()}</td><td>${own.length}</td><td>${avg === '—' ? avg : `${avg}%`}</td></tr>`;
        }).join('') || '<tr><td colspan="4" class="asl-empty">No students have registered yet.</td></tr>'}</tbody></table></div>
        </section>
      </div>
      <section class="asl-section"><h2>Quiz list</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Quiz</th><th>Type</th><th>Questions</th><th>Status</th><th>Created</th></tr></thead><tbody>${quizzes.map(q => `<tr><td>${escape(q.title)}</td><td>${escape(quizTypeLabel(q.quiz_type))}</td><td>${q.question_count}</td><td><span class="asl-status ${q.is_published ? 'asl-status--active' : ''}">${q.is_published ? 'Published' : 'Draft'}</span></td><td>${new Date(q.created_at).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="5" class="asl-empty">Create your first quiz above.</td></tr>'}</tbody></table></div></section>
      <section class="asl-section"><h2>Student scores</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>Accuracy</th><th>Completed</th></tr></thead><tbody>${attempts.slice(0, 20).map(a => `<tr><td>${escape(a.profiles?.full_name || a.profiles?.email || 'Student')}</td><td>${escape(a.quizzes?.title || quizTypeLabel(a.quiz_type))}</td><td>${a.score}/${a.max_score}</td><td>${Math.round(a.accuracy || 0)}%</td><td>${new Date(a.completed_at).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="5" class="asl-empty">Scores will appear when students complete quizzes.</td></tr>'}</tbody></table></div></section>
    </div>`;

  const drawerEntries = [];
  const closeDrawers = () => {
    drawerEntries.forEach(({ trigger, drawer, backdrop }) => {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      backdrop.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });
    document.body.classList.remove('asl-drawer-open');
  };

  container.querySelectorAll('.asl-form-toggle').forEach(trigger => {
    const form = container.querySelector(`#${trigger.dataset.formId}`);
    if (!form) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'asl-drawer-backdrop';
    const drawer = document.createElement('aside');
    drawer.className = 'asl-form-drawer';
    drawer.id = `${trigger.dataset.formId}-drawer`;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', trigger.dataset.label);
    drawer.innerHTML = `<div class="asl-form-drawer__header"><div><span class="asl-eyebrow">Teacher tools</span><h2>${trigger.dataset.label}</h2></div><button type="button" class="asl-form-drawer__close" aria-label="Close form"><i data-lucide="x"></i></button></div>`;
    form.hidden = false;
    drawer.append(form);
    container.append(backdrop, drawer);
    const entry = { trigger, drawer, backdrop };
    drawerEntries.push(entry);

    const openDrawer = () => {
      closeDrawers();
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      backdrop.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('asl-drawer-open');
      setTimeout(() => form.querySelector('input, select')?.focus(), 180);
    };
    trigger.addEventListener('click', openDrawer);
    backdrop.addEventListener('click', closeDrawers);
    drawer.querySelector('.asl-form-drawer__close').addEventListener('click', closeDrawers);
  });
  createIcons({ icons });

  const form = container.querySelector('#quiz-create-form');
  const type = container.querySelector('#quiz-type');
  const questionCountInput = form.querySelector('[name="questionCount"]');
  const wordSignSelect = container.querySelector('#word-sign-select');
  const supportedWordLookup = new Map(supportedWordSigns.map(word => [normalizeWordSign(word), word]));
  const updateQuestionLimit = () => {
    const selectedCount = wordSignSelect.selectedOptions.length;
    if (type.value === 'word_sign') {
      questionCountInput.max = String(Math.max(1, selectedCount));
      if (Number(questionCountInput.value) > selectedCount) questionCountInput.value = String(Math.max(1, selectedCount));
    } else {
      questionCountInput.max = '26';
    }
  };
  const updateQuizTypeOptions = () => {
    container.querySelector('#alphabet-options').hidden = type.value !== 'alphabet';
    container.querySelector('#spelling-options').hidden = type.value !== 'spelling';
    container.querySelector('#word-sign-options').hidden = type.value !== 'word_sign';
    wordSignSelect.disabled = type.value !== 'word_sign';
    wordSignSelect.required = type.value === 'word_sign';
    updateQuestionLimit();
  };
  type.addEventListener('change', updateQuizTypeOptions);
  wordSignSelect.addEventListener('change', updateQuestionLimit);
  updateQuizTypeOptions();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fd = new FormData(form); const message = container.querySelector('#create-message'); const button = form.querySelector('button');
    const quizType = fd.get('quizType');
    const questionCount = Number(fd.get('questionCount'));
    const rangeStart = fd.get('rangeStart'); const rangeEnd = fd.get('rangeEnd');
    const selectedWords = String(fd.get('words') || '').toUpperCase().split(',').map(word => word.trim()).filter(Boolean);
    const selectedWordSigns = fd.getAll('wordSigns')
      .map(word => supportedWordLookup.get(normalizeWordSign(word)))
      .filter(Boolean);
    if (quizType === 'alphabet' && rangeStart > rangeEnd) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'The end letter must come after the start letter.'; return; }
    if (quizType === 'spelling' && !selectedWords.length) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'Add at least one word for a spelling quiz.'; return; }
    if (quizType === 'word_sign' && !selectedWordSigns.length) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'Select at least one recognizable word.'; return; }
    if (quizType === 'word_sign' && questionCount > selectedWordSigns.length) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'The question count cannot exceed the selected words.'; return; }
    button.disabled = true;
    try {
      if (!classroom) throw new Error('Your teacher room is not ready yet. Contact an administrator.');
      const settings = quizType === 'alphabet'
        ? { range_start: rangeStart, range_end: rangeEnd }
        : { words: quizType === 'word_sign' ? selectedWordSigns : selectedWords };
      await createQuiz({ classroom_id: classroom.id, title: fd.get('title').trim(), quiz_type: quizType, question_count: questionCount, is_published: fd.has('published'), available_from: fd.get('availableFrom') || null, available_until: fd.get('availableUntil') || null, settings });
      message.className = 'asl-form__message asl-form__message--success'; message.textContent = 'Quiz created. Refreshing the list…';
      closeDrawers();
      setTimeout(() => mount(container), 500);
    } catch (error) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = error.message || 'Could not create quiz.'; button.disabled = false; }
  });
}
export function unmount() {
  document.body.classList.remove('asl-drawer-open');
}
