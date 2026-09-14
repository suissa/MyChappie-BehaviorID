import {
  assertUnitInterval,
  validateBehaviorID,
  type BehaviorID,
  type EvidenceRef,
  type NBADecision,
  type NBAOutcome,
  type SituationalBehaviorPattern,
  type TrajectoryCandidate,
} from "./domain.js";

export const PERSISTENCE_SCHEMA_VERSION = 1 as const;

export type PersistentKind =
  | "behavior-id"
  | "situational-behavior-pattern"
  | "trajectory-candidate"
  | "nba-decision"
  | "nba-outcome";

export interface VersionedRecord<T> {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  readonly kind: PersistentKind;
  readonly value: T;
}

type PersistentValue = BehaviorID | SituationalBehaviorPattern | TrajectoryCandidate | NBADecision | NBAOutcome;

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${field} must be a non-empty string`);
}

function requireProvenance(value: readonly string[], field: string): void {
  if (value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} requires immutable provenance references`);
  }
}

export function validatePattern(pattern: SituationalBehaviorPattern): SituationalBehaviorPattern {
  requireText(pattern.id, "pattern.id");
  requireText(pattern.subjectId, "pattern.subjectId");
  requireText(pattern.conditioningBehavior.current, "pattern.conditioningBehavior.current");
  requireText(pattern.prediction.nextState, "pattern.prediction.nextState");
  assertUnitInterval(pattern.confidence, "pattern.confidence");
  if (pattern.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) throw new Error("Unsupported pattern schemaVersion");
  if (pattern.supportingEvidence.length + pattern.contradictingEvidence.length === 0) {
    throw new Error("Pattern requires evidence provenance");
  }
  for (const evidence of [...pattern.supportingEvidence, ...pattern.contradictingEvidence]) {
    requireText(evidence.id, "evidence.id");
    requireText(evidence.behaviorIdRef, "evidence.behaviorIdRef");
  }
  return pattern;
}

function validateTrajectory(value: TrajectoryCandidate): void {
  requireText(value.predictedNext.nextState, "trajectory.predictedNext.nextState");
  assertUnitInterval(value.theta, "trajectory.theta");
  assertUnitInterval(value.kappa, "trajectory.kappa");
  requireProvenance(value.provenance, "trajectory.provenance");
}

function validateOutcome(value: NBAOutcome): void {
  requireText(value.decisionId, "outcome.decisionId");
  requireText(value.subjectId, "outcome.subjectId");
  if (value.evidence.length === 0) throw new Error("Outcome requires evidence provenance");
  if (value.observedBehaviorId) validateBehaviorID(value.observedBehaviorId);
}

function validatePersistentValue(kind: PersistentKind, value: PersistentValue): void {
  switch (kind) {
    case "behavior-id": validateBehaviorID(value as BehaviorID); break;
    case "situational-behavior-pattern": validatePattern(value as SituationalBehaviorPattern); break;
    case "trajectory-candidate": validateTrajectory(value as TrajectoryCandidate); break;
    case "nba-decision": validateBehaviorID((value as NBADecision).behaviorId); break;
    case "nba-outcome": validateOutcome(value as NBAOutcome); break;
  }
}

function cloneAndFreeze<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

export function createVersionedRecord<T extends PersistentValue>(kind: PersistentKind, value: T): VersionedRecord<T> {
  validatePersistentValue(kind, value);
  return cloneAndFreeze({ schemaVersion: PERSISTENCE_SCHEMA_VERSION, kind, value });
}

export function serializeRecord<T extends PersistentValue>(kind: PersistentKind, value: T): string {
  return JSON.stringify(createVersionedRecord(kind, value));
}

export function deserializeRecord<T extends PersistentValue>(json: string, expectedKind: PersistentKind): VersionedRecord<T> {
  const record = JSON.parse(json) as Partial<VersionedRecord<T>>;
  if (record.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) throw new Error("Unsupported persistence schemaVersion");
  if (record.kind !== expectedKind) throw new Error(`Expected ${expectedKind}, received ${String(record.kind)}`);
  if (!record.value || typeof record.value !== "object") throw new TypeError("Persisted value must be an object");
  validatePersistentValue(expectedKind, record.value);
  return cloneAndFreeze(record as VersionedRecord<T>);
}
