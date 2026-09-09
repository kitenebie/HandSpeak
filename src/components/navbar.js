import { getProfile, signOut } from '../lib/classroom.js';
import { createIcons, icons } from 'lucide';

export function createNavbar(container) {
  const el = document.createElement('nav');
  el.className = 'asl-navbar';
  el.innerHTML = `
    <div class="asl-navbar__inner">
      <a class="asl-navbar__brand" href="#/"><span class="asl-navbar__brand-mark"><i data-lucide="graduation-cap"></i></span><span>Handspeak <small>Learning Hub</small></span></a>
      <button class="asl-navbar__menu-btn" aria-label="Toggle menu"><i data-lucide="menu"></i></button>
      <div class="asl-navbar__section-label">Learning space</div>
      <div class="asl-navbar__links"></div>
      <div class="asl-navbar__footer"><span class="asl-navbar__footer-dot"></span><span>ASL Learning System</span></div>
    </div>
  `;
  container.appendChild(el);
  
  const menuBtn = el.querySelector('.asl-navbar__menu-btn');
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
    const holder = el.querySelector('.asl-navbar__links');
    const sectionLabel = el.querySelector('.asl-navbar__section-label');
    const isAuthenticated = Boolean(profile);
    el.hidden = !isAuthenticated;
    document.body.classList.toggle('asl-sidebar-hidden', !isAuthenticated);
    if (!isAuthenticated) {
      holder.innerHTML = '';
      links = [];
      return;
    }
    const accountLink = '<button type="button" class="asl-navbar__logout" id="nav-logout"><i data-lucide="log-out"></i><span>Sign out</span></button>';
    const adminLinks = '<a href="#/admin" data-path="/admin"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a href="#/admin/teachers" data-path="/admin/teachers"><i data-lucide="users-round"></i><span>Teacher List</span></a><a href="#/admin/activities" data-path="/admin/activities"><i data-lucide="library-big"></i><span>Activities</span></a>';
    const teacherLinks = '<a href="#/teacher" data-path="/teacher"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a href="#/teacher/activities" data-path="/teacher/activities"><i data-lucide="clipboard-list"></i><span>Activities</span></a><a href="#/teacher/students" data-path="/teacher/students"><i data-lucide="users-round"></i><span>Student List</span></a><a href="#/teacher/performance" data-path="/teacher/performance"><i data-lucide="chart-no-axes-combined"></i><span>Performance</span></a>';
    const studentLinks = '<a href="#/student" data-path="/student"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a><a href="#/learn" data-path="/learn"><i data-lucide="book-open"></i><span>Learning</span></a><a href="#/quiz" data-path="/quiz"><i data-lucide="clipboard-check"></i><span>Quizzes</span></a>';
    const roleLinks = profile?.role === 'admin' ? adminLinks : profile?.role === 'teacher' ? teacherLinks : studentLinks;
    if (sectionLabel) sectionLabel.textContent = profile?.role === 'admin' ? 'Admin space' : profile?.role === 'teacher' ? 'Teacher space' : 'Learning space';
    holder.innerHTML = `${roleLinks}${accountLink}`;
    createIcons({ icons });
    links = holder.querySelectorAll('a');
    applyActiveState();
    links.forEach(link => link.addEventListener('click', () => el.classList.remove('asl-navbar--open')));
    const logout = holder.querySelector('#nav-logout');
    if (logout) logout.addEventListener('click', async () => { await signOut(); window.location.hash = '#/'; });
  };
  
  const toggleMenu = () => {
    el.classList.toggle('asl-navbar--open');
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
      document.body.classList.remove('asl-sidebar-hidden');
      el.remove();
    }
  };
}
