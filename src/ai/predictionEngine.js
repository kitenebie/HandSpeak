import { predict } from './FSLModel.js';

export class PredictionEngine {
    constructor(config = {}) {
        this.stabilityFrames = config.stabilityFrames !== undefined ? config.stabilityFrames : 5;
        this.minConfidence = config.minConfidence !== undefined ? config.minConfidence : 0.75;
        this.buffer = [];
    }

    process(landmarks) {
        if (!landmarks) {
            this.reset();
            return {
                label: null,
                confidence: 0,
                isStable: false,
                handDetected: false,
                status: 'no-hand',
                rawPrediction: null
            };
        }

        const rawPrediction = predict(landmarks);
        
        if (!rawPrediction) {
            this.reset();
            return {
                label: null,
                confidence: 0,
                isStable: false,
                handDetected: true,
                status: 'no-hand',
                rawPrediction: null
            };
        }

        const { label, confidence } = rawPrediction;

        this.buffer.push({ label, confidence });
        if (this.buffer.length > this.stabilityFrames) {
            this.buffer.shift();
        }

        let isStable = false;
        let status = 'unstable';

        if (confidence < this.minConfidence) {
            status = 'low-confidence';
        } else if (this.buffer.length === this.stabilityFrames) {
            const allMatch = this.buffer.every(p => p.label === label);
            const allConfident = this.buffer.every(p => p.confidence >= this.minConfidence);

            if (allMatch && allConfident) {
                isStable = true;
                status = 'stable';
            }
        }

        return {
            label,
            confidence,
            isStable,
            handDetected: true,
            status,
            rawPrediction
        };
    }

    reset() {
        this.buffer = [];
    }

    updateConfig(newConfig) {
        if (newConfig.stabilityFrames !== undefined) {
            this.stabilityFrames = newConfig.stabilityFrames;
        }
        if (newConfig.minConfidence !== undefined) {
            this.minConfidence = newConfig.minConfidence;
        }
    }

    getState() {
        return [...this.buffer];
    }
}
