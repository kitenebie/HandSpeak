import { getProfile, signOut } from '../lib/classroom.js';
import { createIcons, icons } from 'lucide';

export function createNavbar(container) {
  const el = document.createElement('nav');
  el.className = 'FSL-navbar';
  el.innerHTML = `
    <div class="FSL-navbar__inner">
      <a class="FSL-navbar__brand" href="#/"><span class="FSL-navbar__brand-mark"><i data-lucide="graduation-cap"></i></span><span>Handspeak <small>Learning Hub</small></span></a>
      <button class="FSL-navbar__menu-btn" aria-label="Toggle menu"><i data-lucide="menu"></i></button>
      <div class="FSL-navbar__section-label">Learning space</div>
      <div class="FSL-navbar__links"></div>
      <div class="FSL-navbar__footer"><span class="FSL-navbar__footer-dot"></span><span>FSL Learning System</span></div>
    </div>
  `;
  container.appendChild(el);
  
  const menuBtn = el.querySelector('.FSL-navbar__menu-btn');
  let links = [];
  let activePath = window.location.hash.slice(1) || '/';

  const applyActiveState = () => {
    let bestMatch = null;
    links.forEach(link => {
      const linkPath = link.getAttribute('data-path');
      const matches = linkPath === '/'
        ? activePath === '/'
        : activePath === linkPath || activePath.startsWith(linkPath + '/');
      if (matches && (!bestMatch || linkPath.length > bestMatch.getAttribute('data-path').length)) {
        bestMatch = link;
      }
    });
    links.forEach(link => link.classList.toggle('active', link === bestMatch));
  };

  const renderLinks = (profile = null) => {
    const holder = el.querySelector('.FSL-navbar__links');
    const sectionLabel = el.querySelector('.FSL-navbar__section-label');
    const isAuthenticated = Boolean(profile);
    el.hidden = !isAuthenticated;
    document.body.classList.toggle('FSL-sidebar-hidden', !isAuthenticated);
    if (!isAuthenticated) {
      holder.innerHTML = '';
      links = [];
      return;
    }
    const accountLink = '<button type="button" class="FSL-navbar__logout" id="nav-logout"><i data-lucide="log-out"></i><span>Sign out</span></button>';
    const adminLinks = '<a href="#/admin" data-path="/admin"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a href="#/admin/teachers" data-path="/admin/teachers"><i data-lucide="users-round"></i><span>Teacher List</span></a><a href="#/admin/activities" data-path="/admin/activities"><i data-lucide="library-big"></i><span>Activities</span></a>';
    const teacherLinks = '<a href="#/teacher" data-path="/teacher"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a href="#/teacher/activities" data-path="/teacher/activities"><i data-lucide="clipboard-list"></i><span>Activities</span></a><a href="#/teacher/students" data-path="/teacher/students"><i data-lucide="users-round"></i><span>Student List</span></a><a href="#/teacher/performance" data-path="/teacher/performance"><i data-lucide="chart-no-axes-combined"></i><span>Performance</span></a>';
    const studentLinks = '<a href="#/student" data-path="/student"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a href="#/student/rooms" data-path="/student/rooms"><i data-lucide="school"></i><span>Rooms</span></a><a href="#/learn" data-path="/learn"><i data-lucide="book-open"></i><span>Learning</span></a><a href="#/quiz" data-path="/quiz"><i data-lucide="clipboard-check"></i><span>Quizzes</span></a>';
    const roleLinks = profile?.role === 'admin' ? adminLinks : profile?.role === 'teacher' ? teacherLinks : studentLinks;
    if (sectionLabel) sectionLabel.textContent = profile?.role === 'admin' ? 'Admin space' : profile?.role === 'teacher' ? 'Teacher space' : 'Learning space';
    holder.innerHTML = `${roleLinks}${accountLink}`;
    createIcons({ icons });
    links = holder.querySelectorAll('a');
    applyActiveState();
    links.forEach(link => link.addEventListener('click', () => el.classList.remove('FSL-navbar--open')));
    const logout = holder.querySelector('#nav-logout');
    if (logout) logout.addEventListener('click', () => openSignOutModal());
  };

  const closeSignOutModal = () => {
    document.querySelector('.FSL-signout-modal')?.remove();
    document.body.classList.remove('FSL-modal-open');
  };

  const openSignOutModal = () => {
    closeSignOutModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'FSL-modal-backdrop FSL-signout-modal is-open';
    backdrop.innerHTML = `
      <section class="FSL-modal FSL-modal--confirm" role="dialog" aria-modal="true" aria-labelledby="signout-modal-title">
        <div class="FSL-modal__header">
          <div><span class="FSL-eyebrow">Confirm action</span><h2 id="signout-modal-title">Sign out?</h2><p>You will need to sign in again to access your account.</p></div>
          <button type="button" class="FSL-modal__close" aria-label="Close confirmation"><i data-lucide="x"></i></button>
        </div>
        <div id="signout-modal-message" class="FSL-form__message" aria-live="polite"></div>
        <div class="FSL-modal__actions">
          <button type="button" class="FSL-btn FSL-btn--secondary" data-modal-close>Cancel</button>
          <button type="button" class="FSL-btn FSL-btn--danger" data-signout-confirm>Sign out</button>
        </div>
      </section>`;
    document.body.append(backdrop);
    document.body.classList.add('FSL-modal-open');
    createIcons({ icons });

    const confirmButton = backdrop.querySelector('[data-signout-confirm]');
    const message = backdrop.querySelector('#signout-modal-message');
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.closest('[data-modal-close], .FSL-modal__close')) closeSignOutModal();
    });
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      message.textContent = '';
      try {
        await signOut();
        closeSignOutModal();
        window.location.hash = '#/';
      } catch (error) {
        message.className = 'FSL-form__message FSL-form__message--error';
        message.textContent = error.message || 'Could not sign out.';
        confirmButton.disabled = false;
      }
    });
    setTimeout(() => confirmButton.focus(), 80);
  };
  
  const toggleMenu = () => {
    el.classList.toggle('FSL-navbar--open');
  };
  
  menuBtn.addEventListener('click', toggleMenu);
  
  createIcons({ icons });
  renderLinks();

  async function refreshAuth() {
    try { renderLinks(await getProfile(true)); } catch { renderLinks(); }
  }
  refreshAuth();

  return {
    setActive(path) {
      activePath = path;
      applyActiveState();
    },
    refreshAuth,
    destroy() {
      menuBtn.removeEventListener('click', toggleMenu);
      document.body.classList.remove('FSL-sidebar-hidden');
      closeSignOutModal();
      el.remove();
    }
  };
}
