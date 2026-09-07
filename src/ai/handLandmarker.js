import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker = null;
let isReadyFlag = false;

export async function initHandLandmarker() {
    if (isReadyFlag) return;
    try {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numHands: 1
        });
        isReadyFlag = true;
    } catch (error) {
        console.error("Failed to initialize HandLandmarker:", error);
        throw error;
    }
}

export function detectHands(videoElement) {
    if (!isReadyFlag || !videoElement) {
        return { landmarks: null, handDetected: false };
    }

    const startTimeMs = performance.now();
    const results = handLandmarker.detectForVideo(videoElement, startTimeMs);

    if (results.landmarks && results.landmarks.length > 0) {
        return {
            landmarks: results.landmarks[0],
            handDetected: true
        };
    }

    return { landmarks: null, handDetected: false };
}

export function isReady() {
    return isReadyFlag;
}
