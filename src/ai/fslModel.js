import * as tf from '@tensorflow/tfjs';
import { LABELS } from '../data/alphabet.js';

let model = null;
let isModelLoaded = false;
let modelInfo = { inputShape: 63, outputClasses: 30, loaded: false };

export async function loadModel() {
    if (isModelLoaded) return;
    try {
        model = await tf.loadGraphModel('/models/FSL/model.json');
        isModelLoaded = true;
        modelInfo.loaded = true;
    } catch (error) {
        console.error("Failed to load FSL model:", error);
        throw error;
    }
}

export function predict(landmarks) {
    if (!isModelLoaded || !landmarks || landmarks.length !== 21) {
        return null;
    }

    return tf.tidy(() => {
        const features = [];
        for (let i = 0; i < 21; i++) {
            features.push(landmarks[i].x, landmarks[i].y, landmarks[i].z);
        }

        const tensor = tf.tensor2d([features], [1, 63], 'float32');
        const output = model.predict(tensor);
        
        // Output is softmax probabilities, shape [1, 30]
        const probabilities = output.arraySync()[0];
        
        const topPredictions = probabilities.map((prob, index) => ({
            label: LABELS[index],
            index: index,
            confidence: prob
        })).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

        const best = topPredictions[0];
        
        return {
            label: best.label,
            index: best.index,
            confidence: best.confidence,
            topPredictions: topPredictions,
            isValidLetter: best.index >= 0 && best.index <= 25
        };
    });
}

export function isLoaded() {
    return isModelLoaded;
}

export function getModelInfo() {
    return modelInfo;
}
