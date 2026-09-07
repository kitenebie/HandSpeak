import { createAlphabetGrid } from '../components/letterCard.js';
import { getProgress } from '../utils/storage.js';
import { navigate } from '../router.js';
import { getClassroomMaterials } from '../lib/classroom.js';
import { createIcons, icons } from 'lucide';

let gridController = null;
const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export async function mount(container, params) {
  if (params.letter) {
    const letter = params.letter.toUpperCase();
    navigate('#/practice/letter/' + letter);
    return;
  }

  let materials = [];
  try {
    materials = await getClassroomMaterials();
  } catch (error) {
    console.warn('Teacher learning activities could not be loaded:', error.message);
  }
  const teacherLessons = materials.filter(item => item.material_type === 'learning');
  let selectedLesson = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem('teacherMaterial') || 'null');
    if (saved?.material_type === 'learning') selectedLesson = saved;
  } catch {
    sessionStorage.removeItem('teacherMaterial');
  }
  const lessonsToShow = selectedLesson && !teacherLessons.some(item => item.id === selectedLesson.id)
    ? [selectedLesson, ...teacherLessons]
    : teacherLessons;

  container.innerHTML = `
    <div class="asl-alphabet-page asl-container">
      <div class="asl-section__heading"><div><span class="asl-eyebrow">Learning</span><h1>ASL alphabet lessons</h1><p>Choose a sign to open its focused webcam practice.</p></div></div>
      ${lessonsToShow.length ? `<section class="asl-teacher-lessons"><div class="asl-section__heading"><div><span class="asl-eyebrow">From your teacher</span><h2>Learning activities</h2></div></div><div class="asl-dashboard-grid">${lessonsToShow.map(lesson => `<article class="asl-card asl-teacher-lesson ${selectedLesson?.id === lesson.id ? 'asl-teacher-lesson--selected' : ''}"><span class="asl-classroom-activity__icon"><i data-lucide="book-open"></i></span><h3>${escape(lesson.title)}</h3><p>${escape(lesson.description || 'Open the alphabet lesson and practice each sign.')}</p><button type="button" class="asl-btn asl-btn--secondary open-alphabet">Open alphabet <i data-lucide="arrow-down"></i></button></article>`).join('')}</div></section>` : ''}
      <section class="asl-section" id="alphabet-lesson"><h2 class="sr-only">Alphabet signs</h2><div id="alphabet-grid-container"></div></section>
    </div>
  `;

  const progress = getProgress();
  const practicedLetters = progress.lettersPracticed || [];
  gridController = createAlphabetGrid(container.querySelector('#alphabet-grid-container'), {
    onLetterClick: (letter) => navigate('#/practice/letter/' + letter),
    practicedLetters
  });
  createIcons({ icons });
  container.querySelectorAll('.open-alphabet').forEach(button => button.addEventListener('click', () => {
    container.querySelector('#alphabet-lesson').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

export function unmount() {
  if (gridController) {
    gridController.destroy();
    gridController = null;
  }
}
