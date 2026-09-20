export function createPredictionDisplay(container, { feedbackOnly = false, showConfidence = false } = {}) {
  const el = document.createElement('div');
  el.className = `FSL-prediction${feedbackOnly ? ' FSL-prediction--feedback-only' : ''}`;
  el.innerHTML = feedbackOnly ? '<div class="FSL-prediction__feedback" style="display:none"></div>' : `
    <div class="FSL-prediction__letter">—</div>
    ${showConfidence ? '<div class="FSL-prediction__confidence"><div class="FSL-prediction__confidence-bar"><div class="FSL-prediction__confidence-fill"></div></div><span class="FSL-prediction__confidence-text">Confidence: 0%</span></div>' : ''}
    <div class="FSL-prediction__status">Waiting for hand...</div>
    <div class="FSL-prediction__feedback" style="display:none"></div>`;
  container.appendChild(el);
  if (feedbackOnly) el.style.display = 'none';
  
  const letterEl = el.querySelector('.FSL-prediction__letter');
  const statusEl = el.querySelector('.FSL-prediction__status');
  const feedbackEl = el.querySelector('.FSL-prediction__feedback');
  const confidenceFill = el.querySelector('.FSL-prediction__confidence-fill');
  const confidenceText = el.querySelector('.FSL-prediction__confidence-text');

  const updateConfidence = confidence => {
    if (!confidenceFill || !confidenceText) return;
    const percentage = Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)));
    confidenceFill.style.width = `${percentage}%`;
    confidenceFill.className = `FSL-prediction__confidence-fill FSL-prediction__confidence-fill--${percentage >= 75 ? 'high' : percentage >= 50 ? 'medium' : 'low'}`;
    confidenceText.textContent = `Confidence: ${percentage}%`;
  };

  return {
    update({ label, confidence, isStable, handDetected, status }) {
      if (feedbackOnly) return;
      el.classList.remove('FSL-prediction--no-hand', 'FSL-prediction--stable');
      
      if (!handDetected) {
        letterEl.textContent = '—';
        updateConfidence(0);
        statusEl.textContent = 'No hand detected — Place your hand in the camera frame';
        el.classList.add('FSL-prediction--no-hand');
        return;
      }
      
      letterEl.textContent = label || '—';
      updateConfidence(confidence);
      
      if (status === 'low-confidence') {
        letterEl.style.opacity = '0.5';
        statusEl.textContent = 'Adjust your hand position';
      } else if (status === 'unstable') {
        letterEl.style.opacity = '1';
        statusEl.textContent = 'Hold steady...';
      } else if (status === 'stable') {
        letterEl.style.opacity = '1';
        statusEl.textContent = '✓ Stable';
        el.classList.add('FSL-prediction--stable');
      }
    },
    showCorrect(letter) {
      if (feedbackOnly) el.style.display = 'block';
      feedbackEl.style.display = 'block';
      feedbackEl.className = 'FSL-prediction__feedback FSL-feedback--correct FSL-flash-correct';
      feedbackEl.textContent = '✓ Correct!';
    },
    showIncorrect(target, detected) {
      if (feedbackOnly) el.style.display = 'block';
      feedbackEl.style.display = 'block';
      feedbackEl.className = 'FSL-prediction__feedback FSL-feedback--incorrect FSL-flash-incorrect';
      feedbackEl.textContent = '✕ Wrong sign — Try again.';
    },
    reset() {
      if (feedbackOnly) el.style.display = 'none';
      feedbackEl.style.display = 'none';
      feedbackEl.textContent = '';
      feedbackEl.className = 'FSL-prediction__feedback';
      this.update({ handDetected: false });
    },
    destroy() {
      el.remove();
    }
  };
}
