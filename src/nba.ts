import type {
  NBAActionCandidate,
  NBAConstraint,
  NBADecision,
  NBAPolicyInput,
} from "./domain.js";

export interface NBAPolicyOptions {
  uncertaintyThreshold?: number;
}

export function selectNextBestAction(
  input: NBAPolicyInput,
  candidates: readonly NBAActionCandidate[],
  constraints: readonly NBAConstraint[] = [],
  options: NBAPolicyOptions = {},
): NBADecision {
  if (candidates.length === 0) throw new Error("NBA policy requires at least one action candidate");

  const uncertaintyThreshold = options.uncertaintyThreshold ?? 0.5;
  const maxTheta = input.trajectories.reduce((max, item) => Math.max(max, item.theta), 0);

  const vetoed = new Set<string>();
  for (const action of candidates) {
    if (constraints.some((constraint) => constraint.veto(action, input))) vetoed.add(action.id);
  }

  let eligible = candidates.filter((action) => !vetoed.has(action.id));
  if (eligible.length === 0) throw new Error("All NBA action candidates were vetoed");

  if (maxTheta < uncertaintyThreshold) {
    const cautious = eligible.filter((action) => action.kind === "ask-clarification" || action.kind === "no-op");
    if (cautious.length > 0) eligible = cautious;
  }

  const selected = [...eligible].sort((a, b) => b.utility - a.utility)[0]!;
  const activePatternIds = input.activePatterns.map((item) => item.pattern.id);

  return {
    selected,
    candidates: [...candidates],
    vetoedCandidateIds: [...vetoed],
    behaviorId: input.behaviorId,
    activePatternIds,
    trajectories: [...input.trajectories],
    objective: input.objective,
    reason: maxTheta < uncertaintyThreshold
      ? `Low trajectory confidence (${maxTheta.toFixed(3)}); selected cautious action ${selected.kind}.`
      : `Selected highest-utility eligible action ${selected.kind} under objective ${input.objective}.`,
  };
}

export const forbidUrgencyUnderAnxiety: NBAConstraint = {
  id: "no-urgency-under-anxiety",
  description: "Do not exploit anxiety with pressure-oriented domain actions.",
  veto(action, input) {
    const anxious = input.behaviorId.current.code === "AAN";
    return anxious && action.kind === "domain-action" && /urgency|fomo|pressure/i.test(action.description);
  },
};
