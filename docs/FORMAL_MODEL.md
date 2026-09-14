# Formal Model

## 1. Local behavioral representation

For interaction turn `t`:

```text
g_t = [b_(t-1)] - [tau_t] - [b_t]
```

`g_t` is the BehaviorID. It is a transition-centered, action-relevant representation, not a personality label.

- `b_(t-1)`: previous temporary BehaviorState.
- `tau_t`: CogTransition carrying cognitive/behavioral payload.
- `b_t`: current temporary BehaviorState.

A person is not a BehaviorState. A person is observed in a state relative to a topic, task, interlocutor and situation.

## 2. Situational longitudinal pattern

Repeated BehaviorIDs induce person-specific rules:

```text
IF situation phi
AND current BehaviorID g
THEN likely behavior psi
EXCEPT when R
```

Canonical tuple:

```text
p_k = (phi_k, g_k, psi_k, R_k, E_k, Ebar_k, theta_k)
```

where `E` is supporting evidence, `Ebar` is counter-evidence and `theta` is learned confidence.

Initial estimator:

```text
theta_k = |E_k| / (|E_k| + |Ebar_k|)
```

The estimator is replaceable; evidence and counter-evidence provenance are not.

## 3. Prediction target

```text
P(g_(t+1) | g_t, s_t, u)
```

where `s_t` is situational context and `u` is the subject identity. Same-user patterns are distinct from cohort/global priors.

## 4. Cost is not probability

BehaviorID transition cost remains:

```text
kappa(i -> j) in [0,1]
```

`kappa` denotes cognitive/emotional effort or friction. `theta` denotes empirical situational likelihood/confidence.

Invariant:

```text
kappa(i -> j) != 1 - P(j | i, situation, user)
```

The implementation must never collapse these values implicitly.

## 5. Runtime loop

```text
message
  -> BehaviorID extraction
  -> situation assembly
  -> situational pattern activation
  -> candidate trajectory prediction
  -> governed NBA policy
  -> action intent
  -> language/action realization
  -> observed outcome
  -> evidence/counter-evidence update
```

## 6. Next Best Action

```text
a_t = pi(g_t, s_t, A_t, C_t, O_t)
```

- `g_t`: current BehaviorID.
- `s_t`: situational context.
- `A_t`: active situational patterns.
- `C_t`: trajectory candidates containing independent `theta` and `kappa`.
- `O_t`: explicit objective plus policy constraints.

The policy selects an action intent. An LLM may realize that intent in natural language, but must not fabricate BehaviorIDs, evidence, probabilities or transition costs.

## 7. Explainability contract

Every NBADecision must make it possible to reconstruct:

1. current BehaviorID;
2. activated patterns;
3. supporting and contradicting evidence;
4. candidate future trajectories;
5. each candidate's `theta` and `kappa`;
6. policy constraints and vetoes;
7. selected action and rationale.

## 8. Research hypotheses

- **H6:** BehaviorID + SituationalPatterns outperforms BehaviorID alone for next-trajectory prediction and/or NBA quality.
- **H7:** same-user patterns outperform substituted other-user patterns for prediction of that user's trajectory.
- **H8:** BehaviorID + SituationalPatterns outperforms or matches full-history context at lower context cost.
- **H9:** collapsing `kappa` and `theta` into one score degrades calibration, control or interpretability relative to an explicit policy layer.

## 9. Current implementation scope

The first TypeScript core implements canonical types, exact situational activation, evidence-based confidence, top-k trajectory prediction with transition-prior fallback, governed NBA selection, and an anti-exploitation veto for anxiety/urgency pressure. Pattern discovery, learned extraction, persistence, calibration and ChappieAgent transport integration remain follow-up work.
