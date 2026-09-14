import { validateBehaviorID, type BehaviorID, type BehaviorState, type BehaviorStateCode, type CogTransition } from "./domain.js";
import { analyzeObservations, type MultimodalAnalyzerOptions } from "./analysis.js";
import type { AnalyzedObservation, BehavioralSignalVector, InteractionObservation } from "./signals.js";

export interface BehaviorIDExtractorResult {
  behaviorId?: BehaviorID;
  analyzed: readonly AnalyzedObservation[];
  stateScores: Readonly<Record<string, number>>;
  uncertainty: number;
  reason: string;
}

export interface BehaviorIDExtractor {
  extract(observations: readonly InteractionObservation[]): BehaviorIDExtractorResult;
}

export interface HeuristicExtractorOptions extends MultimodalAnalyzerOptions {
  minStateConfidence?: number;
  transitionCost?: (from: BehaviorStateCode, to: BehaviorStateCode) => number;
}

type ScoredState = { code: BehaviorStateCode; label: string; score: number };

const labels: Readonly<Record<string, string>> = {
  CUR: "Curiosity",
  ENG: "Engagement",
  HES: "Hesitation",
  COM: "Comparison",
  RES: "Resistance",
  ACE: "Acceptance",
  VAL: "Validation",
  ABO: "Abandonment",
  NEG: "Denial",
  AAN: "Anxiety",
  INP: "Impulse",
  DES: "Disinterest"
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const avg = (...values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);

function scoreStates(current: AnalyzedObservation): readonly ScoredState[] {
  const v = current.vector;
  const t = current.text;
  const p = current.prosody;
  const shortness = t ? clamp01(1 - t.tokens / 10) : 0;
  const question = t?.interrogative ?? 0;
  const lowArousal = 1 - v.arousal;
  const positiveValence = clamp01((v.valence + 1) / 2);
  const negativeValence = clamp01((1 - v.valence) / 2);

  const scores: Record<string, number> = {
    CUR: avg(question, v.engagement, 1 - v.resistance),
    ENG: avg(v.engagement, positiveValence, Math.max(question * 0.6, 1 - shortness)),
    HES: avg(v.uncertainty, v.deliberation, p?.hesitation ?? 0),
    COM: avg(v.comparison, v.deliberation, question * 0.4),
    RES: avg(v.resistance, negativeValence, Math.max(v.negation * 0.7, v.arousal * 0.4)),
    ACE: avg(v.acceptance, positiveValence, 1 - v.resistance),
    VAL: avg(v.validationSeeking, v.uncertainty, question),
    ABO: current.observation.modalities.includes("silence") ? avg(0.9, p?.latencyNormalized ?? 0.7, 1 - v.engagement) : 0.02,
    NEG: avg(v.negation, v.resistance, negativeValence),
    AAN: avg(v.urgency, v.arousal, v.uncertainty, Math.max(0, negativeValence - 0.2)),
    INP: avg(v.urgency, v.arousal, 1 - v.deliberation),
    DES: avg(shortness, lowArousal, 1 - v.engagement, Math.max(0, negativeValence - v.resistance * 0.5))
  };

  return Object.entries(scores)
    .map(([code, score]) => ({ code, label: labels[code] ?? code, score: clamp01(score) }))
    .sort((a, b) => b.score - a.score);
}

function inferTransitionLabel(previous: AnalyzedObservation, current: AnalyzedObservation, from: string, to: string): string {
  const a = previous.vector;
  const b = current.vector;
  if (from === to) return "state-reinforcement";
  if (b.comparison >= 0.55 && b.resistance >= 0.45) return "defensive-comparison";
  if (b.acceptance >= 0.6 && b.valence > a.valence) return "confirmation";
  if (b.uncertainty >= 0.55 && b.deliberation >= 0.45) return "deliberative-hesitation";
  if (b.validationSeeking >= 0.55) return "validation-seeking";
  if (b.urgency >= 0.65 && b.arousal >= 0.55) return "urgency-escalation";
  if (b.resistance > a.resistance + 0.2) return "resistance-escalation";
  if (b.engagement > a.engagement + 0.2) return "engagement-rise";
  if (b.engagement + 0.2 < a.engagement) return "engagement-drop";
  if (b.negation >= 0.6) return "explicit-negation";
  return `${from.toLowerCase()}-to-${to.toLowerCase()}`;
}

function defaultCost(from: string, to: string): number {
  if (from === to) return 0.05;
  const high = new Set(["NEG:ACE", "RES:ACE", "ABO:ENG", "ABO:ACE"]);
  const medium = new Set(["COM:RES", "HES:ACE", "AAN:ACE", "DES:CUR"]);
  if (high.has(`${from}:${to}`)) return 0.9;
  if (medium.has(`${from}:${to}`)) return 0.6;
  return 0.35;
}

function toBehaviorState(scored: ScoredState, observedAt: string): BehaviorState {
  return {
    code: scored.code,
    label: scored.label,
    confidence: scored.score,
    observedAt
  };
}

export class HeuristicBehaviorIDExtractor implements BehaviorIDExtractor {
  readonly #options: HeuristicExtractorOptions;

  constructor(options: HeuristicExtractorOptions = {}) {
    this.#options = options;
  }

  extract(observations: readonly InteractionObservation[]): BehaviorIDExtractorResult {
    const analyzed = analyzeObservations(observations, this.#options);
    if (analyzed.length < 3) {
      return {
        analyzed,
        stateScores: {},
        uncertainty: 1,
        reason: "BehaviorID requires the minimal three-observation window."
      };
    }

    const window = analyzed.slice(-3);
    const userTurns = window.filter((item) => item.observation.sender === "user");
    if (userTurns.length < 2) {
      return {
        analyzed,
        stateScores: {},
        uncertainty: 1,
        reason: "The three-observation window must contain a previous and current user observation."
      };
    }

    const previousObs = userTurns[0]!;
    const currentObs = userTurns.at(-1)!;
    const previousScores = scoreStates(previousObs);
    const currentScores = scoreStates(currentObs);
    const previous = previousScores[0]!;
    const current = currentScores[0]!;
    const minConfidence = this.#options.minStateConfidence ?? 0.35;
    const uncertainty = clamp01(1 - Math.min(previous.score, current.score));
    const stateScores = Object.fromEntries(currentScores.map((item) => [item.code, item.score]));

    if (previous.score < minConfidence || current.score < minConfidence) {
      return {
        analyzed,
        stateScores,
        uncertainty,
        reason: `State confidence below threshold (${minConfidence}).`
      };
    }

    const label = inferTransitionLabel(previousObs, currentObs, previous.code, current.code);
    const transition: CogTransition = {
      label,
      transitionCost: clamp01((this.#options.transitionCost ?? defaultCost)(previous.code, current.code)),
      emotion: inferEmotion(currentObs.vector),
      appraisal: inferAppraisal(currentObs.vector)
    };

    const behaviorId: BehaviorID = validateBehaviorID({
      previous: toBehaviorState(previous, previousObs.observation.observedAt),
      transition,
      current: toBehaviorState(current, currentObs.observation.observedAt),
      provenance: [
        ...window.map((item) => item.observation.id),
        ...currentObs.vector.tags.map((tag) => `${currentObs.observation.id}:${tag}`)
      ]
    });

    return {
      behaviorId,
      analyzed,
      stateScores,
      uncertainty,
      reason: "BehaviorID inferred from a three-observation multimodal text/prosody window."
    };
  }
}

function inferEmotion(v: BehavioralSignalVector): string {
  if (v.urgency > 0.7 && v.arousal > 0.6) return "high-arousal";
  if (v.valence > 0.45) return "positive";
  if (v.valence < -0.35) return "negative";
  if (v.uncertainty > 0.6) return "uncertain";
  return "neutral";
}

function inferAppraisal(v: BehavioralSignalVector): string {
  if (v.resistance > 0.6) return "defensive";
  if (v.comparison > 0.55) return "evaluative";
  if (v.validationSeeking > 0.55) return "validation-seeking";
  if (v.deliberation > 0.6) return "deliberative";
  if (v.acceptance > 0.6) return "accepting";
  return "undetermined";
}
