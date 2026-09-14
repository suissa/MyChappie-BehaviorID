# Persistence schemas

The public persistence boundary is a `versioned-record` envelope. Its `kind`
selects the domain payload schema. Version 1 currently publishes strict schemas
for `SituationalBehaviorPattern` and `TrajectoryCandidate`; runtime validation
uses the matching validators in `src/persistence.ts`.

`theta` and `kappa` remain separate required properties. Neither is derived
from, aliased to, or serialized over the other.
