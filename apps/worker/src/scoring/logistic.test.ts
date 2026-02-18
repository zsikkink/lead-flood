import { describe, expect, it } from 'vitest';

import {
  evaluateModel,
  predictLogistic,
  splitDataset,
  trainLogisticRegression,
} from './logistic.js';

describe('logistic regression', () => {
  describe('trainLogisticRegression', () => {
    it('converges on linearly separable data', () => {
      const dataset = [
        // Positive class: high feature values
        { features: [5, 5], label: 1 },
        { features: [6, 4], label: 1 },
        { features: [7, 6], label: 1 },
        { features: [8, 5], label: 1 },
        { features: [5, 7], label: 1 },
        // Negative class: low feature values
        { features: [1, 1], label: 0 },
        { features: [2, 2], label: 0 },
        { features: [0, 1], label: 0 },
        { features: [1, 0], label: 0 },
        { features: [2, 1], label: 0 },
      ];

      const result = trainLogisticRegression(dataset, {
        learningRate: 0.1,
        maxIterations: 2000,
      });

      expect(result.convergenceInfo.converged).toBe(true);
      expect(result.coefficients).toHaveLength(2);
      expect(result.featureStats).toHaveLength(2);
      // Coefficients should be positive (higher features → higher probability)
      expect(result.coefficients[0]).toBeGreaterThan(0);
      expect(result.coefficients[1]).toBeGreaterThan(0);
    });

    it('returns valid featureStats for normalization', () => {
      const dataset = [
        { features: [10, 20], label: 1 },
        { features: [30, 40], label: 0 },
        { features: [20, 30], label: 1 },
      ];

      const result = trainLogisticRegression(dataset);

      expect(result.featureStats).toHaveLength(2);
      expect(result.featureStats[0]!.mean).toBeCloseTo(20, 5);
      expect(result.featureStats[1]!.mean).toBeCloseTo(30, 5);
      expect(result.featureStats[0]!.std).toBeGreaterThan(0);
      expect(result.featureStats[1]!.std).toBeGreaterThan(0);
    });

    it('handles empty dataset gracefully', () => {
      const result = trainLogisticRegression([]);
      expect(result.coefficients).toHaveLength(0);
      expect(result.intercept).toBe(0);
      expect(result.convergenceInfo.converged).toBe(true);
      expect(result.convergenceInfo.iterations).toBe(0);
    });

    it('stops before maxIterations when converged', () => {
      const dataset = [
        { features: [10], label: 1 },
        { features: [0], label: 0 },
        { features: [9], label: 1 },
        { features: [1], label: 0 },
      ];

      const result = trainLogisticRegression(dataset, {
        maxIterations: 5000,
        learningRate: 0.1,
      });

      expect(result.convergenceInfo.converged).toBe(true);
      expect(result.convergenceInfo.iterations).toBeLessThan(5000);
    });

    it('handles zero-variance features (constant column)', () => {
      const dataset = [
        { features: [5, 5], label: 1 },
        { features: [5, 1], label: 0 },
        { features: [5, 6], label: 1 },
        { features: [5, 2], label: 0 },
      ];

      const result = trainLogisticRegression(dataset);

      // Zero-variance feature (first) should have std=0
      expect(result.featureStats[0]!.std).toBe(0);
      expect(result.featureStats[1]!.std).toBeGreaterThan(0);
      // Coefficient for zero-variance feature should stay at 0 (normalized to 0)
      expect(result.coefficients[0]).toBeCloseTo(0, 3);
    });
  });

  describe('predictLogistic', () => {
    it('returns values in [0, 1] range', () => {
      const dataset = [
        { features: [10], label: 1 },
        { features: [0], label: 0 },
        { features: [9], label: 1 },
        { features: [1], label: 0 },
      ];

      const trained = trainLogisticRegression(dataset, { learningRate: 0.1, maxIterations: 2000 });

      for (let x = -10; x <= 20; x++) {
        const p = predictLogistic([x], trained);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    it('returns high probability for positive-class-like features', () => {
      const dataset = [
        { features: [8, 7], label: 1 },
        { features: [9, 8], label: 1 },
        { features: [7, 9], label: 1 },
        { features: [1, 1], label: 0 },
        { features: [0, 2], label: 0 },
        { features: [2, 0], label: 0 },
      ];

      const trained = trainLogisticRegression(dataset, { learningRate: 0.1, maxIterations: 2000 });

      const highP = predictLogistic([10, 10], trained);
      const lowP = predictLogistic([0, 0], trained);

      expect(highP).toBeGreaterThan(0.7);
      expect(lowP).toBeLessThan(0.3);
    });

    it('applies normalization using stored featureStats', () => {
      const model = {
        coefficients: [1],
        intercept: 0,
        featureStats: [{ mean: 5, std: 2 }],
      };

      // Feature value 5 → z-score 0 → sigmoid(0) = 0.5
      const p = predictLogistic([5], model);
      expect(p).toBeCloseTo(0.5, 2);

      // Feature value 7 → z-score 1 → sigmoid(1) ≈ 0.731
      const pHigh = predictLogistic([7], model);
      expect(pHigh).toBeGreaterThan(0.5);
    });
  });

  describe('evaluateModel', () => {
    it('returns AUC=1 for perfect predictions', () => {
      const predictions = [0.9, 0.8, 0.1, 0.2];
      const labels = [1, 1, 0, 0];

      const metrics = evaluateModel(predictions, labels);

      expect(metrics.auc).toBeCloseTo(1.0, 2);
      expect(metrics.precision).toBe(1.0);
      expect(metrics.recall).toBe(1.0);
      expect(metrics.f1).toBe(1.0);
      expect(metrics.brierScore).toBeLessThan(0.1);
    });

    it('returns AUC≈0.5 for inverted predictions (worst-case ordering)', () => {
      // Predictions that rank negatives higher than positives → AUC ≈ 0
      // Then average with a perfect set to get ~0.5
      // Simpler: use predictions uncorrelated with labels
      const predictions = [0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6];
      const labels =      [1,   0,   1,   0,   1,   0,   1,   0];

      const metrics = evaluateModel(predictions, labels);

      // Inverted predictions: low scores for positives, high for negatives → AUC near 0
      expect(metrics.auc).toBeLessThan(0.3);
    });

    it('returns zero metrics for empty arrays', () => {
      const metrics = evaluateModel([], []);
      expect(metrics.auc).toBe(0);
      expect(metrics.precision).toBe(0);
      expect(metrics.recall).toBe(0);
      expect(metrics.f1).toBe(0);
      expect(metrics.brierScore).toBe(1);
    });

    it('computes correct precision and recall at threshold 0.5', () => {
      // 2 TP, 1 FP, 1 FN, 1 TN
      const predictions = [0.9, 0.8, 0.6, 0.3, 0.2];
      const labels = [1, 1, 0, 1, 0];

      const metrics = evaluateModel(predictions, labels);

      expect(metrics.precision).toBeCloseTo(2 / 3, 5); // 2 TP / (2 TP + 1 FP)
      expect(metrics.recall).toBeCloseTo(2 / 3, 5); // 2 TP / (2 TP + 1 FN)
    });

    it('computes Brier score correctly', () => {
      const predictions = [1.0, 0.0];
      const labels = [1, 0];

      const metrics = evaluateModel(predictions, labels);
      expect(metrics.brierScore).toBeCloseTo(0, 5);

      // Worst case: all wrong
      const worstMetrics = evaluateModel([0.0, 1.0], [1, 0]);
      expect(worstMetrics.brierScore).toBeCloseTo(1, 5);
    });
  });

  describe('splitDataset', () => {
    it('produces deterministic splits with the same seed', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);

      const split1 = splitDataset(data, 'seed-abc');
      const split2 = splitDataset(data, 'seed-abc');

      expect(split1.train).toEqual(split2.train);
      expect(split1.validation).toEqual(split2.validation);
      expect(split1.test).toEqual(split2.test);
    });

    it('produces different splits with different seeds', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);

      const split1 = splitDataset(data, 'seed-abc');
      const split2 = splitDataset(data, 'seed-xyz');

      // Very unlikely all three splits are identical with different seeds
      const allSame =
        JSON.stringify(split1.train) === JSON.stringify(split2.train) &&
        JSON.stringify(split1.validation) === JSON.stringify(split2.validation) &&
        JSON.stringify(split1.test) === JSON.stringify(split2.test);

      expect(allSame).toBe(false);
    });

    it('maintains approximately 70/15/15 proportions', () => {
      const data = Array.from({ length: 200 }, (_, i) => i);
      const split = splitDataset(data, 'proportions-test');

      expect(split.train.length).toBe(140); // 200 * 0.7 = 140
      expect(split.validation.length).toBe(30); // 200 * 0.85 - 140 = 30
      expect(split.test.length).toBe(30); // 200 - 170 = 30

      // No data leakage: total should equal input
      expect(split.train.length + split.validation.length + split.test.length).toBe(200);
    });

    it('has no overlap between splits (no data leakage)', () => {
      const data = Array.from({ length: 50 }, (_, i) => i);
      const split = splitDataset(data, 'leakage-test');

      const trainSet = new Set(split.train);
      const valSet = new Set(split.validation);

      for (const v of split.validation) {
        expect(trainSet.has(v)).toBe(false);
      }
      for (const t of split.test) {
        expect(trainSet.has(t)).toBe(false);
        expect(valSet.has(t)).toBe(false);
      }
    });

    it('handles empty input', () => {
      const split = splitDataset([], 'empty');
      expect(split.train).toEqual([]);
      expect(split.validation).toEqual([]);
      expect(split.test).toEqual([]);
    });

    it('handles single-element input', () => {
      const split = splitDataset([42], 'single');
      const total = split.train.length + split.validation.length + split.test.length;
      expect(total).toBe(1);
    });
  });
});
