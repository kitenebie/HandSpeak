import * as tf from '@tensorflow/tfjs';

const MODEL_URL = '/models/word-sign/model.json';
const LABELS_URL = '/models/word-sign/labels.json';
const CONFIG_URL = '/models/word-sign/feature_config.json';

let model = null;
let labels = null;
let config = null;

function isLandmarkSet(value, expectedLength) {
    return Array.isArray(value) && value.length >= expectedLength;
}

function createTemporalCnn(topology) {
    const input = tf.input({ shape: topology.inputShape, name: 'landmark_sequence' });
    let output = tf.layers.conv1d({
        filters: topology.convFilters[0], kernelSize: 3, padding: 'same', activation: 'relu'
    }).apply(input);
    output = tf.layers.batchNormalization().apply(output);
    output = tf.layers.maxPooling1d({ poolSize: 2 }).apply(output);
    output = tf.layers.conv1d({
        filters: topology.convFilters[1], kernelSize: 3, padding: 'same', activation: 'relu'
    }).apply(output);
    output = tf.layers.batchNormalization().apply(output);
    output = tf.layers.maxPooling1d({ poolSize: 2 }).apply(output);
    output = tf.layers.conv1d({
        filters: topology.convFilters[2], kernelSize: 3, padding: 'same', activation: 'relu'
    }).apply(output);
    output = tf.layers.globalAveragePooling1d().apply(output);
    output = tf.layers.dense({ units: topology.denseUnits, activation: 'relu' }).apply(output);
    output = tf.layers.dropout({ rate: 0.35 }).apply(output);
    output = tf.layers.dense({ units: topology.classCount, activation: 'softmax' }).apply(output);
    return tf.model({ inputs: input, outputs: output, name: 'word_sign_temporal_cnn' });
}

/**
 * Load the model and preprocessing metadata exported by
 * train_word_sign_language.ipynb.
 */
export async function loadWordSignModel() {
    if (model) return;

    await tf.ready();
    const [modelResponse, labelsResponse, configResponse] = await Promise.all([
        fetch(MODEL_URL),
        fetch(LABELS_URL),
        fetch(CONFIG_URL)
    ]);

    if (!modelResponse.ok) {
        throw new Error(`Could not load word model manifest (${modelResponse.status})`);
    }
    if (!labelsResponse.ok) {
        throw new Error(`Could not load word labels (${labelsResponse.status})`);
    }
    if (!configResponse.ok) {
        throw new Error(`Could not load word feature config (${configResponse.status})`);
    }

    const manifest = await modelResponse.json();
    const loadedLabels = await labelsResponse.json();
    const loadedConfig = await configResponse.json();
    if (manifest.format !== 'handspeak-temporal-cnn-v1') {
        throw new Error(`Unsupported word model format: ${manifest.format}`);
    }

    const loadedModel = createTemporalCnn(manifest.modelTopology);
    const modelBaseUrl = MODEL_URL.slice(0, MODEL_URL.lastIndexOf('/') + 1);
    const weightMap = await tf.io.loadWeights(manifest.weightsManifest, modelBaseUrl);
    const orderedWeights = manifest.weightOrder.map(name => {
        if (!weightMap[name]) throw new Error(`Missing exported weight: ${name}`);
        return weightMap[name];
    });
    if (orderedWeights.length !== loadedModel.weights.length) {
        loadedModel.dispose();
        orderedWeights.forEach(weight => weight.dispose());
        throw new Error(
            `Expected ${loadedModel.weights.length} model weights, got ${orderedWeights.length}`
        );
    }
    loadedModel.setWeights(orderedWeights);
    orderedWeights.forEach(weight => weight.dispose());

    const inputShape = loadedModel.inputs[0].shape;

    if (
        inputShape[1] !== loadedConfig.sequence_length ||
        inputShape[2] !== loadedConfig.feature_dimension
    ) {
        loadedModel.dispose();
        throw new Error(
            `Word model input ${inputShape.slice(1)} does not match feature config ` +
            `${loadedConfig.sequence_length},${loadedConfig.feature_dimension}`
        );
    }

    model = loadedModel;
    labels = loadedLabels;
    config = loadedConfig;
}

/**
 * Convert one MediaPipe frame into the same 261 features used in Python.
 *
 * leftHand/rightHand: arrays of 21 landmarks with x/y/z
 * pose: array of 33 landmarks with x/y/z/visibility
 */
