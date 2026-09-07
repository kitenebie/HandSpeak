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
    links.forEach(link => {
      const linkPath = link.getAttribute('data-path');
      if (linkPath === '/' && activePath === '/') {
        link.classList.add('active');
      } else if (linkPath !== '/' && activePath.startsWith(linkPath)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  };

  const renderLinks = (profile = null) => {
    const holder = el.querySelector('.asl-navbar__links');
    const destination = profile?.role === 'admin' ? 'admin' : profile?.role === 'teacher' ? 'teacher' : 'student';
    const dashboardLink = profile
      ? '<a href="#/' + destination + '" data-path="/' + destination + '"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a>'
      : '<a href="#/" data-path="/"><i data-lucide="house"></i><span>Home</span></a>';
    const accountLink = profile ? '<button type="button" class="asl-navbar__logout" id="nav-logout"><i data-lucide="log-out"></i><span>Sign out</span></button>' : '<a href="#/auth/login" data-path="/auth"><i data-lucide="log-in"></i><span>Sign in</span></a>';
    const learningLinks = profile?.role === 'admin' ? '' : '<a href="#/learn" data-path="/learn"><i data-lucide="book-open"></i><span>Learning</span></a><a href="#/quiz" data-path="/quiz"><i data-lucide="clipboard-check"></i><span>Quizzes</span></a>';
    holder.innerHTML = `${dashboardLink}${learningLinks}${accountLink}`;
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
      el.remove();
    }
  };
}
