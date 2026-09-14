import { clamp01, type InteractionObservation, type ProsodyBaseline, type ProsodySignals } from "./signals.js";

const z = (value: number | undefined, baseline: { mean: number; std: number } | undefined): number => {
  if (value === undefined || !baseline || baseline.std <= 0) return 0;
  return (value - baseline.mean) / baseline.std;
};

const positiveZ = (value: number): number => clamp01((value + 1) / 3);
const negativeZ = (value: number): number => clamp01((-value + 1) / 3);

export function analyzeProsody(observation: InteractionObservation, baseline?: ProsodyBaseline): ProsodySignals | undefined {
  const audio = observation.audio;
  if (!audio && observation.latencyMs === undefined) return undefined;

  const evidence: string[] = [];
  const pitchVariability = z(audio?.f0StdHz, baseline?.f0StdHz);
  const loudness = z(audio?.rmsDb, baseline?.rmsDb);
  const rate = z(audio?.speakingRateWpm, baseline?.speakingRateWpm);
  const pause = z(audio?.pauseRatio, baseline?.pauseRatio);
  const latency = z(observation.latencyMs, baseline?.latencyMs);

  let derivedRate = audio?.speakingRateWpm;
  if (derivedRate === undefined && audio?.wordCount !== undefined && audio.speechDurationMs && audio.speechDurationMs > 0) {
    derivedRate = audio.wordCount / (audio.speechDurationMs / 60_000);
    evidence.push("speaking-rate-derived-from-word-count");
  }

  const rawRateSignal = derivedRate === undefined
    ? 0
    : baseline?.speakingRateWpm
      ? positiveZ(z(derivedRate, baseline.speakingRateWpm))
      : clamp01((derivedRate - 90) / 180);

  const arousal = clamp01(
    0.30 * positiveZ(pitchVariability) +
    0.25 * positiveZ(loudness) +
    0.30 * rawRateSignal +
    0.15 * clamp01((audio?.jitter ?? 0) * 8)
  );

  const hesitation = clamp01(
    0.45 * (audio?.pauseRatio !== undefined
      ? baseline?.pauseRatio ? positiveZ(pause) : clamp01(audio.pauseRatio)
      : 0) +
    0.30 * negativeZ(rate) +
    0.25 * (observation.latencyMs !== undefined
      ? baseline?.latencyMs ? positiveZ(latency) : clamp01(observation.latencyMs / 120_000)
      : 0)
  );

  const deliberation = clamp01(
    0.55 * hesitation +
    0.25 * (observation.latencyMs !== undefined
      ? baseline?.latencyMs ? positiveZ(latency) : clamp01(observation.latencyMs / 180_000)
      : 0) +
    0.20 * negativeZ(rate)
  );

  const urgency = clamp01(0.55 * rawRateSignal + 0.30 * arousal + 0.15 * negativeZ(latency));
  const intensity = clamp01(0.45 * arousal + 0.30 * positiveZ(loudness) + 0.25 * positiveZ(pitchVariability));

  if (audio?.meanF0Hz !== undefined) evidence.push("mean-f0");
  if (audio?.f0StdHz !== undefined) evidence.push("pitch-variability");
  if (audio?.rmsDb !== undefined) evidence.push("rms-energy");
  if (audio?.pauseRatio !== undefined) evidence.push("pause-ratio");
  if (derivedRate !== undefined) evidence.push("speaking-rate");
  if (observation.latencyMs !== undefined) evidence.push("response-latency");

  const confidenceInputs = [
    audio?.f0StdHz,
    audio?.rmsDb,
    derivedRate,
    audio?.pauseRatio,
    observation.latencyMs
  ].filter((v) => v !== undefined).length;

  const asrConfidence = audio?.transcriptConfidence ?? 1;

  return {
    arousal,
    deliberation,
    urgency,
    hesitation,
    intensity,
    latencyNormalized: observation.latencyMs === undefined
      ? 0
      : baseline?.latencyMs ? positiveZ(latency) : clamp01(observation.latencyMs / 180_000),
    confidence: clamp01((confidenceInputs / 5) * asrConfidence),
    evidence
  };
}
