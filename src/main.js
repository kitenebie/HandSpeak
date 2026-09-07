import { loadModel, isLoaded, getModelInfo } from './ai/aslModel.js';
import { initHandLandmarker, isReady } from './ai/handLandmarker.js';
import { createNavbar } from './components/navbar.js';
import { createDebugPanel } from './components/debugPanel.js';
import { initRouter } from './router.js';

import * as homePage from './pages/home.js';
import * as alphabetPage from './pages/alphabet.js';
import * as practiceLetterPage from './pages/practiceLetter.js';
import * as practiceWordPage from './pages/practiceWord.js';
import * as quizzesPage from './pages/quizzes.js';
import * as letterQuizPage from './pages/letterQuiz.js';
import * as spellingQuizPage from './pages/spellingQuiz.js';
import * as quizResultsPage from './pages/quizResults.js';
import * as authPage from './pages/auth.js';
import * as studentDashboardPage from './pages/studentDashboard.js';
import * as teacherDashboardPage from './pages/teacherDashboard.js';
import * as adminDashboardPage from './pages/adminDashboard.js';
import { getProfile, onAuthChange, submitUnfinishedQuizAttempts } from './lib/classroom.js';

let debugPanel = null;
let navbar = null;

// Export for pages to update debug panel
export function updateDebugPanel(data) {
  if (debugPanel) debugPanel.update(data);
}

async function init() {
  const authHash = new URLSearchParams(window.location.hash.slice(1));
  if (authHash.get('error_code') === 'otp_expired') {
    sessionStorage.setItem('authNotice', 'Your confirmation link expired. Request a new one below and use only the latest email link.');
    window.history.replaceState(null, '', `${window.location.pathname}#/auth/login`);
  }
  const loadingEl = document.getElementById('app-loading');
  const appEl = document.getElementById('app');
  const loadTf = document.getElementById('load-tf');
  const loadMp = document.getElementById('load-mp');
  const loadModelEl = document.getElementById('load-model');
  const loadError = document.getElementById('load-error');
  
  function markDone(el) {
    el.classList.remove('asl-loading__step--loading');
    el.classList.add('asl-loading__step--done');
  }
  function markError(el) {
    el.classList.add('asl-loading__step--error');
  }
  
  try {
    // Load TF.js model
    await loadModel();
    markDone(loadTf);
    markDone(loadModelEl);
    
    // Init MediaPipe
    await initHandLandmarker();
    markDone(loadMp);
    
    // Success - show app
    loadingEl.style.display = 'none';
    appEl.style.display = 'block';
    
    // Create navbar
    const navbarContainer = document.getElementById('navbar');
    if (navbarContainer) {
        navbar = createNavbar(navbarContainer);
    }
    
    // Create debug panel
    const debugPanelContainer = document.getElementById('debug-panel');
    if (debugPanelContainer) {
        debugPanel = createDebugPanel(debugPanelContainer);
    }
    
    // Initialize router
    const routes = {
      '/': homePage,
      '/learn': alphabetPage,
      '/learn/:letter': alphabetPage,
      '/practice/letter': practiceLetterPage,
      '/practice/letter/:letter': practiceLetterPage,
      '/practice/word': practiceWordPage,
      '/practice/word/:word': practiceWordPage,
      '/quiz': quizzesPage,
      '/quizzes': quizzesPage,
      '/quiz/letter': letterQuizPage,
      '/quiz/spelling': spellingQuizPage,
      '/quiz/results': quizResultsPage,
      '/auth/login': authPage,
      '/auth/register': authPage,
      '/student': studentDashboardPage,
      '/teacher': teacherDashboardPage,
      '/admin': adminDashboardPage,
    };
    
    const pageContent = document.getElementById('page-content');
    if (pageContent) {
        initRouter(routes, pageContent, (path) => {
          if (navbar) navbar.setActive(path);
        }, async (path) => {
          const protectedPaths = ['/learn', '/practice', '/quiz', '/quizzes'];
          if (!protectedPaths.some(prefix => path === prefix || path.startsWith(prefix + '/'))) return true;
          try {
            const profile = await getProfile();
            if (profile?.role === 'admin') {
              window.location.hash = '#/admin';
              return false;
            }
            if (profile) return true;
          } catch (error) {
            console.warn('Access check failed:', error.message);
          }
          window.location.hash = '#/auth/login';
          return false;
        });
    }

    submitUnfinishedQuizAttempts().catch(error => console.warn('Could not submit an unfinished quiz attempt:', error.message));

    onAuthChange((event) => {
      if (event === 'SIGNED_IN') {
        submitUnfinishedQuizAttempts().catch(error => console.warn('Could not submit an unfinished quiz attempt:', error.message));
      }
      if (navbar) navbar.refreshAuth();
    });
    
    // Keyboard shortcut for debug panel
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        if (debugPanel) debugPanel.toggle();
      }
    });
    
  } catch (error) {
    console.error('Failed to initialize:', error);
    if (loadError) {
        loadError.textContent = `Failed to load: ${error.message}. Check that model files exist at /models/asl/model.json`;
        loadError.style.display = 'block';
    }
    if (loadTf && !isLoaded()) markError(loadTf);
    if (loadMp && !isReady()) markError(loadMp);
    if (loadModelEl && !isLoaded()) markError(loadModelEl);
  }
}

init();
