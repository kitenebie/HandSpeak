import { VALID_LETTERS } from '../data/alphabet.js';
import { LETTER_QUIZ_POINTS, SPELLING_QUIZ_POINTS, WORD_SIGN_QUIZ_POINTS, calculateLetterQuizScore, calculateSpellingScore, calculateWordSignScore } from './scoring.js';

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
    this.answers = this.questions.map(() => ({
      answered: false,
      correct: false,
      detectedLabel: null,
      skipped: false
    }));
  }
  
  getCurrentQuestion() {
    if (this.isComplete()) return null;
    const answer = this.answers[this.currentIndex] || {};
    return {
      letter: this.questions[this.currentIndex],
      questionNumber: this.currentIndex + 1,
      totalQuestions: this.questions.length,
      answered: Boolean(answer.answered),
      correct: Boolean(answer.correct),
      skipped: Boolean(answer.skipped)
    };
  }
  
  checkAnswer(detectedLabel) {
    const targetLetter = this.questions[this.currentIndex];
    const correct = detectedLabel === targetLetter;
    const points = correct ? LETTER_QUIZ_POINTS.correct : LETTER_QUIZ_POINTS.incorrect;

    this.answers[this.currentIndex] = {
      answered: correct,
      correct,
      detectedLabel,
      skipped: false
    };
    
    return {
      correct,
      targetLetter,
      detectedLetter: detectedLabel,
      points
    };
  }
  
  nextQuestion() {
    this.currentIndex = Math.min(this.currentIndex + 1, this.questions.length - 1);
  }

  previousQuestion() {
    this.currentIndex = Math.max(this.currentIndex - 1, 0);
  }

  skipQuestion() {
    this.answers[this.currentIndex] = {
      answered: false,
      correct: false,
      detectedLabel: null,
      skipped: true
    };
    this.nextQuestion();
  }
  
  isComplete() {
    return this.currentIndex >= this.questions.length;
  }
  
  getResults() {
    const correctCount = this.answers.filter(answer => answer.correct).length;
    const incorrectCount = this.questions.length - correctCount;
    const mistakes = this.questions.filter((letter, index) => !this.answers[index]?.correct);
    const { score, maxScore, accuracy } = calculateLetterQuizScore(correctCount, this.questions.length);
    return {
      score,
      maxScore,
      accuracy,
      correct: correctCount,
      incorrect: incorrectCount,
      mistakes,
      totalQuestions: this.questions.length
    };
  }
  
  getScore() {
    return calculateLetterQuizScore(this.answers.filter(answer => answer.correct).length, this.questions.length).score;
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
    this.wordStates = words.map(() => ({
      letterIndex: 0,
      completed: false,
      skipped: false,
      mistakes: []
    }));
    
    this.totalLetters = words.reduce((sum, word) => sum + word.length, 0);
  }

  getCurrentState() {
    return this.wordStates[this.wordIndex];
  }
  
  getCurrentTarget() {
    if (this.isComplete()) return null;
    const word = this.words[this.wordIndex];
    const state = this.getCurrentState();
    return {
      word,
      letterIndex: state.letterIndex,
      letter: state.completed ? null : word[state.letterIndex],
      progress: word.split('').map((l, i) => ({ letter: l, completed: i < state.letterIndex || state.completed })),
      wordNumber: this.wordIndex + 1,
      totalWords: this.words.length,
      completed: state.completed,
      skipped: state.skipped
    };
  }
  
  checkAnswer(detectedLabel) {
    const word = this.words[this.wordIndex];
    const state = this.getCurrentState();
    if (state.completed) {
      return {
        correct: true,
        targetLetter: null,
        detectedLetter: detectedLabel,
        wordComplete: true
      };
    }
    const targetLetter = word[state.letterIndex];
    const correct = detectedLabel === targetLetter;
    
    let wordComplete = false;
    if (correct) {
      if (state.letterIndex === word.length - 1) {
        wordComplete = true;
      }
    } else {
      if (!state.mistakes.includes(targetLetter)) {
        state.mistakes.push(targetLetter);
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
    const state = this.getCurrentState();
    if (!state || state.completed) return;
    state.letterIndex++;
    state.skipped = false;
    if (state.letterIndex >= this.words[this.wordIndex].length) {
      state.completed = true;
      state.letterIndex = this.words[this.wordIndex].length;
    }
    this.letterIndex = state.letterIndex;
  }
  
  nextWord() {
    this.wordIndex = Math.min(this.wordIndex + 1, this.words.length - 1);
    this.letterIndex = this.getCurrentState()?.letterIndex || 0;
  }

  previousWord() {
    this.wordIndex = Math.max(this.wordIndex - 1, 0);
    this.letterIndex = this.getCurrentState()?.letterIndex || 0;
  }

  skipWord() {
    const state = this.getCurrentState();
    if (state && !state.completed) state.skipped = true;
    this.nextWord();
  }
  
  isComplete() {
    return this.wordIndex >= this.words.length;
  }
  
  getResults() {
    const lettersCorrect = this.wordStates.reduce((sum, state) => sum + state.letterIndex, 0);
    const wordsCompleted = this.wordStates.filter(state => state.completed).length;
    const mistakes = this.words.filter((word, index) => !this.wordStates[index]?.completed);
    const { score, maxScore, accuracy } = calculateSpellingScore(lettersCorrect, this.totalLetters, wordsCompleted, this.words.length);
    return {
      score,
      maxScore,
      accuracy,
      wordsCompleted,
      totalWords: this.words.length,
      mistakes
    };
  }
  
  getScore() {
    const lettersCorrect = this.wordStates.reduce((sum, state) => sum + state.letterIndex, 0);
    const wordsCompleted = this.wordStates.filter(state => state.completed).length;
    return calculateSpellingScore(lettersCorrect, this.totalLetters, wordsCompleted, this.words.length).score;
  }
}

export class WordSignQuizEngine {
  constructor({ words = [], questionCount = words.length, quizType = 'single_word' }) {
    this.quizType = quizType === 'two_words' ? 'two_words' : 'single_word';
    const normalizedWords = words.map(word => String(word).trim()).filter(Boolean);

    if (this.quizType === 'two_words') {
      // A phrase is one question. Keeping each question as an array makes this
      // progression reusable if longer phrases are added later.
      this.questions = normalizedWords.length ? [normalizedWords] : [];
    } else {
      const uniqueWords = [...new Set(normalizedWords)];
      shuffle(uniqueWords);
      this.questions = uniqueWords
        .slice(0, Math.min(questionCount, uniqueWords.length))
        .map(word => [word]);
    }

    this.currentIndex = 0;
    this.currentWordIndex = 0;
    this.questionStates = this.questions.map(() => ({
      correct: false,
      skipped: false,
      currentWordIndex: 0
    }));
  }

  getCurrentQuestion() {
    if (this.isComplete()) return null;
    const words = this.questions[this.currentIndex];
    const state = this.questionStates[this.currentIndex] || {};
    this.currentWordIndex = state.correct ? words.length : (state.currentWordIndex || 0);
    return {
      word: words.join(' '),
      words: [...words],
      expectedWord: words[this.currentWordIndex] || null,
      currentWordIndex: this.currentWordIndex,
      progress: words.map((word, index) => ({
        word,
        completed: index < this.currentWordIndex || Boolean(state.correct)
      })),
      questionNumber: this.currentIndex + 1,
      totalQuestions: this.questions.length,
      correct: Boolean(state.correct),
      skipped: Boolean(state.skipped)
    };
  }

  checkAnswer(detectedLabel) {
    const words = this.questions[this.currentIndex];
    const state = this.questionStates[this.currentIndex];
    if (state.correct) {
      return {
        correct: true,
        questionComplete: true,
        targetWord: null,
        targetPhrase: words.join(' '),
        detectedWord: detectedLabel,
        nextExpectedWord: null,
        points: WORD_SIGN_QUIZ_POINTS.correct
      };
    }
    const targetWord = words[this.currentWordIndex];
    const correct = String(detectedLabel).toLocaleLowerCase() === targetWord.toLocaleLowerCase();

    if (correct) {
      this.currentWordIndex++;
      state.currentWordIndex = this.currentWordIndex;
      state.skipped = false;
      const questionComplete = this.currentWordIndex >= words.length;
      if (questionComplete) state.correct = true;
      return {
        correct: true,
        questionComplete,
        targetWord,
        targetPhrase: words.join(' '),
        detectedWord: detectedLabel,
        nextExpectedWord: questionComplete ? null : words[this.currentWordIndex],
        points: questionComplete ? WORD_SIGN_QUIZ_POINTS.correct : 0
      };
    }

    const retryRequired = words.length > 1;

    return {
      correct: false,
      questionComplete: false,
      retryRequired,
      targetWord,
      targetPhrase: words.join(' '),
      detectedWord: detectedLabel,
      nextExpectedWord: targetWord,
      points: WORD_SIGN_QUIZ_POINTS.incorrect
    };
  }

  nextQuestion() {
    this.currentIndex = Math.min(this.currentIndex + 1, this.questions.length - 1);
    this.currentWordIndex = this.questionStates[this.currentIndex]?.currentWordIndex || 0;
  }

  previousQuestion() {
    this.currentIndex = Math.max(this.currentIndex - 1, 0);
    this.currentWordIndex = this.questionStates[this.currentIndex]?.currentWordIndex || 0;
  }

  skipQuestion() {
    const state = this.questionStates[this.currentIndex];
    if (state && !state.correct) state.skipped = true;
    this.nextQuestion();
  }

  isComplete() {
    return this.currentIndex >= this.questions.length;
  }

  getResults() {
    const correctCount = this.questionStates.filter(state => state.correct).length;
    const incorrectCount = this.questions.length - correctCount;
    const mistakes = this.questions
      .filter((_, index) => !this.questionStates[index]?.correct)
      .map(words => words.join(' '));
    const scoring = calculateWordSignScore(correctCount, this.questions.length);
    return {
      ...scoring,
      correct: correctCount,
      incorrect: incorrectCount,
      mistakes,
      totalQuestions: this.questions.length,
      quizType: this.quizType
    };
  }
}
