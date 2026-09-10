import { joinClassroomsByCodes } from '../lib/classroom.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let feedback = [];

export function renderStudentRooms(rooms, { interactive = false, quizzes = [], attempts = [] } = {}) {
  const results = feedback;
  feedback = [];
  if (interactive) return `<div class="FSL-rooms-layout">
    <section class="FSL-rooms-collection" aria-label="Joined classrooms">
      <div class="FSL-rooms-section-title"><h2>Your classrooms <span>${rooms.length}</span></h2><small>Select a room to get started</small></div>
      <div class="FSL-rooms-grid">${rooms.map((room, index) => {
        const assigned = quizzes.filter(quiz => quiz.classroom_id === room.id);
        const taken = assigned.filter(quiz => attempts.some(attempt => attempt.quiz_id === quiz.id)).length;
        return `<button type="button" class="FSL-room-tile FSL-room-tile--${index % 3}" data-room-id="${escape(room.id)}" aria-label="View quizzes in ${escape(room.name)}">
          <span class="FSL-room-tile__top"><span class="FSL-room-tile__icon"><i data-lucide="school" aria-hidden="true"></i></span><span class="FSL-room-tile__badge"><i data-lucide="${room.is_open ? 'check' : 'lock-keyhole'}" aria-hidden="true"></i>${room.is_open ? 'Joined' : 'Joins closed'}</span></span>
          <strong>${escape(room.name)}</strong><span class="FSL-room-tile__code">ROOM CODE <code>${escape(room.join_code)}</code></span>
          <span class="FSL-room-tile__stats"><span><i data-lucide="clipboard-list" aria-hidden="true"></i>${assigned.length} quizzes</span><span><i data-lucide="circle-check" aria-hidden="true"></i>${taken} taken</span></span>
          <span class="FSL-room-tile__footer">View room quizzes <i data-lucide="arrow-up-right" aria-hidden="true"></i></span>
        </button>`;
      }).join('') || '<div class="FSL-rooms-empty"><span class="FSL-room-tile__icon"><i data-lucide="school" aria-hidden="true"></i></span><h3>Your next classroom starts here</h3><p>Ask your teacher for a room code, then add it using the Join rooms form.</p></div>'}</div>
    </section>
    <aside class="FSL-room-join"><span class="FSL-room-join__icon"><i data-lucide="door-open" aria-hidden="true"></i></span><h2>Join a classroom</h2><p>A new teacher? A new room.<br>Add their code to learn together.</p>
      <form class="FSL-form" data-join-rooms><label>Room codes<textarea name="roomCodes" required rows="3" maxlength="660" placeholder="e.g. ABC123, DEF456" aria-describedby="room-code-help"></textarea></label><small id="room-code-help">Use commas, spaces, or new lines to add multiple codes. Up to 20 at a time.</small>
      <div class="FSL-form__message" data-room-message aria-live="polite">${results.map(result => `<p>${escape(result.code)}: ${escape(result.error || 'Room joined or already joined.')}</p>`).join('')}</div>
      <button type="submit" class="FSL-btn FSL-btn--primary"><i data-lucide="plus" aria-hidden="true"></i>Join rooms</button></form>
      <div class="FSL-room-join__note"><i data-lucide="shield-check" aria-hidden="true"></i><span>Your existing rooms and quiz progress stay with you.</span></div>
    </aside></div>`;
  return `<section class="FSL-section FSL-card"><h2>My classrooms</h2>
    <p>Join multiple teachers’ rooms. Adding a room keeps your existing classrooms.</p>
    <div class="FSL-dashboard-grid">${rooms.map(room => interactive
      ? `<button type="button" class="FSL-activity-card" data-room-id="${escape(room.id)}" aria-label="View quizzes in ${escape(room.name)}"><strong>${escape(room.name)}</strong><span>Room code: <code>${escape(room.join_code)}</code></span><small>View quizzes${room.is_open ? '' : ' · Closed to new joins'}</small></button>`
      : `<article><strong>${escape(room.name)}</strong><p>Room code: <code>${escape(room.join_code)}</code>${room.is_open ? '' : ' · Closed to new joins'}</p></article>`).join('') || '<p>You have not joined a classroom yet.</p>'}</div>
    <form class="FSL-form" data-join-rooms>
      <label>Room codes<textarea name="roomCodes" required rows="2" maxlength="660" placeholder="ABC123, DEF456" aria-describedby="room-code-help"></textarea></label>
      <small id="room-code-help">Separate codes with commas, spaces, or new lines. Up to 20 codes at a time.</small>
      <div class="FSL-form__message" data-room-message aria-live="polite">${results.map(result => `<p>${escape(result.code)}: ${escape(result.error || 'Room joined or already joined.')}</p>`).join('')}</div>
      <button type="submit" class="FSL-btn FSL-btn--primary">Join rooms</button>
    </form></section>`;
}

export function bindStudentRooms(container, reload) {
  const form = container.querySelector('[data-join-rooms]');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Joining…';
    const message = form.querySelector('[data-room-message]');
    message.textContent = '';
    try {
      const results = await joinClassroomsByCodes(new FormData(form).get('roomCodes'));
      if (!form.isConnected) return;
      feedback = results;
      await reload();
    } catch (error) {
      message.textContent = error.message || 'Could not join rooms.';
      button.disabled = false;
      button.textContent = 'Join rooms';
    }
  });
}
