import type { AudioObservation } from "./signals.js";

export interface PcmAudioInput {
  samples: Float32Array | readonly number[];
  sampleRate: number;
  transcript?: string;
  transcriptConfidence?: number;
  minPitchHz?: number;
  maxPitchHz?: number;
}

const mean = (values: readonly number[]): number => values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
const std = (values: readonly number[], center = mean(values)): number => {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length);
};

function rms(frame: readonly number[]): number {
  if (frame.length === 0) return 0;
  return Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length);
}

function estimatePitchAutocorrelation(
  frame: readonly number[],
  sampleRate: number,
  minPitchHz: number,
  maxPitchHz: number
): number | undefined {
  const frameRms = rms(frame);
  if (frameRms < 0.008) return undefined;

  const minLag = Math.max(1, Math.floor(sampleRate / maxPitchHz));
  const maxLag = Math.min(frame.length - 2, Math.ceil(sampleRate / minPitchHz));
  let bestLag = 0;
  let bestCorrelation = -Infinity;
  let zeroCorrelation = 0;

  for (let i = 0; i < frame.length; i += 1) zeroCorrelation += frame[i]! * frame[i]!;
  if (zeroCorrelation <= 0) return undefined;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let i = 0; i + lag < frame.length; i += 1) {
      correlation += frame[i]! * frame[i + lag]!;
    }
    const normalized = correlation / zeroCorrelation;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorrelation < 0.25) return undefined;
  return sampleRate / bestLag;
}

/**
 * Dependency-free DSP baseline for decoded mono PCM in [-1, 1].
 * It intentionally exposes observable acoustic measurements rather than inferring
 * psychological labels. Domain inference happens later in the prosody analyzer.
 */
export function extractPcmAudioFeatures(input: PcmAudioInput): AudioObservation {
  if (!Number.isFinite(input.sampleRate) || input.sampleRate <= 0) {
    throw new RangeError("sampleRate must be positive");
  }
  if (input.samples.length === 0) throw new Error("audio samples cannot be empty");

  const samples = Array.from(input.samples, (sample) => Math.max(-1, Math.min(1, Number(sample))));
  const durationMs = (samples.length / input.sampleRate) * 1000;
  const frameSize = Math.max(32, Math.round(input.sampleRate * 0.025));
  const hopSize = Math.max(16, Math.round(input.sampleRate * 0.010));
  const frameRms: number[] = [];
  const pitches: number[] = [];
  const minPitchHz = input.minPitchHz ?? 70;
  const maxPitchHz = input.maxPitchHz ?? 400;

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.slice(start, start + frameSize);
    const energy = rms(frame);
    frameRms.push(energy);
    const pitch = estimatePitchAutocorrelation(frame, input.sampleRate, minPitchHz, maxPitchHz);
    if (pitch !== undefined) pitches.push(pitch);
  }

  const globalRms = rms(samples);
  const rmsDb = 20 * Math.log10(Math.max(globalRms, 1e-9));
  const sortedRms = [...frameRms].sort((a, b) => a - b);
  const medianRms = sortedRms[Math.floor(sortedRms.length / 2)] ?? globalRms;
  const speechThreshold = Math.max(0.008, medianRms * 0.55);
  const speechFrames = frameRms.filter((value) => value >= speechThreshold).length;
  const pauseRatio = frameRms.length === 0 ? 0 : 1 - speechFrames / frameRms.length;
  const speechDurationMs = Math.min(durationMs, speechFrames * (hopSize / input.sampleRate) * 1000);

  const meanF0Hz = mean(pitches);
  const f0StdHz = std(pitches, meanF0Hz);
  const pitchDiffs = pitches.slice(1).map((value, index) => Math.abs(value - pitches[index]!));
  const jitter = meanF0Hz > 0 ? mean(pitchDiffs) / meanF0Hz : 0;

  const voicedEnergies = frameRms.filter((value) => value >= speechThreshold);
  const meanEnergy = mean(voicedEnergies);
  const shimmer = meanEnergy > 0 ? std(voicedEnergies, meanEnergy) / meanEnergy : 0;

  const words = input.transcript?.trim().match(/[\p{L}\p{N}_'-]+/gu) ?? [];
  const wordCount = words.length;
  const speakingRateWpm = wordCount > 0 && speechDurationMs > 0
    ? wordCount / (speechDurationMs / 60_000)
    : undefined;

  const output: AudioObservation = {
    durationMs,
    speechDurationMs,
    wordCount,
    rmsDb,
    pauseRatio,
    jitter,
    shimmer
  };

  if (pitches.length > 0) {
    output.meanF0Hz = meanF0Hz;
    output.f0StdHz = f0StdHz;
  }
  if (speakingRateWpm !== undefined) output.speakingRateWpm = speakingRateWpm;
  if (input.transcriptConfidence !== undefined) output.transcriptConfidence = input.transcriptConfidence;
  return output;
}
