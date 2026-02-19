// apps/worker/src/scoring/lift-analysis.ts

export interface FactorLift {
  factor: string;
  convertedFreq: number;
  nonConvertedFreq: number;
  lift: number;
  sampleSize: number;
}

export interface LiftAnalysisOptions {
  maxChangePercent?: number | undefined;
  minWeight?: number | undefined;
  maxWeight?: number | undefined;
}

/**
 * Compute lift for each feature by comparing frequency/average
 * in converted vs non-converted snapshots.
 *
 * Lift = (convertedAvg - nonConvertedAvg) / nonConvertedAvg
 * A positive lift means the feature is more common in converted leads.
 */
export function computeFactorLift(
  convertedSnapshots: Array<Record<string, unknown>>,
  nonConvertedSnapshots: Array<Record<string, unknown>>,
): FactorLift[] {
  if (convertedSnapshots.length === 0 || nonConvertedSnapshots.length === 0) {
    return [];
  }

  // Collect all unique numeric feature keys
  const allKeys = new Set<string>();
  for (const snap of [...convertedSnapshots, ...nonConvertedSnapshots]) {
    for (const [key, val] of Object.entries(snap)) {
      if (typeof val === 'number' || typeof val === 'boolean') {
        allKeys.add(key);
      }
    }
  }

  const results: FactorLift[] = [];

  for (const key of allKeys) {
    const convertedValues = convertedSnapshots
      .map((s) => toNumeric(s[key]))
      .filter((v): v is number => v !== null);

    const nonConvertedValues = nonConvertedSnapshots
      .map((s) => toNumeric(s[key]))
      .filter((v): v is number => v !== null);

    if (convertedValues.length === 0 || nonConvertedValues.length === 0) continue;

    const convertedAvg = convertedValues.reduce((a, b) => a + b, 0) / convertedValues.length;
    const nonConvertedAvg = nonConvertedValues.reduce((a, b) => a + b, 0) / nonConvertedValues.length;

    // Avoid division by zero — if non-converted avg is 0, use small epsilon
    const denominator = Math.abs(nonConvertedAvg) < 1e-8 ? 1e-8 : nonConvertedAvg;
    const lift = (convertedAvg - nonConvertedAvg) / denominator;

    results.push({
      factor: key,
      convertedFreq: convertedAvg,
      nonConvertedFreq: nonConvertedAvg,
      lift,
      sampleSize: convertedValues.length + nonConvertedValues.length,
    });
  }

  // Sort by absolute lift descending (most impactful first)
  return results.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
}

/**
 * Adjust deterministic scoring weights based on lift analysis results.
 * Guardrails: max change per cycle (default 30%), weight bounds (default 1-30).
 */
export function adjustDeterministicWeights(
  currentWeights: Record<string, number>,
  liftResults: FactorLift[],
  options?: LiftAnalysisOptions,
): Record<string, number> {
  const maxChange = options?.maxChangePercent ?? 0.3;
  const minWeight = options?.minWeight ?? 1;
  const maxWeight = options?.maxWeight ?? 30;

  const adjusted = { ...currentWeights };

  for (const result of liftResults) {
    const currentWeight = adjusted[result.factor];
    if (currentWeight === undefined) continue; // Skip factors not in current weights

    let adjustment: number;

    if (result.lift > 0.5) {
      // Strong positive predictor
      adjustment = Math.min(result.lift * 0.2, maxChange);
    } else if (result.lift > 0.1) {
      // Moderate positive predictor
      adjustment = Math.min(result.lift * 0.1, 0.15);
    } else if (result.lift < -0.3) {
      // Strong negative predictor
      adjustment = Math.max(result.lift * 0.2, -maxChange);
    } else if (result.lift < -0.1) {
      // Moderate negative predictor
      adjustment = Math.max(result.lift * 0.1, -0.15);
    } else {
      // Insignificant — no change
      continue;
    }

    const newWeight = currentWeight * (1 + adjustment);
    adjusted[result.factor] = Math.min(maxWeight, Math.max(minWeight, newWeight));
  }

  return adjusted;
}

function toNumeric(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  return null;
}
