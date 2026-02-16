export const DETERMINISTIC_REASON_CODES = {
  hardFilterFailed: 'HARD_FILTER_FAILED',
  hardFilterPassed: 'HARD_FILTER_PASSED',
  noWeightedRules: 'NO_WEIGHTED_RULES',
  highWeightedMatch: 'HIGH_WEIGHTED_MATCH',
  mediumWeightedMatch: 'MEDIUM_WEIGHTED_MATCH',
  lowWeightedMatch: 'LOW_WEIGHTED_MATCH',
  noRuleMatches: 'NO_RULE_MATCHES',
} as const;

export type DeterministicReasonCode =
  (typeof DETERMINISTIC_REASON_CODES)[keyof typeof DETERMINISTIC_REASON_CODES];

export interface DeterministicRule {
  id: string;
  name: string;
  ruleType: 'WEIGHTED' | 'HARD_FILTER';
  isRequired?: boolean;
  fieldKey: string;
  operator: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN' | 'CONTAINS';
  valueJson: unknown;
  weight: number | null;
  isActive: boolean;
  orderIndex?: number;
  priority: number;
}

export interface RuleEvaluationResult {
  ruleId: string;
  fieldKey: string;
  operator: DeterministicRule['operator'];
  ruleType: DeterministicRule['ruleType'];
  matched: boolean;
  weightApplied: number;
  contribution: number;
  reasonCode: string;
}

