export const LABELS = [
    'A','B','C','D','E','F','G','H','I','J','K','L','M',
    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
    'FSL_alphabet_test','del','nothing','space'
];

export const VALID_LETTERS = [
    'A','B','C','D','E','F','G','H','I','J','K','L','M',
    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'
];

export const SPECIAL_CLASSES = { 
    FSL_TEST: 26, 
    DEL: 27, 
    NOTHING: 28, 
    SPACE: 29 
};

export function getLetterInfo(letter) {
    const descriptions = {
        A: 'Make a fist with your thumb resting on the side of your index finger',
        B: 'Hold your hand flat with fingers together pointing up, thumb tucked across palm',
        C: 'Curve your fingers and thumb to form a C shape',
        D: 'Touch your thumb to your middle, ring, and pinky fingers while pointing index finger up',
        E: 'Curl all fingers down to touch thumb, like a tight fist with thumb tucked under fingertips',
        F: 'Touch your index finger and thumb together in a circle, other three fingers extended up',
        G: 'Point your index finger and thumb sideways, parallel to the ground',
        H: 'Point your index and middle fingers sideways together, parallel to the ground',
        I: 'Make a fist with your pinky finger extended straight up',
        J: 'Make an I shape and trace a J motion downward with your pinky',
        K: 'Point index finger up, middle finger angled forward, thumb between them',
        L: 'Extend your thumb and index finger to form an L shape',
        M: 'Tuck your thumb under your first three fingers (index, middle, ring)',
        N: 'Tuck your thumb under your first two fingers (index and middle)',
        O: 'Curve all fingers and thumb to touch, forming an O shape',
        P: 'Like K but tilted downward — middle finger points down, index forward',
        Q: 'Like G but pointing downward — thumb and index finger point down',
        R: 'Cross your middle finger over your index finger, other fingers in fist',
        S: 'Make a fist with your thumb wrapped over the front of your fingers',
        T: 'Tuck your thumb between your index and middle fingers in a fist',
        U: 'Hold your index and middle fingers together pointing up, other fingers in fist',
        V: 'Spread your index and middle fingers apart in a V shape, other fingers in fist',
        W: 'Spread your index, middle, and ring fingers apart, thumb holds pinky',
        X: 'Make a fist and hook your index finger like a hook',
        Y: 'Extend your thumb and pinky finger, other fingers folded down',
        Z: 'Draw a Z shape in the air with your extended index finger'
    };
    
    const index = LABELS.indexOf(letter);
    return {
        letter: letter,
        index: index,
        description: descriptions[letter] || ''
    };
}

export function getLetterByIndex(index) {
    return LABELS[index];
}

export function isValidLetterIndex(index) {
    return index >= 0 && index <= 25;
}
