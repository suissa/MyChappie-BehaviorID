import type { ActivePattern, BehaviorPrediction, TrajectoryCandidate } from "./domain.js";

export interface TransitionPrior {
  next: BehaviorPrediction;
  probability: number;
  kappa: number;
  provenance?: readonly string[];
}

export interface PredictionOptions {
  topK?: number;
  priors?: readonly TransitionPrior[];
}

export function predictTrajectories(
  activePatterns: readonly ActivePattern[],
  transitionCost: (nextState: string) => number,
  options: PredictionOptions = {},
): TrajectoryCandidate[] {
  const topK = options.topK ?? 3;
  const grouped = new Map<string, ActivePattern[]>();

  for (const active of activePatterns) {
    const key = `${active.pattern.prediction.nextState}:${active.pattern.prediction.transitionLabel ?? ""}`;
    grouped.set(key, [...(grouped.get(key) ?? []), active]);
  }

  const fromPatterns: TrajectoryCandidate[] = [...grouped.values()].map((group) => {
    const first = group[0]!;
    const prediction = first.pattern.prediction;
    const totalEvidence = group.reduce(
      (sum, item) => sum + item.pattern.supportingEvidence.length + item.pattern.contradictingEvidence.length,
      0,
    );
    const weightedTheta = totalEvidence === 0
      ? 0
      : group.reduce((sum, item) => {
          const weight = item.pattern.supportingEvidence.length + item.pattern.contradictingEvidence.length;
          return sum + item.pattern.confidence * weight;
        }, 0) / totalEvidence;

    return {
      predictedNext: prediction,
      theta: weightedTheta,
      kappa: transitionCost(prediction.nextState),
      activePatternIds: group.map((item) => item.pattern.id),
      provenance: group.flatMap((item) => [
        ...item.pattern.supportingEvidence.map((e) => e.id),
        ...item.pattern.contradictingEvidence.map((e) => e.id),
      ]),
      source: "person" as const,
    };
  });

  const candidates = fromPatterns.length > 0
    ? fromPatterns
    : (options.priors ?? []).map((prior) => ({
        predictedNext: prior.next,
        theta: prior.probability,
        kappa: prior.kappa,
        activePatternIds: [],
        provenance: prior.provenance ?? [],
        source: "transition-prior" as const,
      }));

  return candidates
    .sort((a, b) => b.theta - a.theta)
    .slice(0, Math.max(0, topK));
}
