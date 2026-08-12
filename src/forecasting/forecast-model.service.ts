import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import {
  buildModel,
  WEIGHTS_PATH,
  META_PATH,
  WINDOW_SIZE,
  normalizeQuantity,
  denormalizeQuantity,
  deserializeWeights,
  SerializedWeight,
  ForecastMeta,
} from './model-architecture';
import { weekOfYearFeatures } from './week-utils';

@Injectable()
export class ForecastModelService implements OnModuleInit {
  private readonly logger = new Logger(ForecastModelService.name);
  private model: tf.LayersModel | null = null;
  private meta: ForecastMeta | null = null;

  async onModuleInit() {
    await tf.ready();
    try {
      const weights: SerializedWeight[] = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
      this.meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
      const model = buildModel();
      model.setWeights(deserializeWeights(weights));
      this.model = model;
      this.logger.log(
        `Demand forecast model loaded (trained ${this.meta?.trainedAt}, val MAE ${this.meta?.validationMAE}).`,
      );
    } catch (err) {
      this.logger.warn(
        `Demand forecast model not found or failed to load (${(err as Error).message}). ` +
          `Run "npm run train:forecast" first — forecast endpoints will report unavailable until then.`,
      );
    }
  }

  isReady(): boolean {
    return this.model !== null && this.meta !== null;
  }

  get windowSize(): number {
    return this.meta?.windowSize ?? WINDOW_SIZE;
  }

  /** `history` must be exactly `windowSize` raw weekly quantities, oldest -> newest. */
  predictNextWeek(history: number[], targetWeekDate: Date): number {
    if (!this.model || !this.meta) {
      throw new Error('Forecast model is not loaded');
    }
    const stats = this.meta.normalization;
    const normInput = history.map((v) => normalizeQuantity(v, stats));
    const [sin, cos] = weekOfYearFeatures(targetWeekDate);

    const input = tf.tensor2d([[...normInput, sin, cos]]);
    const outputTensor = this.model.predict(input) as tf.Tensor;
    const [normPred] = outputTensor.dataSync();
    input.dispose();
    outputTensor.dispose();

    return denormalizeQuantity(normPred, stats);
  }
}
