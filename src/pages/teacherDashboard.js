import {
  createQuiz,
  deleteAttempt,
  deleteQuiz,
  getMyClassroom,
  getProfile,
  getTeacherAttempts,
  getTeacherQuizzes,
  getTeacherStudents,
  registerStudent,
  removeStudentFromClassroom,
  updateAttemptScore,
  updateQuiz,
  updateStudentProfile
} from '../lib/classroom.js';
import { navigate } from '../router.js';
import { WORDS } from '../data/words.js';
import { getSupportedWordSigns, normalizeWordSign } from '../data/wordSigns.js';
import { createIcons, icons } from 'lucide';
import ApexCharts from 'apexcharts';

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
const actionButton = (action, id, icon, label, variant = '') => `<button type="button" class="FSL-icon-btn ${variant}" data-action="${action}" data-id="${escape(id)}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
let pendingTeacherMessage = null;
let activeTeacherCharts = [];

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

const genderLabel = value => ({
  female: 'Female',
  male: 'Male',
  other: 'Other',
  unspecified: 'Unspecified'
})[value] || 'Unspecified';

function getTeacherView() {
  const path = window.location.hash.slice(1) || '/teacher';
  if (path.startsWith('/teacher/activities')) return 'activities';
  if (path.startsWith('/teacher/students')) return 'students';
  if (path.startsWith('/teacher/performance')) return 'performance';
  return 'dashboard';
}

function destroyTeacherCharts() {
  activeTeacherCharts.forEach(chart => {
    try { chart.destroy(); } catch {}
  });
  activeTeacherCharts = [];
}

function renderApexChart(container, selector, { labels, values, name, type = 'bar' }) {
  const target = container.querySelector(selector);
  if (!target) return;
  const hasData = values.some(value => Number(value) > 0);
  const options = {
    chart: { type, height: 280, toolbar: { show: false }, fontFamily: 'Inter, system-ui, sans-serif' },
    series: hasData ? (type === 'donut' ? values : [{ name, data: values }]) : [],
    ...(type === 'donut' ? { labels } : {}),
    ...(type === 'bar' ? {
      xaxis: { categories: labels, labels: { style: { colors: '#64748b' } } },
      yaxis: { labels: { style: { colors: '#64748b' } } },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '48%' } }
    } : {}),
    dataLabels: { enabled: true },
    colors: ['#2563eb', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'],
    grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
    legend: { position: 'bottom', labels: { colors: '#334155' } },
    noData: { text: hasData ? '' : 'No data yet' }
  };
  const chart = new ApexCharts(target, options);
  activeTeacherCharts.push(chart);
  chart.render();
}

function renderTeacherDashboardView({ profile, quizzes, students, attempts, classroom }) {
  const attemptedStudents = new Set(attempts.map(a => a.student_id)).size;
  const average = attempts.length ? Math.round(attempts.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / attempts.length) : 0;
  return `
    <div class="FSL-dashboard__heading">
      <div><span class="FSL-eyebrow">Teacher dashboard</span><h1>${escape(profile.full_name || 'Teacher')}’s classroom</h1><p>Quick stats and activity graphs for your class.</p></div>
      <div class="FSL-room-code"><span>Student room code</span><strong>${escape(classroom?.join_code || 'Not available')}</strong><small>Use this for self-registration.</small></div>
    </div>
    <div class="FSL-metric-grid"><div class="FSL-metric"><strong>${students.length}</strong><span>Registered students</span></div><div class="FSL-metric"><strong>${attemptedStudents}</strong><span>Students assessed</span></div><div class="FSL-metric"><strong>${average}%</strong><span>Class average</span></div><div class="FSL-metric"><strong>${quizzes.filter(q => q.is_published).length}</strong><span>Published quizzes</span></div></div>
    <div class="FSL-report-grid">
      <section class="FSL-card"><h2>Quiz types</h2><div id="teacher-quiz-types-chart" class="FSL-apex-chart"></div></section>
      <section class="FSL-card"><h2>Attempts by activity</h2><div id="teacher-attempt-types-chart" class="FSL-apex-chart"></div></section>
    </div>`;
}

function renderTeacherDashboardCharts(container, { quizzes, attempts }) {
  const types = ['alphabet', 'spelling', 'word_sign'];
  const labels = types.map(type => quizTypeLabel(type));
  renderApexChart(container, '#teacher-quiz-types-chart', {
    labels,
    values: types.map(type => quizzes.filter(quiz => quiz.quiz_type === type).length),
    name: 'Quizzes',
    type: 'donut'
  });
  renderApexChart(container, '#teacher-attempt-types-chart', {
    labels,
    values: types.map(type => attempts.filter(attempt => attempt.quiz_type === type).length),
    name: 'Attempts'
  });
}

function renderCreateQuizCard(supportedWordSigns) {
  return `
    <section class="FSL-card"><h2>Create a quiz</h2><p class="FSL-muted">Each student receives a randomized question order from the range you set.</p>
      <button type="button" class="FSL-btn FSL-btn--primary FSL-form-toggle" data-form-id="quiz-create-form" data-label="Create new quiz" aria-controls="quiz-create-form" aria-expanded="false"><i data-lucide="plus"></i>Create Quiz</button>
      <form id="quiz-create-form" class="FSL-form" hidden>
        <label>Quiz title<input name="title" required maxlength="100" placeholder="e.g. Alphabet review 1"></label>
        <label>Quiz type<select name="quizType" id="quiz-type"><option value="alphabet">Alphabet translation</option><option value="spelling">Word spelling</option><option value="word_sign">Word sign recognition</option></select></label>
        <div id="alphabet-options"><div class="FSL-form-row"><label>From<select name="rangeStart">${letters.map(l => `<option>${l}</option>`).join('')}</select></label><label>To<select name="rangeEnd">${letters.map(l => `<option ${l === 'Z' ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
        <div id="spelling-options" hidden><label>Words (comma-separated)<input name="words" value="${WORDS.slice(0, 5).join(', ')}" placeholder="HELLO, SCHOOL, FRIEND"></label></div>
        <div id="word-sign-options" hidden>
          <label>Word quiz format<select name="wordQuizType" id="word-quiz-type"><option value="single_word">Single Word</option><option value="two_words">Two Words</option></select></label>
          <div id="single-word-options"><label>Recognizable words<select name="wordSigns" id="word-sign-select" multiple size="${Math.max(3, supportedWordSigns.length)}" required>${supportedWordSigns.map(word => `<option value="${escape(word)}" selected>${escape(word)}</option>`).join('')}</select><small>Only words included in the trained model are available. Use Ctrl/Cmd-click to change multiple selections.</small></label></div>
          <div id="two-word-options" class="FSL-form-row" hidden>
            <label>Word 1<select name="wordSign1" id="word-sign-1" required>${supportedWordSigns.map((word, index) => `<option value="${escape(word)}" ${index === 0 ? 'selected' : ''}>${escape(word)}</option>`).join('')}</select></label>
            <label>Word 2<select name="wordSign2" id="word-sign-2" required>${supportedWordSigns.map((word, index) => `<option value="${escape(word)}" ${index === 1 ? 'selected' : ''}>${escape(word)}</option>`).join('')}</select></label>
          </div>
          <small>Two-word signs are checked in the selected order and count as one question.</small>
        </div>
        <label id="question-count-field">Questions per student<input name="questionCount" type="number" min="1" max="26" value="10" required></label>
        <label>Allowed attempts per student<input name="maxAttempts" type="number" min="1" max="10" value="1" required><small>Set 2 if students can take the same quiz twice.</small></label>
        <div class="FSL-form-row"><label>Available from<input name="availableFrom" type="datetime-local"></label><label>Available until<input name="availableUntil" type="datetime-local"></label></div>
        <label class="FSL-checkbox"><input type="checkbox" name="published" checked> Publish immediately</label>
        <div id="create-message" class="FSL-form__message" aria-live="polite"></div><button class="FSL-btn FSL-btn--primary" type="submit">Create quiz</button>
      </form>
    </section>`;
}

function renderQuizTable(quizzes) {
  return `<div class="FSL-table-wrap"><table class="FSL-table"><thead><tr><th>Quiz</th><th>Type</th><th>Questions</th><th>Attempts</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>${quizzes.map(q => `<tr><td>${escape(q.title)}</td><td>${escape(quizTypeLabel(q.quiz_type))}${q.quiz_type === 'word_sign' ? `<br><small>${wordQuizTypeLabel(q)}</small>` : ''}</td><td>${q.question_count}</td><td>${getMaxAttempts(q)}</td><td><span class="FSL-status ${q.is_published ? 'FSL-status--active' : ''}">${q.is_published ? 'Published' : 'Draft'}</span></td><td>${new Date(q.created_at).toLocaleDateString()}</td><td><div class="FSL-table-actions">${actionButton('edit-quiz', q.id, 'pencil', 'Edit quiz')}${actionButton('delete-quiz', q.id, 'trash-2', 'Delete quiz', 'FSL-icon-btn--danger')}</div></td></tr>`).join('') || '<tr><td colspan="7" class="FSL-empty">Create your first quiz above.</td></tr>'}</tbody></table></div>`;
}

function renderStudentRows(students, attempts) {
  return students.map(student => {
    const own = attempts.filter(a => a.student_id === student.id);
    const avg = own.length ? Math.round(own.reduce((sum,a) => sum + Number(a.accuracy || 0),0) / own.length) : '-';
    return `<tr><td>${escape(student.full_name || student.email)}</td><td>${escape(student.email || '-')}</td><td>${escape(genderLabel(student.gender))}</td><td>${new Date(student.joined_at || student.created_at).toLocaleDateString()}</td><td>${own.length}</td><td>${avg === '-' ? avg : `${avg}%`}</td><td><div class="FSL-table-actions">${actionButton('edit-student', student.id, 'pencil', 'Edit student')}${actionButton('delete-student', student.id, 'trash-2', 'Remove student', 'FSL-icon-btn--danger')}</div></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="FSL-empty">No students have registered yet.</td></tr>';
}

function renderPerformanceRows(attempts, filters = {}) {
  let rows = attemptsWithNumbers(attempts);
  if (filters.quizId) rows = rows.filter(attempt => attempt.quiz_id === filters.quizId);
  if (filters.quizType) rows = rows.filter(attempt => attempt.quiz_type === filters.quizType);
  rows.sort((a, b) => {
    if (filters.sort === 'lowest') return Number(a.accuracy || 0) - Number(b.accuracy || 0);
    if (filters.sort === 'highest') return Number(b.accuracy || 0) - Number(a.accuracy || 0);
    if (filters.sort === 'oldest') return new Date(a.completed_at || a.started_at || 0) - new Date(b.completed_at || b.started_at || 0);
    return new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0);
  });
  return rows.map(attempt => `<tr><td>${escape(attempt.profiles?.full_name || attempt.profiles?.email || 'Student')}</td><td>${escape(attempt.quizzes?.title || quizTypeLabel(attempt.quiz_type))}</td><td>${escape(quizTypeLabel(attempt.quiz_type))}</td><td>${ordinalAttempt(attempt.attemptNumber)}</td><td>${attempt.score} / ${attempt.max_score}</td><td>${Math.round(attempt.accuracy || 0)}%</td><td>${attemptDate(attempt.completed_at)}</td><td><div class="FSL-table-actions">${actionButton('edit-attempt', attempt.id, 'pencil', 'Edit score')}${actionButton('delete-attempt', attempt.id, 'trash-2', 'Delete attempt', 'FSL-icon-btn--danger')}</div></td></tr>`).join('') || '<tr><td colspan="8" class="FSL-empty">No matching performance records.</td></tr>';
}

function renderStudentAttemptHistory(students, attempts) {
  const numbered = attemptsWithNumbers(attempts);
  return students.map(student => {
    const own = numbered
      .filter(attempt => attempt.student_id === student.id)
      .sort((a, b) => new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0));
    const attemptList = own.length ? own.map(attempt => `
      <div class="FSL-attempt-tree__attempt">
        <div class="FSL-attempt-tree__main">
          <span>${escape(attempt.quizzes?.title || quizTypeLabel(attempt.quiz_type))}</span>
          <strong>${ordinalAttempt(attempt.attemptNumber)} attempt</strong>
          <small>${attempt.score}/${attempt.max_score} · ${Math.round(attempt.accuracy || 0)}% · ${attemptDate(attempt.completed_at)}</small>
        </div>
        <div class="FSL-table-actions">
          ${actionButton('edit-attempt', attempt.id, 'pencil', 'Edit attempt score')}
          ${actionButton('delete-attempt', attempt.id, 'trash-2', 'Delete attempt record', 'FSL-icon-btn--danger')}
        </div>
      </div>
    `).join('') : '<span class="FSL-muted">No quiz attempts yet.</span>';
    return `<tr><td>${escape(student.full_name || student.email)}</td><td><div class="FSL-attempt-tree">${attemptList}</div></td><td><div class="FSL-table-actions">${actionButton('edit-student', student.id, 'pencil', 'Edit student name')}${actionButton('delete-student', student.id, 'trash-2', 'Remove student from classroom', 'FSL-icon-btn--danger')}</div></td></tr>`;
  }).join('') || '<tr><td colspan="3" class="FSL-empty">No students have registered yet.</td></tr>';
}

export async function mount(container) {
  document.body.classList.remove('FSL-modal-open');
  container.innerHTML = '<div class="FSL-container"><div class="FSL-card">Loading teacher panel…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role !== 'teacher') {
      container.innerHTML = '<div class="FSL-container"><div class="FSL-card"><h2>Teacher access required</h2><p>Your account is currently registered as a student. Ask an administrator to update your role in Supabase.</p></div></div>';
      return;
    }
    const [quizzes, students, attempts, classroom, supportedWordSigns] = await Promise.all([
      getTeacherQuizzes(), getTeacherStudents(), getTeacherAttempts(), getMyClassroom(), getSupportedWordSigns()
    ]);
    render(container, profile, quizzes, students, attempts, classroom, supportedWordSigns);
  } catch (error) {
    container.innerHTML = `<div class="FSL-container"><div class="FSL-card"><h2>Unable to load teacher panel</h2><p>${escape(error.message)}</p><p>Please try reloading the page.</p></div></div>`;
  }
}

function render(container, profile, quizzes, students, attempts, classroom, supportedWordSigns) {
  destroyTeacherCharts();
  const quizzesById = new Map(quizzes.map(quiz => [quiz.id, quiz]));
  const studentsById = new Map(students.map(student => [student.id, student]));
  const attemptsById = new Map(attempts.map(attempt => [attempt.id, attempt]));
  const actionMessage = pendingTeacherMessage;
  pendingTeacherMessage = null;
  const view = getTeacherView();
  const content = {
    dashboard: renderTeacherDashboardView({ profile, quizzes, students, attempts, classroom }),
    activities: `
      <div class="FSL-section__heading">
        <div><span class="FSL-eyebrow">Teacher activities</span><h1>Activities</h1><p>Manage quizzes and publish classroom work.</p></div>
      </div>
      ${renderCreateQuizCard(supportedWordSigns)}
      <section class="FSL-section"><h2>Quizzes list</h2>${renderQuizTable(quizzes)}</section>`,
    students: `
      <div class="FSL-section__heading">
        <div><span class="FSL-eyebrow">Teacher records</span><h1>Student List</h1><p>Manage student records connected to your classroom.</p></div>
        <button type="button" class="FSL-btn FSL-btn--primary" data-action="register-student"><i data-lucide="user-plus"></i>Register Student</button>
      </div>
      <section class="FSL-section"><div class="FSL-table-wrap"><table class="FSL-table"><thead><tr><th>Student</th><th>Email</th><th>Gender</th><th>Joined</th><th>Attempts</th><th>Average</th><th>Actions</th></tr></thead><tbody>${renderStudentRows(students, attempts)}</tbody></table></div></section>`,
    performance: `
      <div class="FSL-section__heading"><div><span class="FSL-eyebrow">Teacher reports</span><h1>Performance</h1><p>Filter quiz attempts by quiz, type, and score order.</p></div></div>
      <section class="FSL-card FSL-filter-panel">
        <label>Quiz<select id="performance-filter-quiz"><option value="">All quizzes</option>${quizzes.map(quiz => `<option value="${escape(quiz.id)}">${escape(quiz.title)}</option>`).join('')}</select></label>
        <label>Type<select id="performance-filter-type"><option value="">All types</option><option value="alphabet">Alphabet</option><option value="spelling">Spelling</option><option value="word_sign">Word sign</option></select></label>
        <label>Sort<select id="performance-filter-sort"><option value="recent">Most recent</option><option value="highest">Highest score</option><option value="lowest">Lowest score</option><option value="oldest">Oldest</option></select></label>
      </section>
      <section class="FSL-section"><div class="FSL-table-wrap"><table class="FSL-table"><thead><tr><th>Student</th><th>Quiz</th><th>Type</th><th>Attempt</th><th>Score</th><th>Accuracy</th><th>Completed</th><th>Actions</th></tr></thead><tbody id="performance-table-body">${renderPerformanceRows(attempts)}</tbody></table></div></section>`
  }[view];

  container.innerHTML = `
    <div class="FSL-dashboard FSL-container">
      <div id="teacher-action-message" class="FSL-form__message ${actionMessage ? `FSL-form__message--${actionMessage.type}` : ''}" aria-live="polite">${actionMessage ? escape(actionMessage.text) : ''}</div>
      ${content}
    </div>`;

  const drawerEntries = [];
  const closeDrawers = () => {
    drawerEntries.forEach(({ trigger, drawer, backdrop }) => {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      backdrop.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });
    document.body.classList.remove('FSL-drawer-open');
  };

  container.querySelectorAll('.FSL-form-toggle').forEach(trigger => {
    const form = container.querySelector(`#${trigger.dataset.formId}`);
    if (!form) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'FSL-drawer-backdrop';
    const drawer = document.createElement('aside');
    drawer.className = 'FSL-form-drawer';
    drawer.id = `${trigger.dataset.formId}-drawer`;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', trigger.dataset.label);
    drawer.innerHTML = `<div class="FSL-form-drawer__header"><div><span class="FSL-eyebrow">Teacher tools</span><h2>${trigger.dataset.label}</h2></div><button type="button" class="FSL-form-drawer__close" aria-label="Close form"><i data-lucide="x"></i></button></div>`;
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
      document.body.classList.add('FSL-drawer-open');
      setTimeout(() => form.querySelector('input, select')?.focus(), 180);
    };
    trigger.addEventListener('click', openDrawer);
    backdrop.addEventListener('click', closeDrawers);
    drawer.querySelector('.FSL-form-drawer__close').addEventListener('click', closeDrawers);
  });
  createIcons({ icons });
  if (view === 'dashboard') renderTeacherDashboardCharts(container, { quizzes, attempts });

  const setActionMessage = (text, typeName = 'success') => {
    const message = container.querySelector('#teacher-action-message');
    if (!message) return;
    message.className = `FSL-form__message FSL-form__message--${typeName}`;
    message.textContent = text;
  };

  const closeModal = () => {
    container.querySelector('.FSL-modal-backdrop')?.remove();
    document.body.classList.remove('FSL-modal-open');
  };

  const openEditModal = ({ title, description, body, onSubmit }) => {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'FSL-modal-backdrop is-open';
    backdrop.innerHTML = `
      <section class="FSL-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-modal-title">
        <div class="FSL-modal__header">
          <div><span class="FSL-eyebrow">Edit record</span><h2 id="teacher-modal-title">${escape(title)}</h2>${description ? `<p>${escape(description)}</p>` : ''}</div>
          <button type="button" class="FSL-modal__close" aria-label="Close edit form"><i data-lucide="x"></i></button>
        </div>
        <form class="FSL-form FSL-modal__form">
          ${body}
          <div id="teacher-modal-message" class="FSL-form__message" aria-live="polite"></div>
          <div class="FSL-modal__actions">
            <button type="button" class="FSL-btn FSL-btn--secondary" data-modal-close>Cancel</button>
            <button type="submit" class="FSL-btn FSL-btn--primary">Save changes</button>
          </div>
        </form>
      </section>`;
    container.append(backdrop);
    document.body.classList.add('FSL-modal-open');
    createIcons({ icons });

    const form = backdrop.querySelector('form');
    const message = backdrop.querySelector('#teacher-modal-message');
    const submitButton = form.querySelector('[type="submit"]');
    const showModalError = error => {
      message.className = 'FSL-form__message FSL-form__message--error';
      message.textContent = error.message || 'Could not update record.';
      submitButton.disabled = false;
    };

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.closest('[data-modal-close], .FSL-modal__close')) closeModal();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submitButton.disabled = true;
      message.textContent = '';
      try {
        await onSubmit(new FormData(form));
        closeModal();
      } catch (error) {
        showModalError(error);
      }
    });
    setTimeout(() => form.querySelector('input:not([disabled]), select:not([disabled])')?.focus(), 80);
  };

  const openConfirmModal = ({ title, description, confirmLabel, onConfirm }) => {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'FSL-modal-backdrop is-open';
    backdrop.innerHTML = `
      <section class="FSL-modal FSL-modal--confirm" role="dialog" aria-modal="true" aria-labelledby="teacher-confirm-title">
        <div class="FSL-modal__header">
          <div><span class="FSL-eyebrow">Confirm action</span><h2 id="teacher-confirm-title">${escape(title)}</h2><p>${escape(description)}</p></div>
          <button type="button" class="FSL-modal__close" aria-label="Close confirmation"><i data-lucide="x"></i></button>
        </div>
        <div id="teacher-confirm-message" class="FSL-form__message" aria-live="polite"></div>
        <div class="FSL-modal__actions">
          <button type="button" class="FSL-btn FSL-btn--secondary" data-modal-close>Cancel</button>
          <button type="button" class="FSL-btn FSL-btn--danger" data-confirm-action>${escape(confirmLabel)}</button>
        </div>
      </section>`;
    container.append(backdrop);
    document.body.classList.add('FSL-modal-open');
    createIcons({ icons });

    const confirmButton = backdrop.querySelector('[data-confirm-action]');
    const message = backdrop.querySelector('#teacher-confirm-message');
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.closest('[data-modal-close], .FSL-modal__close')) closeModal();
    });
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      message.textContent = '';
      try {
        await onConfirm();
        closeModal();
      } catch (error) {
        message.className = 'FSL-form__message FSL-form__message--error';
        message.textContent = error.message || 'Could not complete action.';
        confirmButton.disabled = false;
      }
    });
    setTimeout(() => confirmButton.focus(), 80);
  };

  const openStudentEditModal = student => {
    openEditModal({
      title: 'Student details',
      description: student.email,
      body: `
        <label>Student name<input name="fullName" required maxlength="120" value="${escape(student.full_name || '')}" placeholder="Student full name"></label>
        <label>Gender<select name="gender"><option value="unspecified" ${student.gender === 'unspecified' || !student.gender ? 'selected' : ''}>Unspecified</option><option value="female" ${student.gender === 'female' ? 'selected' : ''}>Female</option><option value="male" ${student.gender === 'male' ? 'selected' : ''}>Male</option><option value="other" ${student.gender === 'other' ? 'selected' : ''}>Other</option></select></label>`,
      onSubmit: async fields => {
        const fullName = String(fields.get('fullName') || '').trim();
        if (!fullName) throw new Error('Student name cannot be empty.');
        await updateStudentProfile(student.id, { full_name: fullName, gender: String(fields.get('gender') || 'unspecified') });
        pendingTeacherMessage = { text: 'Student updated.', type: 'success' };
        await mount(container);
      }
    });
  };

  const openQuizEditModal = quiz => {
    const isTwoWords = wordQuizType(quiz) === 'two_words';
    openEditModal({
      title: 'Quiz details',
      description: quizTypeLabel(quiz.quiz_type),
      body: `
        <label>Quiz title<input name="title" required maxlength="100" value="${escape(quiz.title)}"></label>
        <div class="FSL-form-row">
          <label>Questions per student<input name="questionCount" type="number" min="1" max="26" value="${quiz.question_count}" required ${isTwoWords ? 'readonly' : ''}></label>
          <label>Allowed attempts<input name="maxAttempts" type="number" min="1" max="10" value="${getMaxAttempts(quiz)}" required></label>
        </div>
        <label>Status<select name="status" required><option value="published" ${quiz.is_published ? 'selected' : ''}>Published</option><option value="draft" ${!quiz.is_published ? 'selected' : ''}>Draft</option></select></label>`,
      onSubmit: async fields => {
        const title = String(fields.get('title') || '').trim();
        const questionCount = Number(fields.get('questionCount'));
        const maxAttempts = Number(fields.get('maxAttempts'));
        const status = String(fields.get('status') || '').trim();
        if (!title) throw new Error('Quiz title cannot be empty.');
        if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 26) throw new Error('Questions per student must be between 1 and 26.');
        if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error('Allowed attempts must be between 1 and 10.');
        await updateQuiz(quiz.id, {
          title,
          question_count: questionCount,
          max_attempts: maxAttempts,
          is_published: status === 'published'
        });
        pendingTeacherMessage = { text: 'Quiz updated.', type: 'success' };
        await mount(container);
      }
    });
  };

  const openAttemptEditModal = attempt => {
    openEditModal({
      title: 'Attempt score',
      description: `${attempt.profiles?.full_name || attempt.profiles?.email || 'Student'} · ${attempt.quizzes?.title || quizTypeLabel(attempt.quiz_type)}`,
      body: `
        <div class="FSL-form-row">
          <label>Score<input name="score" type="number" min="0" value="${attempt.score}" required></label>
          <label>Max score<input name="maxScore" type="number" min="1" value="${attempt.max_score}" required></label>
        </div>`,
      onSubmit: async fields => {
        const score = Number(fields.get('score'));
        const maxScore = Number(fields.get('maxScore'));
        if (!Number.isInteger(score) || score < 0) throw new Error('Score must be 0 or higher.');
        if (!Number.isInteger(maxScore) || maxScore < 1) throw new Error('Max score must be at least 1.');
        if (score > maxScore) throw new Error('Score cannot exceed max score.');
        await updateAttemptScore(attempt.id, { score, maxScore });
        pendingTeacherMessage = { text: 'Attempt score updated.', type: 'success' };
        await mount(container);
      }
    });
  };

  const openRegisterStudentModal = () => {
    if (!classroom) {
      setActionMessage('Your teacher room is not ready yet. Contact an administrator.', 'error');
      return;
    }
    openEditModal({
      title: 'Register student',
      description: `Classroom code: ${classroom.join_code}`,
      body: `
        <label>Student name<input name="fullName" required maxlength="120" placeholder="Student full name"></label>
        <label>Email<input name="email" type="email" required placeholder="student@example.com"></label>
        <div class="FSL-form-row">
          <label>Gender<select name="gender"><option value="unspecified">Unspecified</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
          <label>Temporary password<input name="password" type="password" minlength="6" required placeholder="At least 6 characters"></label>
        </div>`,
      onSubmit: async fields => {
        await registerStudent({
          classroomId: classroom.id,
          fullName: String(fields.get('fullName') || '').trim(),
          email: String(fields.get('email') || '').trim(),
          gender: String(fields.get('gender') || 'unspecified'),
          password: String(fields.get('password') || '')
        });
        pendingTeacherMessage = { text: 'Student registered and added to the classroom.', type: 'success' };
        await mount(container);
      }
    });
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
        openStudentEditModal(student);
        return;
      }
      if (action === 'register-student') {
        openRegisterStudentModal();
        return;
      }
      if (action === 'delete-student') {
        const student = studentsById.get(id);
        if (!student) throw new Error('Student record was not found.');
        if (!classroom) throw new Error('Classroom record was not found.');
        openConfirmModal({
          title: 'Remove student?',
          description: `${student.full_name || student.email} will be removed from this classroom.`,
          confirmLabel: 'Remove student',
          onConfirm: async () => {
            await removeStudentFromClassroom(classroom.id, id);
            pendingTeacherMessage = { text: 'Student removed from the classroom.', type: 'success' };
            await mount(container);
          }
        });
        return;
      }
      if (action === 'edit-quiz') {
        const quiz = quizzesById.get(id);
        if (!quiz) throw new Error('Quiz record was not found.');
        openQuizEditModal(quiz);
        return;
      }
      if (action === 'delete-quiz') {
        const quiz = quizzesById.get(id);
        if (!quiz) throw new Error('Quiz record was not found.');
        openConfirmModal({
          title: 'Delete quiz?',
          description: `"${quiz.title}" and its attempt records will be deleted.`,
          confirmLabel: 'Delete quiz',
          onConfirm: async () => {
            await deleteQuiz(id);
            pendingTeacherMessage = { text: 'Quiz deleted.', type: 'success' };
            await mount(container);
          }
        });
        return;
      }
      if (action === 'edit-attempt') {
        const attempt = attemptsById.get(id);
        if (!attempt) throw new Error('Attempt record was not found.');
        openAttemptEditModal(attempt);
        return;
      }
      if (action === 'delete-attempt') {
        const attempt = attemptsById.get(id);
        if (!attempt) throw new Error('Attempt record was not found.');
        openConfirmModal({
          title: 'Delete attempt record?',
          description: `${attempt.profiles?.full_name || attempt.profiles?.email || 'Student'}'s recorded score will be deleted.`,
          confirmLabel: 'Delete attempt',
          onConfirm: async () => {
            await deleteAttempt(id);
            pendingTeacherMessage = { text: 'Attempt record deleted.', type: 'success' };
            await mount(container);
          }
        });
      }
    } catch (error) {
      setActionMessage(error.message || 'Action failed.', 'error');
      button.disabled = false;
    }
  };
  container.__teacherActionHandler = handleTeacherAction;
  container.addEventListener('click', handleTeacherAction);

  const performanceFilters = [
    container.querySelector('#performance-filter-quiz'),
    container.querySelector('#performance-filter-type'),
    container.querySelector('#performance-filter-sort')
  ];
  const updatePerformanceTable = () => {
    const body = container.querySelector('#performance-table-body');
    if (!body) return;
    body.innerHTML = renderPerformanceRows(attempts, {
      quizId: container.querySelector('#performance-filter-quiz')?.value || '',
      quizType: container.querySelector('#performance-filter-type')?.value || '',
      sort: container.querySelector('#performance-filter-sort')?.value || 'recent'
    });
    createIcons({ icons });
  };
  performanceFilters.forEach(filter => filter?.addEventListener('change', updatePerformanceTable));

  const form = container.querySelector('#quiz-create-form');
  if (!form) return;
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
    if (quizType === 'alphabet' && rangeStart > rangeEnd) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = 'The end letter must come after the start letter.'; return; }
    if (quizType === 'spelling' && !selectedWords.length) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = 'Add at least one word for a spelling quiz.'; return; }
    if (quizType === 'word_sign' && selectedWordQuizType === 'single_word' && !selectedWordSigns.length) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = 'Select at least one recognizable word.'; return; }
    if (quizType === 'word_sign' && selectedWordQuizType === 'single_word' && questionCount > selectedWordSigns.length) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = 'The question count cannot exceed the selected words.'; return; }
    if (quizType === 'word_sign' && selectedWordQuizType === 'two_words' && selectedPhrase.length !== 2) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = 'Select both words from the trained model list.'; return; }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = 'Allowed attempts must be between 1 and 10.'; return; }
    button.disabled = true;
    try {
      if (!classroom) throw new Error('Your teacher room is not ready yet. Contact an administrator.');
      const settings = quizType === 'alphabet'
        ? { range_start: rangeStart, range_end: rangeEnd }
        : quizType === 'word_sign'
          ? { quiz_type: selectedWordQuizType, words: selectedWordQuizType === 'two_words' ? selectedPhrase : selectedWordSigns }
          : { words: selectedWords };
      await createQuiz({ classroom_id: classroom.id, title: fd.get('title').trim(), quiz_type: quizType, question_count: selectedWordQuizType === 'two_words' && quizType === 'word_sign' ? 1 : questionCount, max_attempts: maxAttempts, is_published: fd.has('published'), available_from: fd.get('availableFrom') || null, available_until: fd.get('availableUntil') || null, settings });
      message.className = 'FSL-form__message FSL-form__message--success'; message.textContent = 'Quiz created. Refreshing the list…';
      closeDrawers();
      setTimeout(() => mount(container), 500);
    } catch (error) { message.className = 'FSL-form__message FSL-form__message--error'; message.textContent = error.message || 'Could not create quiz.'; button.disabled = false; }
  });
}
export function unmount() {
  destroyTeacherCharts();
  document.body.classList.remove('FSL-drawer-open');
  document.body.classList.remove('FSL-modal-open');
}
