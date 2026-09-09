export const LETTER_QUIZ_POINTS = { correct: 10, incorrect: 0 };
export const SPELLING_QUIZ_POINTS = { correctLetter: 10, wordBonus: 20 };
export const WORD_SIGN_QUIZ_POINTS = { correct: 10, incorrect: 0 };

export function calculateLetterQuizScore(correct, total) {
  const score = correct * 10;
  const maxScore = total * 10;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { score, maxScore, accuracy };
}

export function calculateSpellingScore(lettersCorrect, totalLetters, wordsCompleted, totalWords = wordsCompleted) {
  const score = (lettersCorrect * 10) + (wordsCompleted * 20);
  const maxScore = (totalLetters * 10) + (totalWords * 20);
  const accuracy = totalLetters > 0 ? Math.round((lettersCorrect / totalLetters) * 100) : 0;
  return { score, maxScore, accuracy };
}

export function calculateWordSignScore(correct, total) {
  const score = correct * WORD_SIGN_QUIZ_POINTS.correct;
  const maxScore = total * WORD_SIGN_QUIZ_POINTS.correct;
  return { score, maxScore, accuracy: total ? (correct / total) * 100 : 0 };
}
