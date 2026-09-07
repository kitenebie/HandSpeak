const LABELS_URL = '/models/word-sign/labels.json';

let cachedLabels = null;

export async function getSupportedWordSigns() {
  if (cachedLabels) return [...cachedLabels];

  const response = await fetch(LABELS_URL);
  if (!response.ok) {
    throw new Error(`Could not load supported word signs (${response.status}).`);
  }

  const values = await response.json();
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('The word-sign model does not contain any labels.');
  }

  cachedLabels = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
  return [...cachedLabels];
}

export function normalizeWordSign(value) {
  return String(value || '').trim().toLocaleLowerCase();
}
