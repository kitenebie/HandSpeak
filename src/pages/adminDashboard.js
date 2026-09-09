import {
  getAdminClassrooms,
  getAdminMemberships,
  getAdminQuizzes,
  getAdminStudents,
  getAdminTeachers,
  getProfile,
  getTeacherInvites,
  inviteTeacher
} from '../lib/classroom.js';
import { navigate } from '../router.js';
import { createIcons, icons } from 'lucide';

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const newCode = () => Array.from(crypto.getRandomValues(new Uint32Array(2))).map(value => value.toString(36).toUpperCase()).join('').slice(0, 8);
const genderLabel = value => ({ female: 'Female', male: 'Male', other: 'Other', unspecified: 'Unspecified' })[value] || 'Unspecified';
const quizTypeLabel = type => ({ alphabet: 'Alphabet', spelling: 'Spelling', word_sign: 'Word sign' })[type] || type;

let pendingAdminMessage = null;

function getAdminView() {
  const path = window.location.hash.slice(1) || '/admin';
  if (path.startsWith('/admin/teachers')) return 'teachers';
  if (path.startsWith('/admin/activities')) return 'activities';
  return 'dashboard';
}

function renderBars(items, emptyLabel = 'No data yet.') {
  const max = Math.max(1, ...items.map(item => item.value));
  if (!items.some(item => item.value > 0)) return `<div class="asl-empty-card">${emptyLabel}</div>`;
  return `<div class="asl-bar-chart">${items.map(item => `
    <div class="asl-bar-chart__row">
      <span>${escape(item.label)}</span>
      <div class="asl-bar-chart__track"><i style="width:${Math.max(6, Math.round((item.value / max) * 100))}%"></i></div>
      <strong>${item.value}</strong>
    </div>`).join('')}</div>`;
}

function renderDashboard({ teachers, students, classrooms }) {
  const teacherGender = ['female', 'male', 'other', 'unspecified'].map(gender => ({
    label: `Teachers: ${genderLabel(gender)}`,
    value: teachers.filter(item => (item.gender || 'unspecified') === gender).length
  }));
  const studentGender = ['female', 'male', 'other', 'unspecified'].map(gender => ({
    label: `Students: ${genderLabel(gender)}`,
    value: students.filter(item => (item.gender || 'unspecified') === gender).length
  }));
  const byTeacher = classrooms.map(room => ({
    label: room.profiles?.full_name || room.profiles?.email || room.name,
    value: students.filter(student => student.classroom_id === room.id).length
  }));
  return `
    <div class="asl-dashboard__heading"><div><span class="asl-eyebrow">Admin dashboard</span><h1>School overview</h1><p>Population, teacher ownership, and classroom-level activity.</p></div></div>
    <div class="asl-metric-grid"><div class="asl-metric"><strong>${teachers.length}</strong><span>Teachers</span></div><div class="asl-metric"><strong>${students.length}</strong><span>Students</span></div><div class="asl-metric"><strong>${classrooms.length}</strong><span>Classrooms</span></div><div class="asl-metric"><strong>${classrooms.filter(room => room.is_open).length}</strong><span>Open rooms</span></div></div>
    <div class="asl-report-grid">
      <section class="asl-card"><h2>Population by gender</h2>${renderBars([...teacherGender, ...studentGender], 'No registered users yet.')}</section>
      <section class="asl-card"><h2>Students by teacher</h2>${renderBars(byTeacher, 'No classroom memberships yet.')}</section>
    </div>`;
}

