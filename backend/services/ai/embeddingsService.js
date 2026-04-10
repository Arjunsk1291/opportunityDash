import { getEmbeddingPipeline } from './modelRuntime.js';
import { cosineSimilarity, normalizeText } from './utils.js';

const embeddingCache = new Map();

export async function getEmbedding(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (embeddingCache.has(normalized)) return embeddingCache.get(normalized);

  const extractor = await getEmbeddingPipeline();
  const output = await extractor(normalized, {
    pooling: 'mean',
    normalize: true,
  });
  const vector = Array.from(output.data || []);
  embeddingCache.set(normalized, vector);
  return vector;
}

export async function rankTextAgainstLabels(text, labels = []) {
  const sourceEmbedding = await getEmbedding(text);
  const results = await Promise.all(labels.map(async (label) => {
    const targetEmbedding = await getEmbedding(label.description || label.label || '');
    return {
      ...label,
      score: cosineSimilarity(sourceEmbedding, targetEmbedding),
    };
  }));

  return results.sort((a, b) => b.score - a.score);
}
