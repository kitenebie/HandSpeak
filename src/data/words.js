export const WORDS = [
    'CAT','DOG','BOOK','GOOD','HELLO','MORNING',
    'NIGHT','HELP','HOME','SCHOOL','FRIEND','FAMILY'
];

export function getRandomWord() {
    const randomIndex = Math.floor(Math.random() * WORDS.length);
    return WORDS[randomIndex];
}

export function getRandomWords(count) {
    const shuffled = [...WORDS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

export function getWordsByLength(minLen, maxLen) {
    return WORDS.filter(word => word.length >= minLen && word.length <= maxLen);
}