export function buildWordFrameFeatures({ leftHand = null, rightHand = null, pose = null }) {
    const hasLeft = isLandmarkSet(leftHand, 21);
    const hasRight = isLandmarkSet(rightHand, 21);
    const hasPose = isLandmarkSet(pose, 33);

    let center = [0.5, 0.5, 0];
    let scale = 1;
    if (hasPose) {
        const leftShoulder = pose[11];
        const rightShoulder = pose[12];
        center = [
            (leftShoulder.x + rightShoulder.x) / 2,
            (leftShoulder.y + rightShoulder.y) / 2,
            ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2
        ];
        scale = Math.max(
            Math.hypot(
                leftShoulder.x - rightShoulder.x,
                leftShoulder.y - rightShoulder.y
            ),
            1e-4
        );
    }

    const features = [];
    const appendHand = hand => {
        if (!isLandmarkSet(hand, 21)) {
            features.push(...new Array(21 * 3).fill(0));
            return;
        }
        for (let index = 0; index < 21; index++) {
            const point = hand[index];
            features.push(
                (point.x - center[0]) / scale,
                (point.y - center[1]) / scale,
                ((point.z ?? 0) - center[2]) / scale
            );
        }
    };

    appendHand(hasLeft ? leftHand : null);
    appendHand(hasRight ? rightHand : null);

    if (hasPose) {
        for (let index = 0; index < 33; index++) {
            const point = pose[index];
            features.push(
                (point.x - center[0]) / scale,
                (point.y - center[1]) / scale,
                ((point.z ?? 0) - center[2]) / scale,
                point.visibility ?? 0
            );
        }
    } else {
        features.push(...new Array(33 * 4).fill(0));
    }

    features.push(Number(hasLeft), Number(hasRight), Number(hasPose));
    return features;
}

/** Match NumPy's linear temporal resampling used by the training notebook. */
export function resampleWordSequence(frameSequence, targetLength = 40) {
    if (!Array.isArray(frameSequence) || frameSequence.length === 0) {
        throw new Error('A non-empty landmark frame sequence is required');
    }

    const featureLength = frameSequence[0].length;
    if (!frameSequence.every(frame => frame.length === featureLength)) {
        throw new Error('Every frame must contain the same number of features');
    }
    if (frameSequence.length === 1) {
        return Array.from({ length: targetLength }, () => [...frameSequence[0]]);
    }

    return Array.from({ length: targetLength }, (_, targetIndex) => {
        const sourcePosition = targetIndex * (frameSequence.length - 1) / (targetLength - 1);
        const lowerIndex = Math.floor(sourcePosition);
        const upperIndex = Math.ceil(sourcePosition);
        const fraction = sourcePosition - lowerIndex;
        return Array.from({ length: featureLength }, (_, featureIndex) => {
            const lower = frameSequence[lowerIndex][featureIndex];
            const upper = frameSequence[upperIndex][featureIndex];
            return lower + (upper - lower) * fraction;
        });
    });
}

/**
 * Predict one complete, trimmed sign. frameSequence may have any frame count;
 * it is resampled to the model's configured length before inference.
 */
export async function predictWordSequence(frameSequence, confidenceThreshold = 0.60) {
    if (!model || !labels || !config) {
        throw new Error('Call loadWordSignModel() before prediction');
    }

    const sequence = resampleWordSequence(frameSequence, config.sequence_length);
    if (sequence[0].length !== config.feature_dimension) {
        throw new Error(
            `Expected ${config.feature_dimension} features per frame, got ${sequence[0].length}`
        );
    }

    const normalized = sequence.map(frame => frame.map(
        (value, index) => (value - config.feature_mean[index]) / config.feature_std[index]
    ));

    const input = tf.tensor3d(
        [normalized],
        [1, config.sequence_length, config.feature_dimension],
        'float32'
    );
    let output = model.predict(input);
    if (Array.isArray(output)) output = output[0];

    try {
        const scores = Array.from(await output.data());
        const ranking = scores
            .map((confidence, index) => ({ label: labels[index], index, confidence }))
            .sort((a, b) => b.confidence - a.confidence);
        const best = ranking[0];
        return {
            label: best.confidence >= confidenceThreshold ? best.label : 'Unknown',
            index: best.index,
            confidence: best.confidence,
            ranking
        };
    } finally {
        input.dispose();
        output.dispose();
    }
}

export function isWordModelLoaded() {
    return model !== null;
}

export function getWordModelInfo() {
    return {
        loaded: model !== null,
        inputShape: model?.inputs[0].shape ?? null,
        labels: labels ? [...labels] : null
    };
}
