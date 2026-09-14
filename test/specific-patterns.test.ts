import test from "node:test";
import assert from "node:assert/strict";
import {
  induceSpecificPattern,
  type BehaviorID,
  type MultimodalPatternObservation
} from "../src/index.js";

const behaviorId: BehaviorID = {
  previous: { code: "HES", label: "Hesitation", confidence: 0.8, observedAt: "2026-09-14T10:00:00Z" },
  transition: { label: "hes-to-com", transitionCost: 0.5 },
  current: { code: "COM", label: "Comparison", confidence: 0.85, observedAt: "2026-09-14T10:01:00Z" },
  provenance: ["m1", "a1", "m2"]
};

const observation = (
  id: string,
  nextState: string,
  signalContext: MultimodalPatternObservation["signalContext"]
): MultimodalPatternObservation => ({
  subjectId: "u1",
  behaviorIdRef: id,
  behaviorId,
  situation: { topic: "price", channel: "whatsapp" },
  signalContext,
  nextState,
  observedAt: `2026-09-14T10:0${id.length}:00Z`
});

test("specific pattern keeps multimodal discriminators that separate outcomes", () => {
  const pattern = induceSpecificPattern([
    observation("b1", "RES", {
      "signal.arousal": "high",
      "signal.resistance": "high",
      "emoji.category.resistance": true,
      "emoji.raw.🤨": true
    }),
    observation("b2", "RES", {
      "signal.arousal": "high",
      "signal.resistance": "high",
      "emoji.category.resistance": true,
      "emoji.raw.🤨": true
    }),
    observation("b3", "ACE", {
      "signal.arousal": "low",
      "signal.resistance": "low",
      "emoji.category.acceptance": true,
      "emoji.raw.✅": true
    })
  ]);

  assert.ok(pattern);
  assert.equal(pattern.prediction.nextState, "RES");
  assert.equal(pattern.situation.topic, "price");
  assert.equal(pattern.situation["emoji.raw.🤨"], true);
  assert.equal(pattern.situation["signal.resistance"], "high");
  assert.equal(pattern.supportingEvidence.length, 2);
  assert.equal(pattern.contradictingEvidence.length, 1);
});

test("specific pattern refuses one-off overfitting by default", () => {
  const pattern = induceSpecificPattern([
    observation("b1", "RES", { "signal.resistance": "high" })
  ]);
  assert.equal(pattern, null);
});
