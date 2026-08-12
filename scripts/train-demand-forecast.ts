/**
 * Trains the MLP demand-forecast model on historical Order/OrderItem data
 * (real and/or synthetic — see prisma/seed-demand-data.ts) and writes the
 * trained weights + normalization metadata to ml-models/demand-forecast/.
 *
 * Run: npm run train:forecast
 */
import { PrismaClient, OrderStatus } from '@prisma/client';
import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import {
  buildModel,
  WINDOW_SIZE,
  MODEL_DIR,
  WEIGHTS_PATH,
  META_PATH,
  normalizeQuantity,
  denormalizeQuantity,
  serializeWeights,
  NormalizationStats,
} from '../src/forecasting/model-architecture';
import { buildDenseWeeklySeries, weekOfYearFeatures, WeeklyPoint } from '../src/forecasting/week-utils';

const prisma = new PrismaClient();

const VALIDATION_SPLIT_RATIO = 0.85; // targetWeek < cutoff -> train, >= cutoff -> validation
const MIN_TRAINING_EXAMPLES = 50;

interface Example {
  inputRaw: number[]; // WINDOW_SIZE raw quantities
  targetRaw: number;
  targetWeek: Date;
}

async function loadSeries(): Promise<Map<string, WeeklyPoint[]>> {
  const orders = await prisma.order.findMany({
    where: { status: OrderStatus.delivered },
    select: {
      pharmacistId: true,
      distributorId: true,
      createdAt: true,
      orderItems: { select: { productId: true, quantity: true } },
    },
  });

  const pharmacistEvents = new Map<string, { date: Date; quantity: number }[]>();
  const distributorEvents = new Map<string, { date: Date; quantity: number }[]>();

  for (const order of orders) {
    for (const item of order.orderItems) {
      const pKey = `pharmacist:${order.pharmacistId}:${item.productId}`;
      if (!pharmacistEvents.has(pKey)) pharmacistEvents.set(pKey, []);
      pharmacistEvents.get(pKey)!.push({ date: order.createdAt, quantity: item.quantity });

      if (order.distributorId) {
        const dKey = `distributor:${order.distributorId}:${item.productId}`;
        if (!distributorEvents.has(dKey)) distributorEvents.set(dKey, []);
        distributorEvents.get(dKey)!.push({ date: order.createdAt, quantity: item.quantity });
      }
    }
  }

  const series = new Map<string, WeeklyPoint[]>();
  for (const [key, events] of pharmacistEvents) series.set(key, buildDenseWeeklySeries(events));
  for (const [key, events] of distributorEvents) series.set(key, buildDenseWeeklySeries(events));
  return series;
}

function buildExamples(series: Map<string, WeeklyPoint[]>): Example[] {
  const examples: Example[] = [];
  for (const points of series.values()) {
    if (points.length <= WINDOW_SIZE) continue;
    for (let i = WINDOW_SIZE; i < points.length; i++) {
      const window = points.slice(i - WINDOW_SIZE, i);
      examples.push({
        inputRaw: window.map((p) => p.quantity),
        targetRaw: points[i].quantity,
        targetWeek: points[i].weekStart,
      });
    }
  }
  return examples;
}

