import {
  type ActivePattern,
  type BehaviorID,
  type EvidenceRef,
  type SituationContext,
  type SituationalBehaviorPattern,
  assertUnitInterval,
} from "./domain.js";

export interface PatternObservation {
  subjectId: string;
  behaviorIdRef: string;
  behaviorId: BehaviorID;
  situation: SituationContext;
  nextState: string;
  observedAt: string;
}

export interface ActivationOptions {
  minConfidence?: number;
  minEvidence?: number;
}

export function estimateConfidence(support: number, contradict: number): number {
  if (support < 0 || contradict < 0) throw new RangeError("Evidence counts cannot be negative");
  const total = support + contradict;
  return total === 0 ? 0 : support / total;
}

function contextMatches(required: SituationContext, actual: SituationContext): boolean {
  return Object.entries(required).every(([key, value]) => actual[key] === value);
}

function behaviorMatches(pattern: SituationalBehaviorPattern, behaviorId: BehaviorID): boolean {
  const c = pattern.conditioningBehavior;
  return c.current === behaviorId.current.code
    && (c.previous === undefined || c.previous === behaviorId.previous.code)
    && (c.transition === undefined || c.transition === behaviorId.transition.label);
}

export function isExceptionActive(pattern: SituationalBehaviorPattern, situation: SituationContext): boolean {
  return pattern.exceptions.some((exception) => contextMatches(exception.when, situation));
}

export function activatePatterns(
  patterns: readonly SituationalBehaviorPattern[],
  behaviorId: BehaviorID,
  situation: SituationContext,
  options: ActivationOptions = {},
): ActivePattern[] {
  const minConfidence = options.minConfidence ?? 0.5;
  const minEvidence = options.minEvidence ?? 1;
  assertUnitInterval(minConfidence, "minConfidence");

  return patterns.flatMap((pattern) => {
    if (!behaviorMatches(pattern, behaviorId)) return [];
    if (!contextMatches(pattern.situation, situation)) return [];
    if (isExceptionActive(pattern, situation)) return [];
    if (pattern.confidence < minConfidence) return [];
    if (pattern.supportingEvidence.length < minEvidence) return [];

    const matchedFields = Object.keys(pattern.situation).filter(
      (key) => pattern.situation[key] === situation[key],
    );
    return [{ pattern, matchedFields }];
  });
}

export function updatePatternEvidence(
  pattern: SituationalBehaviorPattern,
  evidence: EvidenceRef,
  outcome: "support" | "contradict",
): SituationalBehaviorPattern {
  const alreadySeen = [...pattern.supportingEvidence, ...pattern.contradictingEvidence]
    .some((item) => item.id === evidence.id);
  if (alreadySeen) return pattern;

  const supportingEvidence = outcome === "support"
    ? [...pattern.supportingEvidence, evidence]
    : [...pattern.supportingEvidence];
  const contradictingEvidence = outcome === "contradict"
    ? [...pattern.contradictingEvidence, evidence]
    : [...pattern.contradictingEvidence];

  return {
    ...pattern,
    supportingEvidence,
    contradictingEvidence,
    confidence: estimateConfidence(supportingEvidence.length, contradictingEvidence.length),
  };
}

export function induceExactPattern(observations: readonly PatternObservation[]): SituationalBehaviorPattern | null {
  if (observations.length === 0) return null;
  const [first, ...rest] = observations;
  if (!first) return null;
  if (rest.some((item) => item.subjectId !== first.subjectId)) {
    throw new Error("Exact pattern induction requires one subject");
  }

  const outcomeCounts = new Map<string, number>();
  for (const item of observations) outcomeCounts.set(item.nextState, (outcomeCounts.get(item.nextState) ?? 0) + 1);
  const winner = [...outcomeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!winner) return null;
  const [nextState] = winner;

  const mkEvidence = (item: PatternObservation): EvidenceRef => ({
    id: `${item.behaviorIdRef}:${item.nextState}`,
    observedAt: item.observedAt,
    behaviorIdRef: item.behaviorIdRef,
    situation: item.situation,
  });

  const supportingEvidence = observations.filter((item) => item.nextState === nextState).map(mkEvidence);
  const contradictingEvidence = observations.filter((item) => item.nextState !== nextState).map(mkEvidence);

  return {
    id: `pattern:${first.subjectId}:${first.behaviorId.current.code}:${nextState}`,
    subjectId: first.subjectId,
    conditioningBehavior: {
      previous: first.behaviorId.previous.code,
      transition: first.behaviorId.transition.label,
      current: first.behaviorId.current.code,
    },
    situation: first.situation,
    prediction: { nextState },
    exceptions: [],
    supportingEvidence,
    contradictingEvidence,
    confidence: estimateConfidence(supportingEvidence.length, contradictingEvidence.length),
    schemaVersion: 1,
  };
}
