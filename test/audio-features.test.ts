import test from "node:test";
import assert from "node:assert/strict";
import { extractPcmAudioFeatures } from "../src/index.js";

function sine(sampleRate: number, frequency: number, seconds: number, amplitude = 0.3): Float32Array {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

test("extractPcmAudioFeatures estimates pitch and energy from voiced PCM", () => {
  const sampleRate = 16_000;
  const samples = sine(sampleRate, 180, 1);
  const result = extractPcmAudioFeatures({
    samples,
    sampleRate,
    transcript: "quero saber mais agora",
    transcriptConfidence: 0.97
  });

  assert.ok(result.durationMs > 990 && result.durationMs < 1_010);
  assert.ok(result.meanF0Hz !== undefined);
  assert.ok(Math.abs(result.meanF0Hz - 180) < 15);
  assert.ok(result.rmsDb !== undefined && result.rmsDb < 0);
  assert.ok(result.speakingRateWpm !== undefined && result.speakingRateWpm > 0);
});

test("extractPcmAudioFeatures detects pauses in mixed silence and voice", () => {
  const sampleRate = 16_000;
  const voiced = sine(sampleRate, 160, 0.5);
  const silence = new Float32Array(Math.floor(sampleRate * 0.5));
  const samples = new Float32Array(voiced.length + silence.length);
  samples.set(voiced, 0);
  samples.set(silence, voiced.length);

  const result = extractPcmAudioFeatures({ samples, sampleRate });
  assert.ok(result.pauseRatio !== undefined);
  assert.ok(result.pauseRatio > 0.25);
});
