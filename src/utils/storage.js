const STORAGE_KEY = 'FSLProgress';

const DEFAULT_STATE = {
  lettersPracticed: [],
  wordsPracticed: [],
  quizHistory: [],
  stats: {}
};

export function getProgress() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(data);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function saveProgress(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function saveLetterPracticed(letter) {
  const progress = getProgress();
  if (!progress.lettersPracticed.includes(letter)) {
    progress.lettersPracticed.push(letter);
    saveProgress(progress);
  }
}

export function saveWordPracticed(word) {
  const progress = getProgress();
  if (!progress.wordsPracticed.includes(word)) {
    progress.wordsPracticed.push(word);
    saveProgress(progress);
  }
}

export function saveQuizResult(type, result) {
  const progress = getProgress();
  progress.quizHistory.push({
    type,
    ...result,
    date: new Date().toISOString()
  });
  saveProgress(progress);
}

export function getQuizHistory(type) {
  const progress = getProgress();
  if (type) {
    return progress.quizHistory.filter(q => q.type === type);
  }
  return progress.quizHistory;
}

export function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStats() {
  const progress = getProgress();
  const lettersLearned = progress.lettersPracticed.length;
  const wordsPracticed = progress.wordsPracticed.length;
  
  let bestQuizScore = 0;
  let bestSpellingScore = 0;
  
  progress.quizHistory.forEach(q => {
    if (q.type === 'letter' && q.accuracy > bestQuizScore) {
      bestQuizScore = q.accuracy;
    }
    if (q.type === 'spelling' && q.accuracy > bestSpellingScore) {
      bestSpellingScore = q.accuracy;
    }
  });

  return {
    lettersLearned,
    totalLetters: 26,
    wordsPracticed,
    bestQuizScore,
    bestSpellingScore,
    quizzesTaken: progress.quizHistory.length
  };
}
