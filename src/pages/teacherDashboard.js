import {
  createQuiz,
  deleteAttempt,
  deleteQuiz,
  getMyClassroom,
  getProfile,
  getTeacherAttempts,
  getTeacherQuizzes,
  getTeacherStudents,
  removeStudentFromClassroom,
  updateAttemptScore,
  updateQuiz,
  updateStudentProfile
} from '../lib/classroom.js';
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
const wordQuizType = quiz => quiz?.settings?.quiz_type === 'two_words' ? 'two_words' : 'single_word';
const wordQuizTypeLabel = quiz => wordQuizType(quiz) === 'two_words' ? 'Two Words' : 'Single Word';
const getMaxAttempts = quiz => Math.max(1, Number(quiz?.max_attempts || 1));
const ordinalAttempt = value => ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][value - 1] || `Attempt ${value}`;
const attemptDate = value => value ? new Date(value).toLocaleDateString() : 'In progress';
const actionButton = (action, id, icon, label, variant = '') => `<button type="button" class="asl-icon-btn ${variant}" data-action="${action}" data-id="${escape(id)}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
let pendingTeacherMessage = null;

function attemptsWithNumbers(attempts) {
  const counts = new Map();
  return [...attempts]
    .sort((a, b) => new Date(a.started_at || a.completed_at || 0) - new Date(b.started_at || b.completed_at || 0))
    .map(attempt => {
      const key = `${attempt.student_id || 'student'}:${attempt.quiz_id || attempt.id}`;
      const attemptNumber = (counts.get(key) || 0) + 1;
      counts.set(key, attemptNumber);
      return { ...attempt, attemptNumber };
    });
}

function renderStudentAttemptHistory(students, attempts) {
  const numbered = attemptsWithNumbers(attempts);
  return students.map(student => {
    const own = numbered
      .filter(attempt => attempt.student_id === student.id)
      .sort((a, b) => new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0));
    const attemptList = own.length ? own.map(attempt => `
      <div class="asl-attempt-tree__attempt">
        <div class="asl-attempt-tree__main">
          <span>${escape(attempt.quizzes?.title || quizTypeLabel(attempt.quiz_type))}</span>
          <strong>${ordinalAttempt(attempt.attemptNumber)} attempt</strong>
          <small>${attempt.score}/${attempt.max_score} · ${Math.round(attempt.accuracy || 0)}% · ${attemptDate(attempt.completed_at)}</small>
        </div>
        <div class="asl-table-actions">
          ${actionButton('edit-attempt', attempt.id, 'pencil', 'Edit attempt score')}
          ${actionButton('delete-attempt', attempt.id, 'trash-2', 'Delete attempt record', 'asl-icon-btn--danger')}
        </div>
      </div>
    `).join('') : '<span class="asl-muted">No quiz attempts yet.</span>';
    return `<tr><td>${escape(student.full_name || student.email)}</td><td><div class="asl-attempt-tree">${attemptList}</div></td><td><div class="asl-table-actions">${actionButton('edit-student', student.id, 'pencil', 'Edit student name')}${actionButton('delete-student', student.id, 'trash-2', 'Remove student from classroom', 'asl-icon-btn--danger')}</div></td></tr>`;
  }).join('') || '<tr><td colspan="3" class="asl-empty">No students have registered yet.</td></tr>';
}

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
  const quizzesById = new Map(quizzes.map(quiz => [quiz.id, quiz]));
  const studentsById = new Map(students.map(student => [student.id, student]));
  const attemptsById = new Map(attempts.map(attempt => [attempt.id, attempt]));
  const actionMessage = pendingTeacherMessage;
  pendingTeacherMessage = null;
  container.innerHTML = `
    <div class="asl-dashboard asl-container">
      <div class="asl-dashboard__heading"><div><span class="asl-eyebrow">Teacher panel</span><h1>${escape(profile.full_name || 'Teacher')}’s classroom</h1><p>Create protected randomized quizzes and keep an eye on every learner.</p></div><div class="asl-room-code"><span>Student room code</span><strong>${escape(classroom?.join_code || 'Not available')}</strong><small>Students use this code when registering.</small></div></div>
      <div class="asl-metric-grid"><div class="asl-metric"><strong>${students.length}</strong><span>Registered students</span></div><div class="asl-metric"><strong>${attemptedStudents}</strong><span>Students assessed</span></div><div class="asl-metric"><strong>${average}%</strong><span>Class average</span></div><div class="asl-metric"><strong>${quizzes.filter(q => q.is_published).length}</strong><span>Active quizzes</span></div></div>
      <div id="teacher-action-message" class="asl-form__message ${actionMessage ? `asl-form__message--${actionMessage.type}` : ''}" aria-live="polite">${actionMessage ? escape(actionMessage.text) : ''}</div>
      <div class="asl-teacher-grid">
        <section class="asl-card"><h2>Create a quiz</h2><p class="asl-muted">Each student receives a randomized question order from the range you set.</p>
          <button type="button" class="asl-btn asl-btn--secondary asl-form-toggle" data-form-id="quiz-create-form" data-label="Create new quiz" aria-controls="quiz-create-form" aria-expanded="false">Create new quiz</button>
          <form id="quiz-create-form" class="asl-form" hidden>
            <label>Quiz title<input name="title" required maxlength="100" placeholder="e.g. Alphabet review 1"></label>
            <label>Quiz type<select name="quizType" id="quiz-type"><option value="alphabet">Alphabet translation</option><option value="spelling">Word spelling</option><option value="word_sign">Word sign recognition</option></select></label>
            <div id="alphabet-options"><div class="asl-form-row"><label>From<select name="rangeStart">${letters.map(l => `<option>${l}</option>`).join('')}</select></label><label>To<select name="rangeEnd">${letters.map(l => `<option ${l === 'Z' ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
            <div id="spelling-options" hidden><label>Words (comma-separated)<input name="words" value="${WORDS.slice(0, 5).join(', ')}" placeholder="HELLO, SCHOOL, FRIEND"></label></div>
            <div id="word-sign-options" hidden>
              <label>Word quiz format<select name="wordQuizType" id="word-quiz-type"><option value="single_word">Single Word</option><option value="two_words">Two Words</option></select></label>
              <div id="single-word-options"><label>Recognizable words<select name="wordSigns" id="word-sign-select" multiple size="${Math.max(3, supportedWordSigns.length)}" required>${supportedWordSigns.map(word => `<option value="${escape(word)}" selected>${escape(word)}</option>`).join('')}</select><small>Only words included in the trained model are available. Use Ctrl/Cmd-click to change multiple selections.</small></label></div>
              <div id="two-word-options" class="asl-form-row" hidden>
                <label>Word 1<select name="wordSign1" id="word-sign-1" required>${supportedWordSigns.map((word, index) => `<option value="${escape(word)}" ${index === 0 ? 'selected' : ''}>${escape(word)}</option>`).join('')}</select></label>
                <label>Word 2<select name="wordSign2" id="word-sign-2" required>${supportedWordSigns.map((word, index) => `<option value="${escape(word)}" ${index === 1 ? 'selected' : ''}>${escape(word)}</option>`).join('')}</select></label>
              </div>
              <small>Two-word signs are checked in the selected order and count as one question.</small>
            </div>
            <label id="question-count-field">Questions per student<input name="questionCount" type="number" min="1" max="26" value="10" required></label>
            <label>Allowed attempts per student<input name="maxAttempts" type="number" min="1" max="10" value="1" required><small>Set 2 if students can take the same quiz twice.</small></label>
            <div class="asl-form-row"><label>Available from<input name="availableFrom" type="datetime-local"></label><label>Available until<input name="availableUntil" type="datetime-local"></label></div>
            <label class="asl-checkbox"><input type="checkbox" name="published" checked> Publish immediately</label>
            <div id="create-message" class="asl-form__message" aria-live="polite"></div><button class="asl-btn asl-btn--primary" type="submit">Create quiz</button>
          </form>
        </section>
        <section class="asl-card"><h2>Student list &amp; progression</h2><p class="asl-muted">Every registered student, with their quiz activity and average score.</p><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Student</th><th>Joined</th><th>Attempts</th><th>Average</th><th>Actions</th></tr></thead><tbody>${students.map(student => {
          const own = attempts.filter(a => a.student_id === student.id); const avg = own.length ? Math.round(own.reduce((sum,a) => sum + Number(a.accuracy || 0),0) / own.length) : '—';
          return `<tr><td>${escape(student.full_name || student.email)}</td><td>${new Date(student.joined_at || student.created_at).toLocaleDateString()}</td><td>${own.length}</td><td>${avg === '—' ? avg : `${avg}%`}</td><td><div class="asl-table-actions">${actionButton('edit-student', student.id, 'pencil', 'Edit student name')}${actionButton('delete-student', student.id, 'trash-2', 'Remove student from classroom', 'asl-icon-btn--danger')}</div></td></tr>`;
        }).join('') || '<tr><td colspan="5" class="asl-empty">No students have registered yet.</td></tr>'}</tbody></table></div>
        </section>
      </div>
      <section class="asl-section"><h2>Quiz list</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Quiz</th><th>Type</th><th>Questions</th><th>Attempts</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>${quizzes.map(q => `<tr><td>${escape(q.title)}</td><td>${escape(quizTypeLabel(q.quiz_type))}${q.quiz_type === 'word_sign' ? `<br><small>${wordQuizTypeLabel(q)}</small>` : ''}</td><td>${q.question_count}</td><td>${getMaxAttempts(q)}</td><td><span class="asl-status ${q.is_published ? 'asl-status--active' : ''}">${q.is_published ? 'Published' : 'Draft'}</span></td><td>${new Date(q.created_at).toLocaleDateString()}</td><td><div class="asl-table-actions">${actionButton('edit-quiz', q.id, 'pencil', 'Edit quiz')}${actionButton('delete-quiz', q.id, 'trash-2', 'Delete quiz', 'asl-icon-btn--danger')}</div></td></tr>`).join('') || '<tr><td colspan="7" class="asl-empty">Create your first quiz above.</td></tr>'}</tbody></table></div></section>
      <section class="asl-section"><h2>Student attempt history</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Student</th><th>Recorded scores per attempt</th><th>Actions</th></tr></thead><tbody>${renderStudentAttemptHistory(students, attempts)}</tbody></table></div></section>
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

  const setActionMessage = (text, typeName = 'success') => {
    const message = container.querySelector('#teacher-action-message');
    if (!message) return;
    message.className = `asl-form__message asl-form__message--${typeName}`;
    message.textContent = text;
  };

  if (container.__teacherActionHandler) container.removeEventListener('click', container.__teacherActionHandler);
  const handleTeacherAction = async event => {
    const button = event.target.closest('[data-action]');
    if (!button || !container.contains(button)) return;
    const { action, id } = button.dataset;
    try {
      if (action === 'edit-student') {
        const student = studentsById.get(id);
        if (!student) throw new Error('Student record was not found.');
        const fullName = prompt('Student name', student.full_name || '');
        if (fullName === null) return;
        const trimmedName = fullName.trim();
        if (!trimmedName) throw new Error('Student name cannot be empty.');
        button.disabled = true;
        await updateStudentProfile(id, { full_name: trimmedName });
        pendingTeacherMessage = { text: 'Student updated.', type: 'success' };
        await mount(container);
        return;
      }
      if (action === 'delete-student') {
        const student = studentsById.get(id);
        if (!student) throw new Error('Student record was not found.');
        if (!classroom) throw new Error('Classroom record was not found.');
        if (!confirm(`Remove ${student.full_name || student.email} from this classroom?`)) return;
        button.disabled = true;
        await removeStudentFromClassroom(classroom.id, id);
        pendingTeacherMessage = { text: 'Student removed from the classroom.', type: 'success' };
        await mount(container);
        return;
      }
      if (action === 'edit-quiz') {
        const quiz = quizzesById.get(id);
        if (!quiz) throw new Error('Quiz record was not found.');
        const title = prompt('Quiz title', quiz.title);
        if (title === null) return;
        const maxAttempts = prompt('Allowed attempts per student (1-10)', String(getMaxAttempts(quiz)));
        if (maxAttempts === null) return;
        const questionCount = wordQuizType(quiz) === 'two_words'
          ? String(quiz.question_count)
          : prompt('Questions per student', String(quiz.question_count));
        if (questionCount === null) return;
        const nextAttempts = Number(maxAttempts);
        const nextQuestionCount = Number(questionCount);
        if (!title.trim()) throw new Error('Quiz title cannot be empty.');
        if (!Number.isInteger(nextAttempts) || nextAttempts < 1 || nextAttempts > 10) throw new Error('Allowed attempts must be between 1 and 10.');
        if (!Number.isInteger(nextQuestionCount) || nextQuestionCount < 1 || nextQuestionCount > 26) throw new Error('Questions per student must be between 1 and 26.');
        const status = prompt('Quiz status: published or draft', quiz.is_published ? 'published' : 'draft');
        if (status === null) return;
        const normalizedStatus = status.trim().toLowerCase();
        if (!['published', 'draft'].includes(normalizedStatus)) throw new Error('Quiz status must be published or draft.');
        button.disabled = true;
        await updateQuiz(id, {
          title: title.trim(),
          question_count: nextQuestionCount,
          max_attempts: nextAttempts,
          is_published: normalizedStatus === 'published'
        });
        pendingTeacherMessage = { text: 'Quiz updated.', type: 'success' };
        await mount(container);
        return;
      }
      if (action === 'delete-quiz') {
        const quiz = quizzesById.get(id);
        if (!quiz) throw new Error('Quiz record was not found.');
        if (!confirm(`Delete "${quiz.title}" and its attempt records?`)) return;
        button.disabled = true;
        await deleteQuiz(id);
        pendingTeacherMessage = { text: 'Quiz deleted.', type: 'success' };
        await mount(container);
        return;
      }
      if (action === 'edit-attempt') {
        const attempt = attemptsById.get(id);
        if (!attempt) throw new Error('Attempt record was not found.');
        const score = prompt('Score', String(attempt.score));
        if (score === null) return;
        const maxScore = prompt('Max score', String(attempt.max_score));
        if (maxScore === null) return;
        const nextScore = Number(score);
        const nextMaxScore = Number(maxScore);
        if (!Number.isInteger(nextScore) || nextScore < 0) throw new Error('Score must be 0 or higher.');
        if (!Number.isInteger(nextMaxScore) || nextMaxScore < 1) throw new Error('Max score must be at least 1.');
        if (nextScore > nextMaxScore) throw new Error('Score cannot exceed max score.');
        button.disabled = true;
        await updateAttemptScore(id, { score: nextScore, maxScore: nextMaxScore });
        pendingTeacherMessage = { text: 'Attempt score updated.', type: 'success' };
        await mount(container);
        return;
      }
      if (action === 'delete-attempt') {
        if (!attemptsById.has(id)) throw new Error('Attempt record was not found.');
        if (!confirm('Delete this attempt record?')) return;
        button.disabled = true;
        await deleteAttempt(id);
        pendingTeacherMessage = { text: 'Attempt record deleted.', type: 'success' };
        await mount(container);
      }
    } catch (error) {
      setActionMessage(error.message || 'Action failed.', 'error');
      button.disabled = false;
    }
  };
  container.__teacherActionHandler = handleTeacherAction;
  container.addEventListener('click', handleTeacherAction);

  const form = container.querySelector('#quiz-create-form');
  const type = container.querySelector('#quiz-type');
  const questionCountInput = form.querySelector('[name="questionCount"]');
  const wordSignSelect = container.querySelector('#word-sign-select');
  const wordQuizTypeSelect = container.querySelector('#word-quiz-type');
  const wordSign1Select = container.querySelector('#word-sign-1');
  const wordSign2Select = container.querySelector('#word-sign-2');
  const supportedWordLookup = new Map(supportedWordSigns.map(word => [normalizeWordSign(word), word]));
  const updateQuestionLimit = () => {
    const selectedCount = wordSignSelect.selectedOptions.length;
    if (type.value === 'word_sign') {
      if (wordQuizTypeSelect.value === 'two_words') {
        questionCountInput.min = '1';
        questionCountInput.max = '1';
        questionCountInput.value = '1';
        questionCountInput.readOnly = true;
      } else {
        questionCountInput.min = '1';
        questionCountInput.max = String(Math.max(1, selectedCount));
        questionCountInput.readOnly = false;
        if (Number(questionCountInput.value) > selectedCount) questionCountInput.value = String(Math.max(1, selectedCount));
      }
    } else {
      questionCountInput.min = '1';
      questionCountInput.max = '26';
      questionCountInput.readOnly = false;
    }
  };
  const updateQuizTypeOptions = () => {
    const isWordSign = type.value === 'word_sign';
    const isTwoWords = isWordSign && wordQuizTypeSelect.value === 'two_words';
    container.querySelector('#alphabet-options').hidden = type.value !== 'alphabet';
    container.querySelector('#spelling-options').hidden = type.value !== 'spelling';
    container.querySelector('#word-sign-options').hidden = !isWordSign;
    container.querySelector('#single-word-options').hidden = !isWordSign || isTwoWords;
    container.querySelector('#two-word-options').hidden = !isTwoWords;
    wordQuizTypeSelect.disabled = !isWordSign;
    wordSignSelect.disabled = !isWordSign || isTwoWords;
    wordSignSelect.required = isWordSign && !isTwoWords;
    wordSign1Select.disabled = !isTwoWords;
    wordSign2Select.disabled = !isTwoWords;
    wordSign1Select.required = isTwoWords;
    wordSign2Select.required = isTwoWords;
    updateQuestionLimit();
  };
  type.addEventListener('change', updateQuizTypeOptions);
  wordQuizTypeSelect.addEventListener('change', updateQuizTypeOptions);
  wordSignSelect.addEventListener('change', updateQuestionLimit);
  updateQuizTypeOptions();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fd = new FormData(form); const message = container.querySelector('#create-message'); const button = form.querySelector('button');
    const quizType = fd.get('quizType');
    const questionCount = Number(fd.get('questionCount'));
    const maxAttempts = Number(fd.get('maxAttempts'));
    const rangeStart = fd.get('rangeStart'); const rangeEnd = fd.get('rangeEnd');
    const selectedWords = String(fd.get('words') || '').toUpperCase().split(',').map(word => word.trim()).filter(Boolean);
    const selectedWordQuizType = fd.get('wordQuizType') === 'two_words' ? 'two_words' : 'single_word';
    const selectedWordSigns = fd.getAll('wordSigns')
      .map(word => supportedWordLookup.get(normalizeWordSign(word)))
      .filter(Boolean);
    const selectedPhrase = [fd.get('wordSign1'), fd.get('wordSign2')]
      .map(word => supportedWordLookup.get(normalizeWordSign(word)))
      .filter(Boolean);
    if (quizType === 'alphabet' && rangeStart > rangeEnd) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'The end letter must come after the start letter.'; return; }
    if (quizType === 'spelling' && !selectedWords.length) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'Add at least one word for a spelling quiz.'; return; }
    if (quizType === 'word_sign' && selectedWordQuizType === 'single_word' && !selectedWordSigns.length) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'Select at least one recognizable word.'; return; }
    if (quizType === 'word_sign' && selectedWordQuizType === 'single_word' && questionCount > selectedWordSigns.length) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'The question count cannot exceed the selected words.'; return; }
    if (quizType === 'word_sign' && selectedWordQuizType === 'two_words' && selectedPhrase.length !== 2) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'Select both words from the trained model list.'; return; }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = 'Allowed attempts must be between 1 and 10.'; return; }
    button.disabled = true;
    try {
      if (!classroom) throw new Error('Your teacher room is not ready yet. Contact an administrator.');
      const settings = quizType === 'alphabet'
        ? { range_start: rangeStart, range_end: rangeEnd }
        : quizType === 'word_sign'
          ? { quiz_type: selectedWordQuizType, words: selectedWordQuizType === 'two_words' ? selectedPhrase : selectedWordSigns }
          : { words: selectedWords };
      await createQuiz({ classroom_id: classroom.id, title: fd.get('title').trim(), quiz_type: quizType, question_count: selectedWordQuizType === 'two_words' && quizType === 'word_sign' ? 1 : questionCount, max_attempts: maxAttempts, is_published: fd.has('published'), available_from: fd.get('availableFrom') || null, available_until: fd.get('availableUntil') || null, settings });
      message.className = 'asl-form__message asl-form__message--success'; message.textContent = 'Quiz created. Refreshing the list…';
      closeDrawers();
      setTimeout(() => mount(container), 500);
    } catch (error) { message.className = 'asl-form__message asl-form__message--error'; message.textContent = error.message || 'Could not create quiz.'; button.disabled = false; }
  });
}
export function unmount() {
  document.body.classList.remove('asl-drawer-open');
}
