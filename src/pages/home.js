import { navigate } from '../router.js';
import { createIcons, icons } from 'lucide';
import { getProfile } from '../lib/classroom.js';

export async function mount(container, params) {
  try {
    const profile = await getProfile();
    if (profile?.role === 'admin') {
      navigate('#/admin');
      return;
    }
    if (profile?.role === 'teacher') {
      navigate('#/teacher');
      return;
    }
    if (profile?.role === 'student') {
      navigate('#/student');
      return;
    }
  } catch {
    // Visitors without a session use the public learning home page.
  }
  container.innerHTML = `
    <div class="asl-home asl-container">
      <div class="asl-home__hero">
        <div><span class="asl-eyebrow">My learning space</span><h1 class="asl-home__title">Welcome to Handspeak</h1>
        <p class="asl-home__subtitle">Build confidence in American Sign Language with guided lessons, practice, and assessments.</p><button id="hero-start" class="asl-btn asl-btn--hero">Continue learning <i data-lucide="arrow-right"></i></button></div>
        <div class="asl-home__hero-art"><i data-lucide="languages"></i><small>ASL A–Z<br>Course</small></div>
      </div>
      <br/>
      <div class="asl-section__heading"><div><span class="asl-eyebrow">Course modules</span><h2>Continue learning</h2></div></div>
      <div class="asl-home__nav-cards">
        <div class="asl-home__nav-card" id="nav-learn">
          <span class="asl-home__nav-card-icon"><i data-lucide="book-open"></i></span>
          <span class="asl-course-card__tag">FOUNDATION</span><h2 class="asl-home__nav-card-title">Learning</h2>
          <p class="asl-home__nav-card-desc">Browse the 26 signs of the ASL alphabet with visual guidance.</p><span class="asl-course-card__action">Open module →</span>
        </div>
        <div class="asl-home__nav-card" id="nav-practice">
          <span class="asl-home__nav-card-icon"><i data-lucide="hand"></i></span>
          <span class="asl-course-card__tag">LAB</span><h2 class="asl-home__nav-card-title">Practice</h2>
          <p class="asl-home__nav-card-desc">Practice individual letters or whole words with real-time feedback.</p><span class="asl-course-card__action">Enter practice lab →</span>
        </div>
        <div class="asl-home__nav-card" id="nav-quiz">
          <span class="asl-home__nav-card-icon"><i data-lucide="clipboard-check"></i></span>
          <span class="asl-course-card__tag">ASSESSMENT</span><h2 class="asl-home__nav-card-title">Take a Quiz</h2>
          <p class="asl-home__nav-card-desc">Test your fingerspelling skills with letter and spelling challenges.</p><span class="asl-course-card__action">View assessments →</span>
        </div>
      </div>
    </div>
  `;
  createIcons({ icons });

  container.querySelector('#nav-learn').addEventListener('click', () => navigate('#/learn'));
  container.querySelector('#hero-start').addEventListener('click', () => navigate('#/learn'));
  container.querySelector('#nav-practice').addEventListener('click', () => navigate('#/practice/letter'));
  container.querySelector('#nav-quiz').addEventListener('click', () => navigate('#/quiz'));
}

export function unmount() {}
