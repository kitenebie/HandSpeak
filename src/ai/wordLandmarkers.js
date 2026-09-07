import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

let handLandmarker = null;
let poseLandmarker = null;
let initializing = null;
let lastTimestamp = 0;

async function createLandmarkers(delegate) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const [hands, pose] = await Promise.all([
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    }),
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false
    })
  ]);
  return { hands, pose };
}

export async function initWordLandmarkers() {
  if (handLandmarker && poseLandmarker) return;
  if (initializing) return initializing;

  initializing = (async () => {
    let created;
    try {
      created = await createLandmarkers('GPU');
    } catch (gpuError) {
      console.warn('Word landmark GPU setup failed; using CPU.', gpuError);
      created = await createLandmarkers('CPU');
    }
    handLandmarker = created.hands;
    poseLandmarker = created.pose;
  })();

  try {
    await initializing;
  } finally {
    initializing = null;
  }
}

export function detectWordLandmarks(videoElement, requestedTimestamp = performance.now()) {
  if (!handLandmarker || !poseLandmarker || !videoElement) {
    return { leftHand: null, rightHand: null, pose: null, hands: [] };
  }

  const timestamp = Math.max(Math.floor(requestedTimestamp), lastTimestamp + 1);
  lastTimestamp = timestamp;
  const handResult = handLandmarker.detectForVideo(videoElement, timestamp);
  const poseResult = poseLandmarker.detectForVideo(videoElement, timestamp);
  let leftHand = null;
  let rightHand = null;

  handResult.landmarks.forEach((landmarks, index) => {
    const handedness = handResult.handedness[index]?.[0]?.categoryName?.toLowerCase();
    if (handedness === 'left') leftHand = landmarks;
    if (handedness === 'right') rightHand = landmarks;
  });

  return {
    leftHand,
    rightHand,
    pose: poseResult.landmarks[0] || null,
    hands: handResult.landmarks,
    handDetected: handResult.landmarks.length > 0,
    poseDetected: poseResult.landmarks.length > 0
  };
}

export const WORD_HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;
export const WORD_POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;

export function areWordLandmarkersReady() {
  return Boolean(handLandmarker && poseLandmarker);
}
