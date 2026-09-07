import { VALID_LETTERS } from '../data/alphabet.js';
import { LETTER_QUIZ_POINTS, SPELLING_QUIZ_POINTS, calculateLetterQuizScore, calculateSpellingScore } from './scoring.js';

export const DIFFICULTY = {
  easy: { stabilityFrames: 3, minConfidence: 0.6 },
  normal: { stabilityFrames: 5, minConfidence: 0.75 },
  hard: { stabilityFrames: 8, minConfidence: 0.85 }
};

function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

export class LetterQuizEngine {
  constructor({ questionCount = 10, difficulty = 'normal', questions = null }) {
    this.difficulty = difficulty;
    
    const source = Array.isArray(questions) && questions.length ? [...questions] : [...VALID_LETTERS];
    let count = Math.min(questionCount, source.length);
    shuffle(source);
    this.questions = source.slice(0, count);
    
    this.currentIndex = 0;
    this.results = [];
    this.score = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.mistakes = [];
  }
  
  getCurrentQuestion() {
    if (this.isComplete()) return null;
    return {
      letter: this.questions[this.currentIndex],
      questionNumber: this.currentIndex + 1,
      totalQuestions: this.questions.length
    };
  }
  
  checkAnswer(detectedLabel) {
    const targetLetter = this.questions[this.currentIndex];
    const correct = detectedLabel === targetLetter;
    const points = correct ? LETTER_QUIZ_POINTS.correct : LETTER_QUIZ_POINTS.incorrect;
    
    if (correct) {
      this.score += points;
      this.correctCount++;
    } else {
      this.incorrectCount++;
      if (!this.mistakes.includes(targetLetter)) {
        this.mistakes.push(targetLetter);
      }
    }
    
    return {
      correct,
      targetLetter,
      detectedLetter: detectedLabel,
      points
    };
  }
  
  nextQuestion() {
    this.currentIndex++;
  }
  
  isComplete() {
    return this.currentIndex >= this.questions.length;
  }
  
  getResults() {
    const { score, maxScore, accuracy } = calculateLetterQuizScore(this.correctCount, this.questions.length);
    return {
      score,
      maxScore,
      accuracy,
      correct: this.correctCount,
      incorrect: this.incorrectCount,
      mistakes: this.mistakes,
      totalQuestions: this.questions.length
    };
  }
  
  getScore() {
    return this.score;
  }
  
  getDifficulty() {
    return DIFFICULTY[this.difficulty];
  }
}

export class SpellingQuizEngine {
  constructor({ words = [] }) {
    this.words = words;
    this.wordIndex = 0;
    this.letterIndex = 0;
    this.score = 0;
    this.lettersCorrect = 0;
    this.wordsCompleted = 0;
    this.mistakes = [];
    
    this.totalLetters = words.reduce((sum, word) => sum + word.length, 0);
  }
  
  getCurrentTarget() {
    if (this.isComplete()) return null;
    const word = this.words[this.wordIndex];
    return {
      word,
      letterIndex: this.letterIndex,
      letter: word[this.letterIndex],
      progress: word.split('').map((l, i) => ({ letter: l, completed: i < this.letterIndex })),
      wordNumber: this.wordIndex + 1,
      totalWords: this.words.length
    };
  }
  
  checkAnswer(detectedLabel) {
    const word = this.words[this.wordIndex];
    const targetLetter = word[this.letterIndex];
    const correct = detectedLabel === targetLetter;
    
    let wordComplete = false;
    if (correct) {
      this.score += SPELLING_QUIZ_POINTS.correctLetter;
      this.lettersCorrect++;
      if (this.letterIndex === word.length - 1) {
        wordComplete = true;
        this.score += SPELLING_QUIZ_POINTS.wordBonus;
      }
    } else {
      if (!this.mistakes.includes(targetLetter)) {
        this.mistakes.push(targetLetter);
      }
    }
    
    return {
      correct,
      targetLetter,
      detectedLetter: detectedLabel,
      wordComplete
    };
  }
  
  advanceLetter() {
    this.letterIndex++;
  }
  
  nextWord() {
    this.wordsCompleted++;
    this.wordIndex++;
    this.letterIndex = 0;
  }
  
  isComplete() {
    return this.wordIndex >= this.words.length;
  }
  
  getResults() {
    const { score, maxScore, accuracy } = calculateSpellingScore(this.lettersCorrect, this.totalLetters, this.wordsCompleted);
    return {
      score,
      maxScore,
      accuracy,
      wordsCompleted: this.wordsCompleted,
      totalWords: this.words.length,
      mistakes: this.mistakes
    };
  }
  
  getScore() {
    return this.score;
  }
}