export interface DeterministicScoreResult {
  qualificationScore: number;
  hardFilterPassed: boolean;
  ruleMatchCount: number;
  reasonCodes: string[];
  ruleEvaluation: RuleEvaluationResult[];
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeComparable(value: unknown): unknown {
  const asString = normalizeString(value);
  if (asString !== null) {
    return asString.toLowerCase();
  }

  const asNumeric = asNumber(value);
  if (asNumeric !== null) {
    return asNumeric;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return value;
}

function getFeatureValue(features: Record<string, unknown>, fieldKey: string): unknown {
  if (fieldKey.includes('.')) {
    const path = fieldKey.split('.');
    let current: unknown = features;
    for (const segment of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  return features[fieldKey];
}

function sanitizeFieldKey(fieldKey: string): string {
  return fieldKey
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function isCountryHardFilterField(fieldKey: string): boolean {
  return fieldKey.trim().toLowerCase() === 'country';
}

export function evaluateRuleMatch(rule: DeterministicRule, featureValue: unknown): boolean {
  const ruleValue = rule.valueJson;

  switch (rule.operator) {
    case 'EQ':
      return normalizeComparable(featureValue) === normalizeComparable(ruleValue);
    case 'NEQ':
      return normalizeComparable(featureValue) !== normalizeComparable(ruleValue);
    case 'GT': {
      const left = asNumber(featureValue);
      const right = asNumber(ruleValue);
      return left !== null && right !== null && left > right;
    }
    case 'GTE': {
      const left = asNumber(featureValue);
      const right = asNumber(ruleValue);
      return left !== null && right !== null && left >= right;
    }
    case 'LT': {
      const left = asNumber(featureValue);
      const right = asNumber(ruleValue);
      return left !== null && right !== null && left < right;
    }
    case 'LTE': {
      const left = asNumber(featureValue);
      const right = asNumber(ruleValue);
      return left !== null && right !== null && left <= right;
    }
    case 'IN': {
      if (!Array.isArray(ruleValue)) {
        return false;
      }
      const normalizedFeature = normalizeComparable(featureValue);
      const normalizedSet = ruleValue.map((value) => normalizeComparable(value));
      return normalizedSet.includes(normalizedFeature);
    }
    case 'NOT_IN': {
      if (!Array.isArray(ruleValue)) {
        return false;
      }
      const normalizedFeature = normalizeComparable(featureValue);
      const normalizedSet = ruleValue.map((value) => normalizeComparable(value));
      return !normalizedSet.includes(normalizedFeature);
    }
    case 'CONTAINS': {
      const normalizedRule = normalizeComparable(ruleValue);
      if (Array.isArray(featureValue)) {
        return featureValue.map((value) => normalizeComparable(value)).includes(normalizedRule);
      }
      const normalizedFeature = normalizeString(featureValue);
      if (normalizedFeature === null || typeof normalizedRule !== 'string') {
        return false;
      }
      return normalizedFeature.toLowerCase().includes(normalizedRule);
    }
    default:
      return false;
  }
}

function classifyWeightedReason(score: number): DeterministicReasonCode {
  if (score >= 0.75) {
    return DETERMINISTIC_REASON_CODES.highWeightedMatch;
  }
  if (score >= 0.4) {
    return DETERMINISTIC_REASON_CODES.mediumWeightedMatch;
  }
  return DETERMINISTIC_REASON_CODES.lowWeightedMatch;
}

export function toScoreBand(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score < 0.34) {
    return 'LOW';
  }
  if (score < 0.67) {
    return 'MEDIUM';
  }
  return 'HIGH';
}

export function evaluateDeterministicScore(
  rules: DeterministicRule[],
  features: Record<string, unknown>,
): DeterministicScoreResult {
  const activeRules = rules
    .filter((rule) => rule.isActive)
    .sort((a, b) => {
      const orderA = a.orderIndex ?? a.priority;
      const orderB = b.orderIndex ?? b.priority;
      if (orderA === orderB) {
        return a.id.localeCompare(b.id);
      }
      return orderA - orderB;
    });

  const reasonCodes: string[] = [];
  const ruleEvaluation: RuleEvaluationResult[] = [];
  let hardFilterPassed = true;
  let weightedPositiveMatched = 0;
  let weightedPositiveTotal = 0;
  let weightedNegativeMatched = 0;
  let weightedNegativeTotal = 0;
  let ruleMatchCount = 0;

  for (const rule of activeRules) {
    const featureValue = getFeatureValue(features, rule.fieldKey);
    const matched = evaluateRuleMatch(rule, featureValue);
    const effectiveRuleType: DeterministicRule['ruleType'] =
      (rule.ruleType === 'HARD_FILTER' || rule.isRequired === true) && isCountryHardFilterField(rule.fieldKey)
        ? 'HARD_FILTER'
        : 'WEIGHTED';
    const weightApplied =
      effectiveRuleType === 'WEIGHTED'
        ? (rule.weight ?? 1)
        : 0;
    const contribution = matched ? weightApplied : 0;

    if (matched) {
      ruleMatchCount += 1;
    }

    if (effectiveRuleType === 'HARD_FILTER' && !matched) {
      hardFilterPassed = false;
      reasonCodes.push(`HARD_FILTER_FAILED_${sanitizeFieldKey(rule.fieldKey)}`);
    }

    if (effectiveRuleType === 'WEIGHTED') {
      if (weightApplied >= 0) {
        weightedPositiveTotal += weightApplied;
        if (matched) {
          weightedPositiveMatched += weightApplied;
        }
      } else {
        const penalty = Math.abs(weightApplied);
        weightedNegativeTotal += penalty;
        if (matched) {
          weightedNegativeMatched += penalty;
        }
      }
    }

    ruleEvaluation.push({
      ruleId: rule.id,
      fieldKey: rule.fieldKey,
      operator: rule.operator,
      ruleType: effectiveRuleType,
      matched,
      weightApplied,
      contribution,
      reasonCode: matched ? 'RULE_MATCHED' : 'RULE_NOT_MATCHED',
    });
  }

  let qualificationScore = 0;
  if (hardFilterPassed) {
    if (weightedPositiveTotal > 0 || weightedNegativeTotal > 0) {
      const baseScore =
        weightedPositiveTotal > 0
          ? (weightedPositiveMatched + 1) / (weightedPositiveTotal + 1)
          : 1;
      const penaltyFactor =
        weightedNegativeTotal > 0
          ? 1 - (weightedNegativeMatched / weightedNegativeTotal) * 0.8
          : 1;
      const boundedPenaltyFactor = Math.max(0.2, Math.min(1, penaltyFactor));
      qualificationScore = baseScore * boundedPenaltyFactor;
    } else {
      qualificationScore = 1;
      reasonCodes.push(DETERMINISTIC_REASON_CODES.noWeightedRules);
    }
    reasonCodes.push(DETERMINISTIC_REASON_CODES.hardFilterPassed);
    reasonCodes.push(classifyWeightedReason(qualificationScore));
  } else {
    qualificationScore = 0;
    reasonCodes.push(DETERMINISTIC_REASON_CODES.hardFilterFailed);
  }

  if (ruleMatchCount === 0) {
    reasonCodes.push(DETERMINISTIC_REASON_CODES.noRuleMatches);
  }

  const normalizedScore = Math.max(0, Math.min(1, Number(qualificationScore.toFixed(6))));
  const uniqueReasonCodes = Array.from(new Set(reasonCodes));

  return {
    qualificationScore: normalizedScore,
    hardFilterPassed,
    ruleMatchCount,
    reasonCodes: uniqueReasonCodes,
    ruleEvaluation,
  };
}
