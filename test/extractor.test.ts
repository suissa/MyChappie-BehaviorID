import test from "node:test";
import assert from "node:assert/strict";
import {
  HeuristicBehaviorIDExtractor,
  analyzeText,
  analyzeProsody,
  type InteractionObservation,
  type ProsodyBaseline
} from "../src/index.js";

const user = (id: string, text: string, observedAt: string): InteractionObservation => ({
  id,
  subjectId: "user-1",
  sender: "user",
  observedAt,
  text,
  modalities: ["text"]
});

const agent = (id: string, text: string, observedAt: string): InteractionObservation => ({
  id,
  subjectId: "user-1",
  sender: "agent",
  observedAt,
  text,
  modalities: ["text"]
});

test("emoji analysis contributes semantic behavioral evidence", () => {
  const result = analyzeText("Hmm 🤔 não sei... está certo? 😬");
  assert.ok(result.uncertainty >= 0.5);
  assert.ok(result.validationSeeking > 0);
  assert.ok(result.emoji.length >= 2);
  assert.ok(result.semanticTags.includes("uncertainty"));
});

test("explicit acceptance emoji contributes acceptance signal", () => {
  const result = analyzeText("Perfeito, fechado! ✅👍");
  assert.ok(result.acceptance >= 0.5);
  assert.ok(result.positiveAffect > 0);
});

test("prosody analyzer uses user-normalized latency, pauses and speaking rate", () => {
  const baseline: ProsodyBaseline = {
    speakingRateWpm: { mean: 145, std: 20 },
    pauseRatio: { mean: 0.2, std: 0.08 },
    latencyMs: { mean: 15_000, std: 5_000 },
    f0StdHz: { mean: 28, std: 8 },
    rmsDb: { mean: -24, std: 4 }
  };
  const observation: InteractionObservation = {
    id: "a1",
    subjectId: "user-1",
    sender: "user",
    observedAt: "2026-09-14T12:00:00Z",
    text: "eu acho... talvez",
    latencyMs: 42_000,
    modalities: ["text", "audio"],
    audio: {
      durationMs: 9_000,
      speechDurationMs: 5_000,
      wordCount: 8,
      speakingRateWpm: 96,
      pauseRatio: 0.48,
      f0StdHz: 22,
      rmsDb: -28,
      transcriptConfidence: 0.95
    }
  };

  const result = analyzeProsody(observation, baseline);
  assert.ok(result);
  assert.ok(result.hesitation > 0.5);
  assert.ok(result.deliberation > 0.5);
  assert.ok(result.evidence.includes("pause-ratio"));
});

test("extractor keeps route information instead of classifying only the final state", () => {
  const extractor = new HeuristicBehaviorIDExtractor({ minStateConfidence: 0.25 });
  const result = extractor.extract([
    user("m1", "Tenho uma dúvida, qual a diferença entre os planos? 🤔", "2026-09-14T12:00:00Z"),
    agent("a1", "Posso comparar preço, limite e prazo para você.", "2026-09-14T12:00:20Z"),
    user("m2", "Esse outro é mais barato, mas não sei se o seu compensa 🤨", "2026-09-14T12:01:00Z")
  ]);

  assert.ok(result.behaviorId);
  assert.notEqual(result.behaviorId.previous.code.length, 0);
  assert.notEqual(result.behaviorId.current.code.length, 0);
  assert.ok(result.behaviorId.provenance.includes("a1"));
  assert.ok(result.behaviorId.provenance.some((item) => item.includes("m2")));
  assert.ok(result.behaviorId.transition.transitionCost >= 0 && result.behaviorId.transition.transitionCost <= 1);
});

test("extractor requires the minimal three-observation window", () => {
  const extractor = new HeuristicBehaviorIDExtractor({ minStateConfidence: 0.1 });
  const result = extractor.extract([
    user("m1", "oi", "2026-09-14T12:00:00Z"),
    user("m2", "ok", "2026-09-14T12:01:00Z")
  ]);
  assert.equal(result.behaviorId, undefined);
  assert.match(result.reason, /three-observation/);
});

test("extractor represents uncertainty instead of fabricating a state", () => {
  const extractor = new HeuristicBehaviorIDExtractor({ minStateConfidence: 0.9 });
  const result = extractor.extract([
    user("m1", "oi", "2026-09-14T12:00:00Z"),
    agent("a1", "Olá", "2026-09-14T12:00:10Z"),
    user("m2", "ok", "2026-09-14T12:01:00Z")
  ]);

  assert.equal(result.behaviorId, undefined);
  assert.ok(result.uncertainty > 0);
});

test("audio and emoji can specialize a textually ambiguous observation", () => {
  const extractor = new HeuristicBehaviorIDExtractor({
    minStateConfidence: 0.2,
    prosodyBaseline: {
      speakingRateWpm: { mean: 140, std: 15 },
      f0StdHz: { mean: 25, std: 5 },
      rmsDb: { mean: -25, std: 3 },
      pauseRatio: { mean: 0.18, std: 0.05 },
      latencyMs: { mean: 10_000, std: 4_000 }
    }
  });

  const result = extractor.extract([
    user("m1", "quero entender melhor", "2026-09-14T12:00:00Z"),
    agent("a1", "Posso resolver isso agora.", "2026-09-14T12:00:05Z"),
    {
      id: "m2",
      subjectId: "user-1",
      sender: "user",
      observedAt: "2026-09-14T12:00:20Z",
      text: "agora!!! 😰⚡",
      latencyMs: 1_500,
      modalities: ["text", "audio"],
      audio: {
        durationMs: 3_000,
        speechDurationMs: 2_800,
        wordCount: 8,
        speakingRateWpm: 205,
        f0StdHz: 42,
        rmsDb: -18,
        pauseRatio: 0.03,
        transcriptConfidence: 0.98
      }
    }
  ]);

  assert.ok(result.behaviorId);
  const currentAnalysis = result.analyzed.at(-1)!;
  assert.ok(currentAnalysis.vector.arousal > 0.5);
  assert.ok(currentAnalysis.vector.urgency > 0.5);
});
