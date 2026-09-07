export function createLetterCard(letter, { practiced = false, onClick } = {}) {
  const btn = document.createElement('button');
  btn.className = 'asl-letter-card';
  if (practiced) {
    btn.classList.add('asl-letter-card--practiced');
  }
  
  btn.innerHTML = `
    <img class="asl-letter-card__image" src="/images/alpha/${letter}.jpg" alt="ASL sign for letter ${letter}">
    ${practiced ? '<span class="asl-letter-card__check">✓</span>' : ''}
  `;
  
  if (onClick) {
    btn.addEventListener('click', () => onClick(letter));
  }
  
  return btn;
}

export function createAlphabetGrid(container, { onLetterClick, practicedLetters = new Set() }) {
  const grid = document.createElement('div');
  grid.className = 'asl-alphabet-grid';
  
  const VALID_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  
  function render(practiced) {
    grid.innerHTML = '';
    VALID_LETTERS.forEach(letter => {
      let isPracticed = false;
      if (practiced instanceof Set) {
        isPracticed = practiced.has(letter);
      } else if (Array.isArray(practiced)) {
        isPracticed = practiced.includes(letter);
      }
      const card = createLetterCard(letter, { 
        practiced: isPracticed, 
        onClick: onLetterClick 
      });
      grid.appendChild(card);
    });
  }
  
  render(practicedLetters);
  container.appendChild(grid);
  
  return {
    update(newPracticedLetters) {
      render(newPracticedLetters);
    },
    destroy() {
      grid.remove();
    }
  };
}