function chronologicalSplit(examples: Example[]): { train: Example[]; validation: Example[] } {
  const times = examples.map((e) => e.targetWeek.getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const cutoff = minT + VALIDATION_SPLIT_RATIO * (maxT - minT);

  const train = examples.filter((e) => e.targetWeek.getTime() < cutoff);
  const validation = examples.filter((e) => e.targetWeek.getTime() >= cutoff);
  return { train, validation };
}

function computeNormalizationStats(examples: Example[]): NormalizationStats {
  const logged = examples.map((e) => Math.log1p(Math.max(0, e.targetRaw)));
  const mean = logged.reduce((s, v) => s + v, 0) / logged.length;
  const variance = logged.reduce((s, v) => s + (v - mean) ** 2, 0) / logged.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}

function toTensors(examples: Example[], stats: NormalizationStats): { x: tf.Tensor2D; y: tf.Tensor2D } {
  const xData = examples.map((e) => {
    const normInput = e.inputRaw.map((v) => normalizeQuantity(v, stats));
    const [sin, cos] = weekOfYearFeatures(e.targetWeek);
    return [...normInput, sin, cos];
  });
  const yData = examples.map((e) => [normalizeQuantity(e.targetRaw, stats)]);
  return { x: tf.tensor2d(xData), y: tf.tensor2d(yData) };
}

function mae(preds: number[], actuals: number[]): number {
  return preds.reduce((s, p, i) => s + Math.abs(p - actuals[i]), 0) / preds.length;
}

function rmse(preds: number[], actuals: number[]): number {
  const mse = preds.reduce((s, p, i) => s + (p - actuals[i]) ** 2, 0) / preds.length;
  return Math.sqrt(mse);
}

async function main() {
  console.log('Loading order history...');
  const series = await loadSeries();
  console.log(`Found ${series.size} (scope, product) time series.`);

  const examples = buildExamples(series);
  console.log(`Built ${examples.length} sliding-window training examples (WINDOW_SIZE=${WINDOW_SIZE}).`);

  if (examples.length < MIN_TRAINING_EXAMPLES) {
    console.error(
      `Not enough data to train (${examples.length} examples, need >= ${MIN_TRAINING_EXAMPLES}). ` +
        `Run "npm run seed:demand" first to generate synthetic order history.`,
    );
    process.exitCode = 1;
    return;
  }

  const { train, validation } = chronologicalSplit(examples);
  console.log(`Chronological split: ${train.length} training, ${validation.length} validation examples.`);
  if (validation.length === 0) {
    console.error('Validation split is empty — not enough date range in the data. Seed more history first.');
    process.exitCode = 1;
    return;
  }

  const stats = computeNormalizationStats(train);
  console.log(`Normalization stats (log1p mean/std, from training set only): ${JSON.stringify(stats)}`);

  const { x: trainX, y: trainY } = toTensors(train, stats);
  const { x: valX, y: valY } = toTensors(validation, stats);

  console.log('Training model...');
  const model = buildModel();
  await model.fit(trainX, trainY, {
    epochs: 100,
    batchSize: 32,
    validationData: [valX, valY],
    shuffle: true, // shuffling *within* the training set only is fine — no time leakage since it's already split
    verbose: 0,
    callbacks: tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 8 }),
  });
  console.log('Training complete.');

  // ---- Evaluate MLP vs. Naive vs. Moving-Average baselines on the same validation set ----
  const mlpPredsNorm = model.predict(valX) as tf.Tensor;
  const mlpPredsNormArr = Array.from(await mlpPredsNorm.data());
  const mlpPreds = mlpPredsNormArr.map((v) => denormalizeQuantity(v, stats));

  const naivePreds = validation.map((e) => e.inputRaw[e.inputRaw.length - 1]); // last observed week
  const movingAvgPreds = validation.map((e) => {
    const last4 = e.inputRaw.slice(-4);
    return last4.reduce((s, v) => s + v, 0) / last4.length;
  });
  const actuals = validation.map((e) => e.targetRaw);

  const results = [
    { name: 'Naive', preds: naivePreds },
    { name: 'Moving Average', preds: movingAvgPreds },
    { name: 'MLP', preds: mlpPreds },
  ].map((r) => ({ name: r.name, mae: mae(r.preds, actuals), rmse: rmse(r.preds, actuals) }));

  console.log('\nModel              MAE       RMSE');
  console.log('----------------------------------');
  for (const r of results) {
    console.log(`${r.name.padEnd(18)} ${r.mae.toFixed(1).padEnd(9)} ${r.rmse.toFixed(1)}`);
  }

  const mlpResult = results.find((r) => r.name === 'MLP')!;

  // ---- Save weights + metadata ----
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const weights = await serializeWeights(model);
  fs.writeFileSync(WEIGHTS_PATH, JSON.stringify(weights));
  fs.writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        windowSize: WINDOW_SIZE,
        normalization: stats,
        trainedAt: new Date().toISOString(),
        validationMAE: mlpResult.mae,
        validationRMSE: mlpResult.rmse,
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved weights to ${WEIGHTS_PATH}`);
  console.log(`Saved metadata to ${META_PATH}`);
}

main()
  .catch((err) => {
    console.error('Training failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
