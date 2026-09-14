import assert from "node:assert/strict";
import test from "node:test";
import {
  activatePatterns,
  forbidUrgencyUnderAnxiety,
  predictTrajectories,
  selectNextBestAction,
  type BehaviorID,
  type SituationalBehaviorPattern,
} from "../src/index.js";

const behaviorId: BehaviorID = {
  previous: { code: "HES", label: "Hesitation", confidence: 0.9, observedAt: "2026-09-14T10:00:00Z" },
  transition: { label: "price-comparison", transitionCost: 0.5 },
  current: { code: "COM", label: "Comparison", confidence: 0.92, observedAt: "2026-09-14T10:01:00Z" },
  provenance: ["msg-1", "msg-2", "msg-3"],
};

const pattern: SituationalBehaviorPattern = {
  id: "p-1",
  subjectId: "u-1",
  conditioningBehavior: { previous: "HES", transition: "price-comparison", current: "COM" },
  situation: { topic: "price", intervention: "direct-offer" },
  prediction: { nextState: "RES" },
  exceptions: [{ when: { intervention: "neutral-comparison" } }],
  supportingEvidence: [
    { id: "e1", observedAt: "2026-09-13T10:00:00Z", behaviorIdRef: "g1", situation: { topic: "price" } },
    { id: "e2", observedAt: "2026-09-13T11:00:00Z", behaviorIdRef: "g2", situation: { topic: "price" } },
  ],
  contradictingEvidence: [],
  confidence: 1,
  schemaVersion: 1,
};

test("activates a matching person-specific situational pattern", () => {
  const active = activatePatterns([pattern], behaviorId, { topic: "price", intervention: "direct-offer" });
  assert.equal(active.length, 1);
  assert.equal(active[0]?.pattern.id, "p-1");
});

test("exception suppresses activation", () => {
  const active = activatePatterns([pattern], behaviorId, { topic: "price", intervention: "neutral-comparison" });
  assert.equal(active.length, 0);
});

test("trajectory prediction keeps theta independent from kappa", () => {
  const active = activatePatterns([pattern], behaviorId, { topic: "price", intervention: "direct-offer" });
  const [candidate] = predictTrajectories(active, () => 0.83);
  assert.equal(candidate?.theta, 1);
  assert.equal(candidate?.kappa, 0.83);
  assert.notEqual(candidate?.kappa, 1 - (candidate?.theta ?? 0));
});

test("low confidence selects clarification instead of aggressive action", () => {
  const decision = selectNextBestAction(
    {
      behaviorId,
      situation: { topic: "price" },
      activePatterns: [],
      trajectories: [{
        predictedNext: { nextState: "RES" },
        theta: 0.2,
        kappa: 0.8,
        activePatternIds: [],
        provenance: [],
        source: "transition-prior",
      }],
      objective: "maximize satisfaction",
    },
    [
      { id: "clarify", kind: "ask-clarification", utility: 0.5, description: "Ask what matters most." },
      { id: "offer", kind: "domain-action", utility: 0.9, description: "Push an offer." },
    ],
  );
  assert.equal(decision.selected.id, "clarify");
});

test("governance vetoes urgency exploitation under anxiety", () => {
  const anxious: BehaviorID = {
    ...behaviorId,
    current: { ...behaviorId.current, code: "AAN", label: "Anxiety" },
  };
  const decision = selectNextBestAction(
    {
      behaviorId: anxious,
      situation: {},
      activePatterns: [],
      trajectories: [{
        predictedNext: { nextState: "RES" },
        theta: 0.9,
        kappa: 0.7,
        activePatternIds: [],
        provenance: [],
        source: "transition-prior",
      }],
      objective: "maximize satisfaction",
    },
    [
      { id: "pressure", kind: "domain-action", utility: 1, description: "Increase urgency and FOMO pressure" },
      { id: "calm", kind: "de-escalate", utility: 0.6, description: "Reduce cognitive load" },
    ],
    [forbidUrgencyUnderAnxiety],
  );
  assert.equal(decision.selected.id, "calm");
  assert.deepEqual(decision.vetoedCandidateIds, ["pressure"]);
});
