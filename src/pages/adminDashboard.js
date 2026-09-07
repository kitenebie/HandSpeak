import { getAdminTeachers, getProfile, getTeacherInvites, inviteTeacher } from '../lib/classroom.js';
import { navigate } from '../router.js';

const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const newCode = () => Array.from(crypto.getRandomValues(new Uint32Array(2))).map(value => value.toString(36).toUpperCase()).join('').slice(0, 8);

export async function mount(container) {
  container.innerHTML = '<div class="asl-container"><div class="asl-card">Loading administrator panel…</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) { navigate('#/auth/login'); return; }
    if (profile.role !== 'admin') { navigate(profile.role === 'teacher' ? '#/teacher' : '#/student'); return; }
    const [teachers, invites] = await Promise.all([getAdminTeachers(), getTeacherInvites()]);
    render(container, teachers, invites);
  } catch (error) {
    container.innerHTML = `<div class="asl-container"><div class="asl-card"><h2>Administrator setup needed</h2><p>${escape(error.message)}</p><p>Run the updated Supabase schema and admin seed scripts first.</p></div></div>`;
  }
}

function render(container, teachers, invites) {
  container.innerHTML = `
    <div class="asl-dashboard asl-container">
      <div class="asl-dashboard__heading"><div><span class="asl-eyebrow">Administrator panel</span><h1>School classrooms</h1><p>Invite teachers securely by email; a teacher account and classroom are prepared with each invitation.</p></div></div>
      <div class="asl-metric-grid"><div class="asl-metric"><strong>${teachers.length}</strong><span>Active teachers</span></div><div class="asl-metric"><strong>${invites.filter(invite => !invite.used_at).length}</strong><span>Pending invitations</span></div></div>
      <div class="asl-teacher-grid">
        <section class="asl-card"><h2>Add a teacher</h2><p class="asl-muted">An invitation email is sent to the teacher, and their account is prepared automatically.</p>
          <form id="teacher-invite-form" class="asl-form">
            <label>Teacher name<input name="fullName" required maxlength="100" placeholder="e.g. Maria Santos"></label>
            <label>Teacher email<input name="email" type="email" required placeholder="teacher@school.edu"></label>
            <label>Invitation code<input id="teacher-code" name="inviteCode" required maxlength="16" value="${newCode()}" style="text-transform:uppercase"></label>
            <div id="invite-message" class="asl-form__message" aria-live="polite"></div>
            <button class="asl-btn asl-btn--primary" type="submit">Send teacher invitation</button>
          </form>
        </section>
        <section class="asl-card"><h2>Teacher accounts</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Teacher</th><th>Email</th><th>Created</th></tr></thead><tbody>${teachers.map(teacher => `<tr><td>${escape(teacher.full_name)}</td><td>${escape(teacher.email)}</td><td>${new Date(teacher.created_at).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="3" class="asl-empty">No teachers have registered yet.</td></tr>'}</tbody></table></div></section>
      </div>
      <section class="asl-section"><h2>Teacher invitations</h2><div class="asl-table-wrap"><table class="asl-table"><thead><tr><th>Teacher</th><th>Email</th><th>Invitation code</th><th>Status</th></tr></thead><tbody>${invites.map(invite => `<tr><td>${escape(invite.full_name)}</td><td>${escape(invite.email)}</td><td><code>${escape(invite.invite_code)}</code></td><td><span class="asl-status ${invite.used_at ? 'asl-status--active' : ''}">${invite.used_at ? 'Registered' : 'Pending'}</span></td></tr>`).join('') || '<tr><td colspan="4" class="asl-empty">Create your first teacher invitation above.</td></tr>'}</tbody></table></div></section>
    </div>`;
  const form = container.querySelector('#teacher-invite-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const message = container.querySelector('#invite-message');
    const fields = new FormData(form);
    button.disabled = true;
    try {
      const invite = await inviteTeacher({ fullName: fields.get('fullName').trim(), email: fields.get('email').trim(), inviteCode: fields.get('inviteCode').trim() });
      message.className = 'asl-form__message asl-form__message--success';
      message.textContent = `Invitation email sent to ${invite.email}.`;
      setTimeout(() => mount(container), 850);
    } catch (error) {
      message.className = 'asl-form__message asl-form__message--error';
      message.textContent = error.message || 'Could not create the teacher invitation.';
      button.disabled = false;
    }
  });
}

export function unmount() {}
