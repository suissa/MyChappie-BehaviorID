import type { SituationContext, SituationalBehaviorPattern, EvidenceRef } from "./domain.js";
import type { AnalyzedObservation, BehavioralSignalVector, SituationValue } from "./signals.js";
import type { PatternObservation } from "./patterns.js";
import { estimateConfidence } from "./patterns.js";

export interface MultimodalPatternObservation extends PatternObservation {
  signalContext: SituationContext;
}

export interface SpecificPatternOptions {
  minSupport?: number;
  maxSignalConditions?: number;
}

function bucket(value: number): "low" | "mid" | "high" {
  if (value < 0.34) return "low";
  if (value > 0.66) return "high";
  return "mid";
}

function valenceBucket(value: number): "negative" | "neutral" | "positive" {
  if (value < -0.25) return "negative";
  if (value > 0.25) return "positive";
  return "neutral";
}

/** Convert rich multimodal evidence into categorical conditions usable by the
 * symbolic IF/THEN/EXCEPT pattern layer. Raw values remain available in the
 * AnalyzedObservation; this projection is only for rule induction/activation.
 */
export function buildSignalSituation(analyzed: AnalyzedObservation): SituationContext {
  const v = analyzed.vector;
  const out: Record<string, SituationValue> = {
    "signal.valence": valenceBucket(v.valence),
    "signal.arousal": bucket(v.arousal),
    "signal.uncertainty": bucket(v.uncertainty),
    "signal.engagement": bucket(v.engagement),
    "signal.resistance": bucket(v.resistance),
    "signal.urgency": bucket(v.urgency),
    "signal.deliberation": bucket(v.deliberation),
    "signal.acceptance": bucket(v.acceptance),
    "signal.validationSeeking": bucket(v.validationSeeking),
    "signal.negation": bucket(v.negation),
    "signal.comparison": bucket(v.comparison)
  };

  for (const tag of v.tags) out[`tag.${tag}`] = true;
  for (const emoji of analyzed.text?.emoji ?? []) {
    out[`emoji.raw.${emoji.emoji}`] = true;
    for (const category of emoji.categories) out[`emoji.category.${category}`] = true;
  }
  return out;
}

export function enrichSituation(base: SituationContext, analyzed: AnalyzedObservation): SituationContext {
  return { ...base, ...buildSignalSituation(analyzed) };
}

function evidence(item: MultimodalPatternObservation): EvidenceRef {
  return {
    id: `${item.behaviorIdRef}:${item.nextState}`,
    observedAt: item.observedAt,
    behaviorIdRef: item.behaviorIdRef,
    situation: { ...item.situation, ...item.signalContext }
  };
}

/**
 * Finds stable multimodal conditions shared by examples that lead to the same
 * next state and prefers conditions that differ in contradicting examples.
 * This is a deterministic baseline for discovering sub-patterns such as:
 *
 *   COM + high arousal + emoji.category.resistance -> RES
 *
 * while a different COM presentation can remain a different rule.
 */
export function induceSpecificPattern(
  observations: readonly MultimodalPatternObservation[],
  options: SpecificPatternOptions = {}
): SituationalBehaviorPattern | null {
  if (observations.length === 0) return null;
  const first = observations[0]!;
  if (observations.some((item) => item.subjectId !== first.subjectId)) {
    throw new Error("Specific pattern induction requires one subject");
  }

  const counts = new Map<string, number>();
  for (const item of observations) counts.set(item.nextState, (counts.get(item.nextState) ?? 0) + 1);
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!winner) return null;
  const [nextState] = winner;
  const supporters = observations.filter((item) => item.nextState === nextState);
  const contradictions = observations.filter((item) => item.nextState !== nextState);
  if (supporters.length < (options.minSupport ?? 2)) return null;

  const merged = (item: MultimodalPatternObservation): SituationContext => ({
    ...item.situation,
    ...item.signalContext
  });

  const firstContext = merged(supporters[0]!);
  const stable = Object.entries(firstContext).filter(([key, value]) =>
    supporters.every((item) => merged(item)[key] === value)
  );

  const baseKeys = new Set(Object.keys(first.situation));
  const baseConditions = stable.filter(([key]) => baseKeys.has(key));
  const discriminativeSignals = stable.filter(([key, value]) => {
    if (baseKeys.has(key)) return false;
    return contradictions.length === 0 || contradictions.some((item) => merged(item)[key] !== value);
  });

  // Prefer explicit emoji/tags, then categorical signal buckets. This preserves
  // the user's high-value symbolic cues while bounding over-specialization.
  discriminativeSignals.sort(([a], [b]) => signalPriority(a) - signalPriority(b) || a.localeCompare(b));
  const selectedSignals = discriminativeSignals.slice(0, options.maxSignalConditions ?? 8);
  const situation = Object.fromEntries([...baseConditions, ...selectedSignals]) as SituationContext;

  const supportingEvidence = supporters.map(evidence);
  const contradictingEvidence = contradictions.map(evidence);

  return {
    id: `specific-pattern:${first.subjectId}:${first.behaviorId.current.code}:${nextState}:${selectedSignals.length}`,
    subjectId: first.subjectId,
    conditioningBehavior: {
      previous: first.behaviorId.previous.code,
      transition: first.behaviorId.transition.label,
      current: first.behaviorId.current.code
    },
    situation,
    prediction: { nextState },
    exceptions: [],
    supportingEvidence,
    contradictingEvidence,
    confidence: estimateConfidence(supportingEvidence.length, contradictingEvidence.length),
    schemaVersion: 1
  };
}

function signalPriority(key: string): number {
  if (key.startsWith("emoji.raw.")) return 0;
  if (key.startsWith("emoji.category.")) return 1;
  if (key.startsWith("tag.")) return 2;
  return 3;
}

export function vectorDistance(a: BehavioralSignalVector, b: BehavioralSignalVector): number {
  const fields: (keyof BehavioralSignalVector)[] = [
    "valence", "arousal", "uncertainty", "engagement", "resistance", "urgency",
    "deliberation", "acceptance", "validationSeeking", "negation", "comparison", "confidence"
  ];
  const numeric = fields.map((field) => Number(a[field]) - Number(b[field]));
  return Math.sqrt(numeric.reduce((sum, value) => sum + value * value, 0));
}
