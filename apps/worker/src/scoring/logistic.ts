/** Pure TypeScript logistic regression — no external ML dependencies. */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeatureStats {
  mean: number;
  std: number;
}

export interface TrainOptions {
  learningRate?: number | undefined;
  maxIterations?: number | undefined;
  convergenceThreshold?: number | undefined;
  lambda?: number | undefined;
}

export interface TrainResult {
  coefficients: number[];
  intercept: number;
  featureStats: FeatureStats[];
  convergenceInfo: {
    converged: boolean;
    iterations: number;
    finalLoss: number;
  };
}

export interface LogisticModel {
  coefficients: number[];
  intercept: number;
  featureStats: FeatureStats[];
}

export interface EvaluationMetrics {
  auc: number;
  prAuc: number;
  precision: number;
  recall: number;
  f1: number;
  brierScore: number;
}

export interface DatasetSplit<T> {
  train: T[];
  validation: T[];
  test: T[];
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sigmoid(z: number): number {
  if (z >= 500) return 1;
  if (z <= -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

function computeFeatureStats(data: number[][]): FeatureStats[] {
  if (data.length === 0) return [];

  const numFeatures = data[0]!.length;
  const stats: FeatureStats[] = [];

  for (let j = 0; j < numFeatures; j++) {
    let sum = 0;
    for (const row of data) {
      sum += row[j]!;
    }
    const mean = sum / data.length;

    let varianceSum = 0;
    for (const row of data) {
      const diff = row[j]! - mean;
      varianceSum += diff * diff;
    }
    const std = data.length > 1 ? Math.sqrt(varianceSum / (data.length - 1)) : 0;

    stats.push({ mean, std });
  }

  return stats;
}

function normalizeFeatures(data: number[][], stats: FeatureStats[]): number[][] {
  return data.map((row) =>
    row.map((value, j) => {
      const s = stats[j]!;
      return s.std > 0 ? (value - s.mean) / s.std : 0;
    }),
  );
}

function binaryCrossEntropyLoss(
  X: number[][],
  y: number[],
  coefficients: number[],
  intercept: number,
  lambda: number,
): number {
  const n = X.length;
  let loss = 0;

  for (let i = 0; i < n; i++) {
    let z = intercept;
    for (let j = 0; j < coefficients.length; j++) {
      z += coefficients[j]! * X[i]![j]!;
    }
    const p = sigmoid(z);
    const clipped = Math.max(1e-15, Math.min(1 - 1e-15, p));
    loss += -(y[i]! * Math.log(clipped) + (1 - y[i]!) * Math.log(1 - clipped));
  }

  // L2 regularization term
  let l2 = 0;
  for (const c of coefficients) {
    l2 += c * c;
  }

  return loss / n + (lambda / 2) * l2;
}

// ─── Training ────────────────────────────────────────────────────────────────

export function trainLogisticRegression(
  dataset: { features: number[]; label: number }[],
  options?: TrainOptions,
): TrainResult {
  const learningRate = options?.learningRate ?? 0.01;
  const maxIterations = options?.maxIterations ?? 1000;
  const convergenceThreshold = options?.convergenceThreshold ?? 1e-6;
  const lambda = options?.lambda ?? 0.01;

  if (dataset.length === 0) {
    return {
      coefficients: [],
      intercept: 0,
      featureStats: [],
      convergenceInfo: { converged: true, iterations: 0, finalLoss: 0 },
    };
  }

  const numFeatures = dataset[0]!.features.length;
  const rawX = dataset.map((d) => d.features);
  const y = dataset.map((d) => d.label);

  // Compute and apply z-score normalization
  const featureStats = computeFeatureStats(rawX);
  const X = normalizeFeatures(rawX, featureStats);

  // Initialize weights to zero
  const coefficients = new Array<number>(numFeatures).fill(0);
  let intercept = 0;
  let prevLoss = Infinity;
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    // Compute gradients
    const gradW = new Array<number>(numFeatures).fill(0);
    let gradB = 0;

    for (let i = 0; i < X.length; i++) {
      let z = intercept;
      for (let j = 0; j < numFeatures; j++) {
        z += coefficients[j]! * X[i]![j]!;
      }
      const p = sigmoid(z);
      const error = p - y[i]!;

      for (let j = 0; j < numFeatures; j++) {
        gradW[j]! += error * X[i]![j]!;
      }
      gradB += error;
    }

    const n = X.length;
    for (let j = 0; j < numFeatures; j++) {
      gradW[j] = gradW[j]! / n + lambda * coefficients[j]!;
    }
    gradB = gradB / n;

    // Update weights
    for (let j = 0; j < numFeatures; j++) {
      coefficients[j] = coefficients[j]! - learningRate * gradW[j]!;
    }
    intercept = intercept - learningRate * gradB;

    // Check convergence
    const loss = binaryCrossEntropyLoss(X, y, coefficients, intercept, lambda);
    if (Math.abs(prevLoss - loss) < convergenceThreshold) {
      converged = true;
      prevLoss = loss;
      break;
    }
    prevLoss = loss;
  }

  return {
    coefficients,
    intercept,
    featureStats,
    convergenceInfo: {
      converged,
      iterations,
      finalLoss: prevLoss,
    },
  };
}

// ─── Prediction ──────────────────────────────────────────────────────────────

export function predictLogistic(features: number[], model: LogisticModel): number {
  const normalized = features.map((value, j) => {
    const s = model.featureStats[j];
    if (!s || s.std <= 0) return 0;
    return (value - s.mean) / s.std;
  });

  let z = model.intercept;
  for (let j = 0; j < model.coefficients.length; j++) {
    z += (model.coefficients[j] ?? 0) * (normalized[j] ?? 0);
  }

  return sigmoid(z);
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export function evaluateModel(
  predictions: number[],
  labels: number[],
): EvaluationMetrics {
  if (predictions.length === 0 || predictions.length !== labels.length) {
    return { auc: 0, prAuc: 0, precision: 0, recall: 0, f1: 0, brierScore: 1 };
  }

  // Brier score
  let brierSum = 0;
  for (let i = 0; i < predictions.length; i++) {
    const diff = predictions[i]! - labels[i]!;
    brierSum += diff * diff;
  }
  const brierScore = brierSum / predictions.length;

  // Precision, Recall, F1 at threshold 0.5
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < predictions.length; i++) {
    const predicted = predictions[i]! >= 0.5 ? 1 : 0;
    const actual = labels[i]!;
    if (predicted === 1 && actual === 1) tp++;
    if (predicted === 1 && actual === 0) fp++;
    if (predicted === 0 && actual === 1) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // AUC-ROC via trapezoidal approximation
  const auc = computeAucRoc(predictions, labels);

  // PR-AUC
  const prAuc = computePrAuc(predictions, labels);

  return { auc, prAuc, precision, recall, f1, brierScore };
}

function computeAucRoc(predictions: number[], labels: number[]): number {
  const totalPositive = labels.filter((l) => l === 1).length;
  const totalNegative = labels.length - totalPositive;

  if (totalPositive === 0 || totalNegative === 0) return 0.5;

  // Sort by prediction descending
  const indexed = predictions.map((p, i) => ({ p, l: labels[i]! }));
  indexed.sort((a, b) => b.p - a.p);

  let auc = 0;
  let tpCount = 0;
  let fpCount = 0;
  let prevTpr = 0;
  let prevFpr = 0;

  for (let i = 0; i < indexed.length; i++) {
    if (indexed[i]!.l === 1) {
      tpCount++;
    } else {
      fpCount++;
    }

    const tpr = tpCount / totalPositive;
    const fpr = fpCount / totalNegative;

    // Trapezoidal rule
    auc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    prevTpr = tpr;
    prevFpr = fpr;
  }

  return auc;
}

function computePrAuc(predictions: number[], labels: number[]): number {
  const totalPositive = labels.filter((l) => l === 1).length;
  if (totalPositive === 0) return 0;

  const indexed = predictions.map((p, i) => ({ p, l: labels[i]! }));
  indexed.sort((a, b) => b.p - a.p);

  let prAuc = 0;
  let tpCount = 0;
  let prevRecall = 0;

  for (let i = 0; i < indexed.length; i++) {
    if (indexed[i]!.l === 1) {
      tpCount++;
    }

    const currentPrecision = tpCount / (i + 1);
    const currentRecall = tpCount / totalPositive;

    // Trapezoidal rule
    prAuc += ((currentRecall - prevRecall) * currentPrecision);
    prevRecall = currentRecall;
  }

  return prAuc;
}

// ─── Dataset Splitting ───────────────────────────────────────────────────────

/** Seeded PRNG (xorshift32) for deterministic splitting. */
function seededRng(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

/** Convert a string seed to a numeric seed via simple hash. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

/**
 * Deterministic Fisher-Yates shuffle split into 70/15/15 train/validation/test.
 */
export function splitDataset<T>(data: T[], seed: string): DatasetSplit<T> {
  if (data.length === 0) {
    return { train: [], validation: [], test: [] };
  }

  const rng = seededRng(hashSeed(seed));

  // Fisher-Yates shuffle (on indices to avoid mutating input)
  const indices = data.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }

  const n = data.length;
  const trainEnd = Math.round(n * 0.7);
  const valEnd = Math.round(n * 0.85);

  return {
    train: indices.slice(0, trainEnd).map((i) => data[i]!),
    validation: indices.slice(trainEnd, valEnd).map((i) => data[i]!),
    test: indices.slice(valEnd).map((i) => data[i]!),
  };
}
