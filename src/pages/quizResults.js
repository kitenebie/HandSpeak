import { navigate } from '../router.js';

export function mount(container, params) {
  const resultsStr = sessionStorage.getItem('quizResults');
  if (!resultsStr) {
    container.innerHTML = '<p>No results found.</p>';
    return;
  }

  const results = JSON.parse(resultsStr);
  const type = results.type;
  const mistakes = results.mistakes || [];

  let mistakesHtml = '';
  if (mistakes.length > 0) {
    mistakesHtml = `
      <div class="asl-results__mistakes">
        <h3>Practice Your Mistakes (${mistakes.length})</h3>
        <p style="color: var(--color-text-light); margin-bottom: 1rem;">You had difficulty with the following ${type === 'word_sign' ? 'word signs' : 'signs'}.</p>
        <div style="display: grid; gap: 0.75rem; max-width: 500px; margin: 0 auto;">
          ${mistakes.map(m => `
            <div class="asl-results__mistake-card">
              <span class="asl-results__mistake-letter">${m}</span>
              ${type === 'word_sign' ? '' : `<button class="asl-btn asl-btn--secondary btn-practice-mistake" data-letter="${m}">Practice ${m} ✋</button>`}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="asl-results asl-container">
      <h1 class="asl-results__title">Quiz Complete! 🎉</h1>
      <div class="asl-results__score">
        ${results.score} / ${results.maxScore}
      </div>
      
      <div class="asl-results__stats">
        <div class="asl-results__stat">
          <div class="asl-results__stat-value">${Math.round(results.accuracy || 0)}%</div>
          <span class="asl-results__stat-label">Accuracy</span>
        </div>
        ${results.correct !== undefined ? `
        <div class="asl-results__stat">
          <div class="asl-results__stat-value asl-results__stat-value--success">${results.correct}</div>
          <span class="asl-results__stat-label">Correct</span>
        </div>
        <div class="asl-results__stat">
          <div class="asl-results__stat-value asl-results__stat-value--danger">${results.incorrect}</div>
          <span class="asl-results__stat-label">Incorrect</span>
        </div>
        ` : ''}
        ${results.wordsCompleted !== undefined ? `
        <div class="asl-results__stat">
          <div class="asl-results__stat-value asl-results__stat-value--success">${results.wordsCompleted} / ${results.totalWords}</div>
          <span class="asl-results__stat-label">Words Completed</span>
        </div>
        ` : ''}
      </div>

      ${mistakesHtml}

      <div class="asl-results__actions">
        <button id="btn-try-again" class="asl-btn asl-btn--primary asl-btn--lg">Try Again</button>
        <button id="btn-quizzes" class="asl-btn asl-btn--secondary">Back to Quizzes</button>
        <button id="btn-home" class="asl-btn">Back to Home</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.btn-practice-mistake').forEach(btn => {
    btn.addEventListener('click', (e) => {
      navigate('#/practice/letter/' + e.target.dataset.letter);
    });
  });

  container.querySelector('#btn-try-again').addEventListener('click', () => {
    navigate(type === 'letter' ? '#/quiz/letter' : type === 'word_sign' ? '#/quiz/word-sign' : '#/quiz/spelling');
  });

  const quizzesBtn = container.querySelector('#btn-quizzes');
  if (quizzesBtn) {
    quizzesBtn.addEventListener('click', () => {
      navigate('#/quiz');
    });
  }

  container.querySelector('#btn-home').addEventListener('click', () => {
    navigate('#/');
  });
}

export function unmount() {
  // Minimal cleanup needed as no components/listeners are globally persistent here
}