function renderTeacherList({ teachers, invites }) {
  return `
    <div class="asl-section__heading">
      <div><span class="asl-eyebrow">Admin records</span><h1>Teacher List</h1><p>Registered teachers and pending invitations.</p></div>
      <button type="button" class="asl-btn asl-btn--primary" data-action="register-teacher"><i data-lucide="user-plus"></i>Register Teacher</button>
    </div>
    <section class="asl-section"><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Teacher</th><th>Email</th><th>Gender</th><th>Created</th></tr></thead><tbody>${teachers.map(teacher => `<tr><td>${escape(teacher.full_name || '-')}</td><td>${escape(teacher.email || '-')}</td><td>${escape(genderLabel(teacher.gender))}</td><td>${new Date(teacher.created_at).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="4" class="asl-empty">No teachers have registered yet.</td></tr>'}</tbody></table></div></section>
    <section class="asl-section"><h2>Teacher invitations</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Teacher</th><th>Email</th><th>Invitation code</th><th>Status</th></tr></thead><tbody>${invites.map(invite => `<tr><td>${escape(invite.full_name)}</td><td>${escape(invite.email)}</td><td><code>${escape(invite.invite_code)}</code></td><td><span class="asl-status ${invite.used_at ? 'asl-status--active' : ''}">${invite.used_at ? 'Registered' : 'Pending'}</span></td></tr>`).join('') || '<tr><td colspan="4" class="asl-empty">Create your first teacher invitation.</td></tr>'}</tbody></table></div></section>`;
}

function renderActivities({ teachers, quizzes }) {
  const publishedByTeacher = teachers
    .map(teacher => ({ teacher, quizzes: quizzes.filter(quiz => quiz.teacher_id === teacher.id && quiz.is_published) }))
    .filter(item => item.quizzes.length);
  return `
    <div class="asl-section__heading"><div><span class="asl-eyebrow">Admin activities</span><h1>Activities</h1><p>Teachers with published quizzes. Open a teacher to inspect quiz details.</p></div></div>
    <section class="asl-activity-grid">${publishedByTeacher.map(item => `
      <button type="button" class="asl-activity-card" data-action="view-teacher-activities" data-id="${escape(item.teacher.id)}">
        <span class="asl-activity-card__icon"><i data-lucide="library-big"></i></span>
        <strong>${escape(item.teacher.full_name || item.teacher.email)}</strong>
        <small>${item.quizzes.length} published ${item.quizzes.length === 1 ? 'quiz' : 'quizzes'}</small>
      </button>`).join('') || '<div class="asl-empty-card">No published teacher quizzes yet.</div>'}</section>`;
}

export async function mount(container) {
  document.body.classList.remove('asl-modal-open', 'asl-drawer-open');
  container.innerHTML = '<div class="asl-container"><div class="asl-card">Loading administrator panel...</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role !== 'admin') { navigate(profile.role === 'teacher' ? '#/teacher' : '#/student'); return; }
    const [teachers, students, classrooms, memberships, quizzes, invites] = await Promise.all([
      getAdminTeachers(),
      getAdminStudents(),
      getAdminClassrooms(),
      getAdminMemberships(),
      getAdminQuizzes(),
      getTeacherInvites()
    ]);
    const classroomById = new Map(classrooms.map(room => [room.id, room]));
    const enrichedStudents = students.map(student => {
      const membership = memberships.find(item => item.student_id === student.id);
      return { ...student, classroom_id: membership?.classroom_id || null, classroom: membership ? classroomById.get(membership.classroom_id) : null };
    });
    render(container, { teachers, students: enrichedStudents, classrooms, quizzes, invites });
  } catch (error) {
    container.innerHTML = `<div class="asl-container"><div class="asl-card"><h2>Administrator setup needed</h2><p>${escape(error.message)}</p><p>Run the updated Supabase schema and admin seed scripts first.</p></div></div>`;
  }
}

function render(container, data) {
  const view = getAdminView();
  const actionMessage = pendingAdminMessage;
  pendingAdminMessage = null;
  const content = {
    dashboard: renderDashboard(data),
    teachers: renderTeacherList(data),
    activities: renderActivities(data)
  }[view];

  container.innerHTML = `
    <div class="asl-dashboard asl-container">
      <div id="admin-action-message" class="asl-form__message ${actionMessage ? `asl-form__message--${actionMessage.type}` : ''}" aria-live="polite">${actionMessage ? escape(actionMessage.text) : ''}</div>
      ${content}
    </div>`;
  createIcons({ icons });

  const closeModal = () => {
    container.querySelector('.asl-modal-backdrop')?.remove();
    document.body.classList.remove('asl-modal-open');
  };
  const closeDrawer = () => {
    container.querySelector('.asl-drawer-backdrop')?.remove();
    container.querySelector('.asl-info-drawer')?.remove();
    document.body.classList.remove('asl-drawer-open');
  };

  const openTeacherModal = () => {
    closeModal();
    const code = newCode();
    const backdrop = document.createElement('div');
    backdrop.className = 'asl-modal-backdrop is-open';
    backdrop.innerHTML = `
      <section class="asl-modal" role="dialog" aria-modal="true" aria-labelledby="admin-teacher-title">
        <div class="asl-modal__header">
          <div><span class="asl-eyebrow">Teacher access</span><h2 id="admin-teacher-title">Register Teacher</h2><p>Create a teacher invitation and email access link.</p></div>
          <button type="button" class="asl-modal__close" aria-label="Close form"><i data-lucide="x"></i></button>
        </div>
        <form class="asl-form">
          <label>Teacher name<input name="fullName" required maxlength="100" placeholder="Teacher full name"></label>
          <label>Email<input name="email" type="email" required placeholder="teacher@school.edu"></label>
          <div class="asl-form-row">
            <label>Gender<select name="gender"><option value="unspecified">Unspecified</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
            <label>Invitation code<input name="inviteCode" required maxlength="16" value="${code}" style="text-transform:uppercase"></label>
          </div>
          <div id="admin-modal-message" class="asl-form__message" aria-live="polite"></div>
          <div class="asl-modal__actions"><button type="button" class="asl-btn asl-btn--secondary" data-modal-close>Cancel</button><button class="asl-btn asl-btn--primary" type="submit">Send invitation</button></div>
        </form>
      </section>`;
    container.append(backdrop);
    document.body.classList.add('asl-modal-open');
    createIcons({ icons });
    const form = backdrop.querySelector('form');
    const message = backdrop.querySelector('#admin-modal-message');
    const submit = form.querySelector('[type="submit"]');
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.closest('[data-modal-close], .asl-modal__close')) closeModal();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = '';
      const fields = new FormData(form);
      try {
        await inviteTeacher({
          fullName: String(fields.get('fullName') || '').trim(),
          email: String(fields.get('email') || '').trim(),
          inviteCode: String(fields.get('inviteCode') || '').trim(),
          gender: String(fields.get('gender') || 'unspecified')
        });
        pendingAdminMessage = { text: 'Teacher invitation sent.', type: 'success' };
        closeModal();
        await mount(container);
      } catch (error) {
        message.className = 'asl-form__message asl-form__message--error';
        message.textContent = error.message || 'Could not register teacher.';
        submit.disabled = false;
      }
    });
    setTimeout(() => form.querySelector('input')?.focus(), 80);
  };

  const openActivityDrawer = teacherId => {
    const teacher = data.teachers.find(item => item.id === teacherId);
    const quizzes = data.quizzes.filter(quiz => quiz.teacher_id === teacherId && quiz.is_published);
    if (!teacher) return;
    closeDrawer();
    const backdrop = document.createElement('div');
    backdrop.className = 'asl-drawer-backdrop is-open';
    const drawer = document.createElement('aside');
    drawer.className = 'asl-info-drawer is-open';
    drawer.innerHTML = `
      <div class="asl-form-drawer__header">
        <div><span class="asl-eyebrow">Published quizzes</span><h2>${escape(teacher.full_name || teacher.email)}</h2></div>
        <button type="button" class="asl-form-drawer__close" aria-label="Close drawer"><i data-lucide="x"></i></button>
      </div>
      <div class="asl-info-list">${quizzes.map(quiz => `
        <article class="asl-info-list__item">
          <strong>${escape(quiz.title)}</strong>
          <span>${escape(quizTypeLabel(quiz.quiz_type))} · ${quiz.question_count} questions · ${quiz.max_attempts || 1} attempts</span>
          <small>${escape(quiz.classrooms?.name || 'Classroom')} · ${new Date(quiz.created_at).toLocaleDateString()}</small>
        </article>`).join('')}</div>`;
    container.append(backdrop, drawer);
    document.body.classList.add('asl-drawer-open');
    createIcons({ icons });
    backdrop.addEventListener('click', closeDrawer);
    drawer.querySelector('.asl-form-drawer__close')?.addEventListener('click', closeDrawer);
  };

  if (container.__adminActionHandler) container.removeEventListener('click', container.__adminActionHandler);
  const handleAdminAction = event => {
    const button = event.target.closest('[data-action]');
    if (!button || !container.contains(button)) return;
    if (button.dataset.action === 'register-teacher') openTeacherModal();
    if (button.dataset.action === 'view-teacher-activities') openActivityDrawer(button.dataset.id);
  };
  container.__adminActionHandler = handleAdminAction;
  container.addEventListener('click', handleAdminAction);
}

export function unmount() {
  document.body.classList.remove('asl-modal-open', 'asl-drawer-open');
}
