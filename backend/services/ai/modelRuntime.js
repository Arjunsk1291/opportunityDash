import path from 'path';
import { fileURLToPath } from 'url';
import { env, pipeline } from '@xenova/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assistantRoot = path.resolve(__dirname, '../..');

const DEFAULT_MODEL_ID = process.env.AI_EMBEDDING_MODEL_ID || 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_CACHE_DIR = process.env.AI_MODEL_CACHE_DIR || path.join(assistantRoot, '.ai-cache');
const DEFAULT_LOCAL_MODEL_DIR = process.env.AI_LOCAL_MODEL_DIR || path.join(assistantRoot, 'models');

env.cacheDir = DEFAULT_CACHE_DIR;
env.localModelPath = DEFAULT_LOCAL_MODEL_DIR;
env.allowLocalModels = true;
env.allowRemoteModels = String(process.env.AI_ALLOW_REMOTE_MODELS || 'true').toLowerCase() !== 'false';

let embeddingPipelinePromise = null;

export function getAssistantRuntimeConfig() {
  return {
    modelId: DEFAULT_MODEL_ID,
    cacheDir: DEFAULT_CACHE_DIR,
    localModelPath: DEFAULT_LOCAL_MODEL_DIR,
    allowRemoteModels: env.allowRemoteModels,
  };
}

export async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = pipeline('feature-extraction', DEFAULT_MODEL_ID, {
      quantized: true,
    });
  }
  return embeddingPipelinePromise;
}
