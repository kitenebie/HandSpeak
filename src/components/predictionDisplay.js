export function createPredictionDisplay(container, { feedbackOnly = false } = {}) {
  const el = document.createElement('div');
  el.className = `asl-prediction${feedbackOnly ? ' asl-prediction--feedback-only' : ''}`;
  el.innerHTML = feedbackOnly ? '<div class="asl-prediction__feedback" style="display:none"></div>' : `
    <div class="asl-prediction__letter">—</div>
    <div class="asl-prediction__status">Waiting for hand...</div>
    <div class="asl-prediction__feedback" style="display:none"></div>`;
  container.appendChild(el);
  if (feedbackOnly) el.style.display = 'none';
  
  const letterEl = el.querySelector('.asl-prediction__letter');
  const statusEl = el.querySelector('.asl-prediction__status');
  const feedbackEl = el.querySelector('.asl-prediction__feedback');

  return {
    update({ label, confidence, isStable, handDetected, status }) {
      if (feedbackOnly) return;
      el.classList.remove('asl-prediction--no-hand', 'asl-prediction--stable');
      
      if (!handDetected) {
        letterEl.textContent = '—';
        statusEl.textContent = 'No hand detected — Place your hand in the camera frame';
        el.classList.add('asl-prediction--no-hand');
        return;
      }
      
      letterEl.textContent = label || '—';
      
      if (status === 'low-confidence') {
        letterEl.style.opacity = '0.5';
        statusEl.textContent = 'Adjust your hand position';
      } else if (status === 'unstable') {
        letterEl.style.opacity = '1';
        statusEl.textContent = 'Hold steady...';
      } else if (status === 'stable') {
        letterEl.style.opacity = '1';
        statusEl.textContent = '✓ Stable';
        el.classList.add('asl-prediction--stable');
      }
    },
    showCorrect(letter) {
      if (feedbackOnly) el.style.display = 'block';
      feedbackEl.style.display = 'block';
      feedbackEl.className = 'asl-prediction__feedback asl-feedback--correct asl-flash-correct';
      feedbackEl.textContent = '✓ Correct!';
    },
    showIncorrect(target, detected) {
      if (feedbackOnly) el.style.display = 'block';
      feedbackEl.style.display = 'block';
      feedbackEl.className = 'asl-prediction__feedback asl-feedback--incorrect asl-flash-incorrect';
      feedbackEl.textContent = '✕ Wrong sign — Try again.';
    },
    reset() {
      if (feedbackOnly) el.style.display = 'none';
      feedbackEl.style.display = 'none';
      feedbackEl.textContent = '';
      feedbackEl.className = 'asl-prediction__feedback';
      this.update({ handDetected: false });
    },
    destroy() {
      el.remove();
    }
  };
}
