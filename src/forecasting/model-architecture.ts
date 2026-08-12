import * as tf from '@tensorflow/tfjs';
import * as path from 'path';

// Weeks of history fed into the model per training example / prediction.
export const WINDOW_SIZE = 8;

// +2 = sin/cos week-of-year seasonality features (see week-utils.ts).
const INPUT_SIZE = WINDOW_SIZE + 2;

export const MODEL_DIR = path.join(process.cwd(), 'ml-models', 'demand-forecast');
export const WEIGHTS_PATH = path.join(MODEL_DIR, 'weights.json');
export const META_PATH = path.join(MODEL_DIR, 'meta.json');

/**
 * Same factory used by the training script and the runtime inference
 * service, so architecture can never drift between train time and serve time.
 */
export function buildModel(): tf.Sequential {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [INPUT_SIZE], units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 })); // linear output, predicted next-week quantity (normalized)
  model.compile({ optimizer: tf.train.adam(), loss: 'meanSquaredError' });
  return model;
}

export interface NormalizationStats {
  mean: number; // mean of log1p(quantity) across all training targets
  std: number;
}

export interface ForecastMeta {
  windowSize: number;
  normalization: NormalizationStats;
  trainedAt: string;
  validationMAE: number;
  validationRMSE: number;
}

/** log1p + global z-score normalize a raw quantity into model input/target space. */
export function normalizeQuantity(value: number, stats: NormalizationStats): number {
  const logged = Math.log1p(Math.max(0, value));
  return (logged - stats.mean) / stats.std;
}

/** Inverse of normalizeQuantity — back to a real, non-negative integer quantity. */
export function denormalizeQuantity(value: number, stats: NormalizationStats): number {
  const logged = value * stats.std + stats.mean;
  return Math.max(0, Math.round(Math.expm1(logged)));
}

// Plain-JSON weight serialization — no tfjs-node, so no native file:// SavedModel
// I/O handler is available. Each Dense layer's kernel + bias tensor is stored as
// a nested-array snapshot alongside its shape, which is enough to reconstruct
// a tf.Tensor and call model.setWeights([...]) on a freshly-built model.
export interface SerializedWeight {
  shape: number[];
  data: number[];
}

export async function serializeWeights(model: tf.LayersModel): Promise<SerializedWeight[]> {
  const tensors = model.getWeights();
  const serialized: SerializedWeight[] = [];
  for (const t of tensors) {
    const data = await t.data();
    serialized.push({ shape: t.shape.slice(), data: Array.from(data) });
  }
  return serialized;
}

export function deserializeWeights(serialized: SerializedWeight[]): tf.Tensor[] {
  return serialized.map((w) => tf.tensor(w.data, w.shape));
}
