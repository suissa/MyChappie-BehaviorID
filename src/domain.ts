export type BehaviorStateCode = string;

export interface BehaviorState {
  code: BehaviorStateCode;
  label: string;
  confidence: number;
  observedAt: string;
}

export interface CogTransition {
  label: string;
  transitionCost: number; // kappa: cognitive/emotional effort, never probability
  emotion?: string;
  appraisal?: string;
}

export interface BehaviorID {
  previous: BehaviorState;
  transition: CogTransition;
  current: BehaviorState;
  provenance: readonly string[];
}

export type SituationValue = string | number | boolean | null;
export type SituationContext = Readonly<Record<string, SituationValue>>;

export interface EvidenceRef {
  id: string;
  observedAt: string;
  behaviorIdRef: string;
  situation: SituationContext;
}

export interface PatternException {
  when: SituationContext;
  rationale?: string;
}

export interface BehaviorPrediction {
  nextState: BehaviorStateCode;
  transitionLabel?: string;
}

export interface SituationalBehaviorPattern {
  id: string;
  subjectId: string;
  conditioningBehavior: {
    previous?: BehaviorStateCode;
    transition?: string;
    current: BehaviorStateCode;
  };
  situation: SituationContext;
  prediction: BehaviorPrediction;
  exceptions: readonly PatternException[];
  supportingEvidence: readonly EvidenceRef[];
  contradictingEvidence: readonly EvidenceRef[];
  confidence: number; // theta: empirical confidence/likelihood
  schemaVersion: 1;
}

export interface ActivePattern {
  pattern: SituationalBehaviorPattern;
  matchedFields: readonly string[];
}

export interface TrajectoryCandidate {
  predictedNext: BehaviorPrediction;
  theta: number;
  kappa: number;
  activePatternIds: readonly string[];
  provenance: readonly string[];
  source: "person" | "cohort" | "global" | "transition-prior";
}

export type NBAActionKind =
  | "no-op"
  | "ask-clarification"
  | "de-escalate"
  | "present-evidence"
  | "compare"
  | "follow-up"
  | "domain-action";

export interface NBAActionCandidate {
  id: string;
  kind: NBAActionKind;
  utility: number;
  description: string;
}

export interface NBAConstraint {
  id: string;
  description: string;
  veto(action: NBAActionCandidate, input: NBAPolicyInput): boolean;
}

export interface NBAPolicyInput {
  behaviorId: BehaviorID;
  situation: SituationContext;
  activePatterns: readonly ActivePattern[];
  trajectories: readonly TrajectoryCandidate[];
  objective: string;
}

export interface NBADecision {
  selected: NBAActionCandidate;
  candidates: readonly NBAActionCandidate[];
  vetoedCandidateIds: readonly string[];
  behaviorId: BehaviorID;
  activePatternIds: readonly string[];
  trajectories: readonly TrajectoryCandidate[];
  objective: string;
  reason: string;
}

export function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be within [0, 1]`);
  }
}

export function validateBehaviorID(value: BehaviorID): BehaviorID {
  assertUnitInterval(value.previous.confidence, "previous.confidence");
  assertUnitInterval(value.current.confidence, "current.confidence");
  assertUnitInterval(value.transition.transitionCost, "transition.transitionCost");
  if (value.provenance.length === 0) throw new Error("BehaviorID requires provenance");
  return value;
}
