# Multimodal BehaviorID Extractor

The extractor deliberately separates **observation** from **behavioral inference**. Raw textual/acoustic evidence is preserved first; behavioral labels are inferred only after feature fusion.

## Pipeline

```text
WhatsApp text / audio
        ↓
observable feature extraction
        ↓
text signals + emoji signals + prosody signals
        ↓
BehavioralSignalVector
        ↓
state scoring with uncertainty
        ↓
minimal 3-observation window
        ↓
BehaviorID = [previous] - [CogTransition] - [current]
        ↓
longitudinal SituationalBehaviorPattern induction
```

The goal is not to infer a fixed personality from one message. The goal is to preserve enough observable evidence to discover increasingly specific recurring patterns later.

## Text and syntactic-semantic signals

`src/text-analysis.ts` currently extracts:

- emoji occurrences and behavioral categories;
- questions and interrogative structure;
- exclamation/ellipsis/repeated punctuation;
- uppercase ratio;
- repeated characters;
- negation;
- comparison/evaluation markers;
- uncertainty markers;
- acceptance markers;
- resistance markers;
- urgency markers;
- validation-seeking markers;
- positive/negative affect cues;
- text length / engagement proxy.

Emoji are first-class signals, not discarded decoration. Examples include uncertainty (`🤔`), anxiety (`😰`), resistance (`🙄`, `🤨`), acceptance (`✅`, `👍`) and urgency/high arousal (`⚡`, `🔥`). These mappings are hypotheses/features and must remain replaceable by learned models.

## Audio and prosodic signals

`src/audio-features.ts` provides a dependency-free baseline over decoded mono PCM samples and extracts observable measurements:

- duration;
- speech duration;
- RMS energy (dB);
- pause ratio;
- autocorrelation pitch estimate (mean F0);
- F0 variability;
- jitter proxy;
- shimmer proxy;
- word count from transcript;
- speaking rate when transcript is available.

`src/prosody.ts` then converts these measurements, preferably relative to a **per-user baseline**, into weak signals for:

- arousal;
- deliberation;
- urgency;
- hesitation;
- intensity;
- normalized response latency.

Prosody is evidence, not ground truth. Latency and voice characteristics are noisy and must not be treated as deterministic psychological diagnoses.

## Feature fusion

`src/analysis.ts` combines textual and prosodic evidence into `BehavioralSignalVector`:

```text
valence
arousal
uncertainty
engagement
resistance
urgency
deliberation
acceptance
validationSeeking
negation
comparison
confidence
tags[]
```

The vector is intentionally richer than the final BehaviorState. This preserves information that can later be used to induce sub-patterns such as:

```text
COM + high deliberation + 🤨 + slow speech
```

versus:

```text
COM + high arousal + fast speech + ⚡
```

Both may initially classify as `COM`, while longitudinal learning can discover that they predict different trajectories for the same person.

## Minimal three-observation window

The heuristic extractor requires the latest three observations, typically:

```text
user(t-1) → agent intervention → user(t)
```

It produces:

```text
BehaviorID_t = [b_(t-1)] - [tau_t] - [b_t]
```

and preserves all three observation IDs in provenance.

## Uncertainty

The extractor may return no BehaviorID when evidence is insufficient. This is preferred to manufacturing a confident behavioral label.

## Extension points

The current heuristic implementation is only the deterministic baseline. The interfaces are intended to support replacement or ensemble modules for:

- ASR;
- language identification;
- transformer syntactic/semantic classifiers;
- learned emoji embeddings;
- emotion/affect classifiers;
- speaker-normalized prosody models;
- diarization;
- acoustic event detection;
- learned BehaviorState classifier;
- learned CogTransition classifier.

The invariant is that learned modules should emit observable scores + provenance, while `BehaviorID` remains the structured transition object consumed by prediction and Next Best Action.
