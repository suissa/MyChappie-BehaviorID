# MyChappie BehaviorID

TypeScript implementation of the BehaviorID cognitive-behavioral transition model, longitudinal situational pattern memory, trajectory prediction, and governed Next Best Action (NBA) selection for ChappieAgent.

## Core model

```text
BehaviorID_t = [b_(t-1)] - [tau_t] - [b_t]
```

The local BehaviorID is combined with longitudinal person-specific patterns:

```text
IF situation phi
AND current BehaviorID g
THEN likely behavior psi
EXCEPT when R
```

The runtime keeps two independent quantities:

- `kappa`: cognitive/emotional transition cost.
- `theta`: learned situational likelihood/confidence.

`kappa` is never interpreted as `1 - theta`.

## Runtime loop

```text
message
  -> BehaviorID extraction
  -> situational pattern activation
  -> trajectory prediction
  -> governed NBA policy
  -> ChappieAgent action
  -> observed outcome
  -> evidence / counter-evidence update
```

## Current implementation

- canonical TypeScript domain model;
- immutable provenance references;
- `IF / THEN / EXCEPT` situational pattern representation;
- evidence and counter-evidence confidence update;
- contextual pattern activation;
- top-k next-trajectory prediction;
- independent `theta` and `kappa` handling;
- transition-prior fallback;
- governed NBA action selection;
- low-confidence clarification fallback;
- hard veto example preventing anxiety/FOMO exploitation;
- deterministic Node test suite;
- GitHub Actions CI.

See [`docs/FORMAL_MODEL.md`](docs/FORMAL_MODEL.md) for the normative model.

## Development

```bash
npm install
npm run check
npm test
```

Requires Node.js 24+.
