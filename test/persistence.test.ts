import assert from "node:assert/strict";
import test from "node:test";
import {
  createVersionedRecord,
  deserializeRecord,
  serializeRecord,
  type SituationalBehaviorPattern,
  type TrajectoryCandidate,
} from "../src/index.js";

const pattern: SituationalBehaviorPattern = {
  id: "pattern:u1:COM:RES",
  subjectId: "u1",
  conditioningBehavior: { previous: "HES", transition: "compare", current: "COM" },
  situation: { topic: "price" },
  prediction: { nextState: "RES" },
  exceptions: [{ when: { intervention: "neutral" } }],
  supportingEvidence: [{ id: "e1", observedAt: "2026-09-14T10:00:00Z", behaviorIdRef: "g1", situation: { topic: "price" } }],
  contradictingEvidence: [],
  confidence: 1,
  schemaVersion: 1,
};

test("versioned pattern survives deterministic JSON round trip", () => {
  const json = serializeRecord("situational-behavior-pattern", pattern);
  const restored = deserializeRecord<SituationalBehaviorPattern>(json, "situational-behavior-pattern");
  assert.deepEqual(restored.value, pattern);
  assert.equal(restored.schemaVersion, 1);
  assert.equal(Object.isFrozen(restored.value.supportingEvidence), true);
});

test("trajectory persists theta and kappa as independent fields", () => {
  const trajectory: TrajectoryCandidate = {
    predictedNext: { nextState: "RES" }, theta: 0.75, kappa: 0.2,
    activePatternIds: [pattern.id], provenance: ["e1"], source: "person",
  };
  const raw = JSON.parse(serializeRecord("trajectory-candidate", trajectory)) as { value: Record<string, unknown> };
  assert.equal(raw.value.theta, 0.75);
  assert.equal(raw.value.kappa, 0.2);
  assert.notEqual(raw.value.theta, raw.value.kappa);
});

test("pattern without antecedent, prediction or provenance is rejected", () => {
  assert.throws(() => createVersionedRecord("situational-behavior-pattern", {
    ...pattern, conditioningBehavior: { current: "" },
  }), /conditioningBehavior.current/);
  assert.throws(() => createVersionedRecord("situational-behavior-pattern", {
    ...pattern, prediction: { nextState: "" },
  }), /prediction.nextState/);
  assert.throws(() => createVersionedRecord("situational-behavior-pattern", {
    ...pattern, supportingEvidence: [],
  }), /evidence provenance/);
});

test("provenance remains immutable through the persistence API", () => {
  const record = createVersionedRecord("situational-behavior-pattern", pattern);
  assert.throws(() => (record.value.supportingEvidence as unknown as Array<unknown>).push({}));
});
