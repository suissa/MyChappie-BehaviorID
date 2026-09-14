export type Modality = "text" | "audio" | "silence";

export interface InteractionObservation {
  id: string;
  subjectId: string;
  sender: "user" | "agent" | "system";
  observedAt: string;
  text?: string;
  latencyMs?: number;
  modalities: readonly Modality[];
  audio?: AudioObservation;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Audio features are intentionally decoder-agnostic. A WhatsApp/audio adapter can
 * use any ASR/DSP stack and feed the normalized observable measurements here.
 */
export interface AudioObservation {
  durationMs: number;
  speechDurationMs?: number;
  wordCount?: number;
  syllableCount?: number;
  meanF0Hz?: number;
  f0StdHz?: number;
  rmsDb?: number;
  speakingRateWpm?: number;
  pauseRatio?: number;
  jitter?: number;
  shimmer?: number;
  transcriptConfidence?: number;
}

export interface ProsodyBaseline {
  meanF0Hz?: { mean: number; std: number };
  f0StdHz?: { mean: number; std: number };
  rmsDb?: { mean: number; std: number };
  speakingRateWpm?: { mean: number; std: number };
  pauseRatio?: { mean: number; std: number };
  latencyMs?: { mean: number; std: number };
}

export interface EmojiSignal {
  emoji: string;
  categories: readonly string[];
  weight: number;
}

export interface TextSignals {
  emoji: readonly EmojiSignal[];
  tokens: number;
  questions: number;
  exclamations: number;
  ellipses: number;
  uppercaseRatio: number;
  repeatedPunctuation: number;
  repeatedCharacters: number;
  interrogative: number;
  negation: number;
  comparison: number;
  uncertainty: number;
  acceptance: number;
  resistance: number;
  urgency: number;
  validationSeeking: number;
  positiveAffect: number;
  negativeAffect: number;
  engagement: number;
  semanticTags: readonly string[];
}

export interface ProsodySignals {
  arousal: number;
  deliberation: number;
  urgency: number;
  hesitation: number;
  intensity: number;
  latencyNormalized: number;
  confidence: number;
  evidence: readonly string[];
}

export interface BehavioralSignalVector {
  valence: number; // [-1, 1]
  arousal: number;
  uncertainty: number;
  engagement: number;
  resistance: number;
  urgency: number;
  deliberation: number;
  acceptance: number;
  validationSeeking: number;
  negation: number;
  comparison: number;
  confidence: number;
  tags: readonly string[];
}

export interface AnalyzedObservation {
  observation: InteractionObservation;
  text: TextSignals | undefined;
  prosody: ProsodySignals | undefined;
  vector: BehavioralSignalVector;
}

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const clamp11 = (value: number): number => Math.max(-1, Math.min(1, value));
