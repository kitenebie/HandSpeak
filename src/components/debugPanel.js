export function createDebugPanel(container) {
  const el = document.createElement('div');
  el.className = 'FSL-debug FSL-debug--hidden';
  el.innerHTML = `
    <div class="FSL-debug__header">
      <h3>AI Debug Panel</h3>
      <button class="FSL-debug__close">✕</button>
    </div>
    <div class="FSL-debug__content">
      <div class="FSL-debug__section">
        <h4>AI Status</h4>
        <div class="FSL-debug__status-model">Model: -</div>
        <div class="FSL-debug__status-mediapipe">MediaPipe: -</div>
        <div class="FSL-debug__status-camera">Camera: -</div>
        <div class="FSL-debug__status-hand">Hand: -</div>
      </div>
      <div class="FSL-debug__section">
        <h4>Model Info</h4>
        <div class="FSL-debug__input-shape">Input Shape: -</div>
        <div class="FSL-debug__output-classes">Output Classes: -</div>
      </div>
      <div class="FSL-debug__section">
        <h4>Prediction</h4>
        <div class="FSL-debug__pred-letter">Letter: -</div>
        <div class="FSL-debug__pred-index">Class Index: -</div>
        <div class="FSL-debug__pred-confidence">Confidence: -</div>
        <div class="FSL-debug__fps">FPS: -</div>
      </div>
      <div class="FSL-debug__section">
        <h4>Top 5</h4>
        <div class="FSL-debug__top5"></div>
      </div>
    </div>
  `;
  container.appendChild(el);
  
  el.querySelector('.FSL-debug__close').addEventListener('click', () => {
    el.classList.add('FSL-debug--hidden');
  });

  return {
    update(data) {
      if (!data) return;
      if (data.modelLoaded !== undefined) el.querySelector('.FSL-debug__status-model').textContent = `Model: ${data.modelLoaded ? '✓' : '✕'}`;
      if (data.mediapipeReady !== undefined) el.querySelector('.FSL-debug__status-mediapipe').textContent = `MediaPipe: ${data.mediapipeReady ? '✓' : '✕'}`;
      if (data.cameraActive !== undefined) el.querySelector('.FSL-debug__status-camera').textContent = `Camera: ${data.cameraActive ? '✓' : '✕'}`;
      if (data.handDetected !== undefined) el.querySelector('.FSL-debug__status-hand').textContent = `Hand: ${data.handDetected ? '✓' : '✕'}`;
      
      if (data.inputShape !== undefined) el.querySelector('.FSL-debug__input-shape').textContent = `Input Shape: ${data.inputShape}`;
      if (data.outputClasses !== undefined) el.querySelector('.FSL-debug__output-classes').textContent = `Output Classes: ${data.outputClasses}`;
      
      if (data.prediction !== undefined) el.querySelector('.FSL-debug__pred-letter').textContent = `Letter: ${data.prediction || '-'}`;
      if (data.classIndex !== undefined) el.querySelector('.FSL-debug__pred-index').textContent = `Class Index: ${data.classIndex !== null && data.classIndex !== undefined ? data.classIndex : '-'}`;
      if (data.confidence !== undefined) el.querySelector('.FSL-debug__pred-confidence').textContent = `Confidence: ${data.confidence !== null && data.confidence !== undefined ? Math.round(data.confidence * 100) + '%' : '-'}`;
      if (data.fps !== undefined) el.querySelector('.FSL-debug__fps').textContent = `FPS: ${Math.round(data.fps)}`;
      
      if (data.topPredictions) {
        const top5Html = data.topPredictions.map(p => {
          const pct = Math.round(p.confidence * 100);
          return `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
              <span>${p.label}</span>
              <div style="flex-grow:1; margin:0 8px; background:rgba(255,255,255,0.15); height:12px; border-radius:6px; overflow:hidden;">
                <div style="width:${pct}%; background:var(--color-primary); height:100%;"></div>
              </div>
              <span style="min-width:30px; text-align:right;">${pct}%</span>
            </div>
          `;
        }).join('');
        el.querySelector('.FSL-debug__top5').innerHTML = top5Html;
      }
    },
    toggle() {
      el.classList.toggle('FSL-debug--hidden');
    },
    show() {
      el.classList.remove('FSL-debug--hidden');
    },
    hide() {
      el.classList.add('FSL-debug--hidden');
    },
    destroy() {
      el.remove();
    }
  };
}
