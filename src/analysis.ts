import { analyzeText } from "./text-analysis.js";
import { analyzeProsody } from "./prosody.js";
import {
  clamp01,
  clamp11,
  type AnalyzedObservation,
  type BehavioralSignalVector,
  type InteractionObservation,
  type ProsodyBaseline
} from "./signals.js";

export interface MultimodalAnalyzerOptions {
  prosodyBaseline?: ProsodyBaseline;
}

export function analyzeObservation(
  observation: InteractionObservation,
  options: MultimodalAnalyzerOptions = {}
): AnalyzedObservation {
  const text = observation.text?.trim() ? analyzeText(observation.text) : undefined;
  const prosody = analyzeProsody(observation, options.prosodyBaseline);

  const textConfidence = text ? clamp01(0.35 + Math.min(text.tokens, 25) / 40) : 0;
  const prosodyConfidence = prosody?.confidence ?? 0;
  const modalities = (text ? 1 : 0) + (prosody ? 1 : 0);

  const positive = text?.positiveAffect ?? 0;
  const negative = text?.negativeAffect ?? 0;
  const valence = clamp11(positive - negative - 0.35 * (text?.resistance ?? 0));

  const vector: BehavioralSignalVector = {
    valence,
    arousal: clamp01(Math.max(
      prosody?.arousal ?? 0,
      (text?.exclamations ?? 0) > 0 ? 0.5 : 0,
      (text?.repeatedPunctuation ?? 0) > 0 ? 0.65 : 0,
      (text?.uppercaseRatio ?? 0) * 0.8,
      text?.emoji.some((item) => item.categories.includes("high-arousal")) ? 0.75 : 0
    )),
    uncertainty: clamp01(Math.max(text?.uncertainty ?? 0, prosody?.hesitation ?? 0)),
    engagement: clamp01(Math.max(text?.engagement ?? 0, positive * 0.7)),
    resistance: clamp01(Math.max(text?.resistance ?? 0, (text?.negation ?? 0) * 0.75)),
    urgency: clamp01(Math.max(text?.urgency ?? 0, prosody?.urgency ?? 0)),
    deliberation: clamp01(Math.max(
      prosody?.deliberation ?? 0,
      (text?.comparison ?? 0) * 0.8,
      (text?.uncertainty ?? 0) * 0.55
    )),
    acceptance: text?.acceptance ?? 0,
    validationSeeking: text?.validationSeeking ?? 0,
    negation: text?.negation ?? 0,
    comparison: text?.comparison ?? 0,
    confidence: modalities === 0 ? 0 : clamp01((textConfidence + prosodyConfidence) / modalities),
    tags: [
      ...(text?.semanticTags ?? []),
      ...(prosody?.evidence.map((value) => `prosody:${value}`) ?? [])
    ]
  };

  return { observation, text, prosody, vector };
}

export function analyzeObservations(
  observations: readonly InteractionObservation[],
  options: MultimodalAnalyzerOptions = {}
): readonly AnalyzedObservation[] {
  return observations.map((observation) => analyzeObservation(observation, options));
}
