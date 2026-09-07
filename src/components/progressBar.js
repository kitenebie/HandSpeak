export function createProgressBar(container, { label = '', max = 100, value = 0, showPercentage = true }) {
  const el = document.createElement('div');
  el.className = 'asl-progress';
  
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  
  el.innerHTML = `
    <div class="asl-progress__label">${label}</div>
    <div class="asl-progress__track">
      <div class="asl-progress__fill" style="width: ${pct}%"></div>
    </div>
    <div class="asl-progress__text">${value} / ${max}${showPercentage ? ` (${pct}%)` : ''}</div>
  `;
  container.appendChild(el);
  
  let currentMax = max;

  return {
    update(newValue) {
      const p = currentMax > 0 ? Math.round((newValue / currentMax) * 100) : 0;
      el.querySelector('.asl-progress__fill').style.width = `${p}%`;
      el.querySelector('.asl-progress__text').textContent = `${newValue} / ${currentMax}${showPercentage ? ` (${p}%)` : ''}`;
    },
    setMax(newMax) {
      currentMax = newMax;
    },
    destroy() {
      el.remove();
    }
  };
}
