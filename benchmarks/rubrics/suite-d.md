# Suite D rubric — mixed debugging tasks

## Goal
Measure whether treatment identifies the real missing pieces in current source, instead of rewarding broad repo summaries or stale-plan narratives.

## Quality score (0-2)
- 0 = wrong diagnosis, stale diagnosis, or mostly generic speculation
- 1 = partly right but mixes current facts with stale assumptions or misses the key distinction
- 2 = correct diagnosis with evidence from current code and a clear separation between repo gaps and external dependencies

## What strong answer looks like
- identifies actual current implementation status before claiming anything is placeholder
- points at the relevant files/functions that prove the diagnosis
- separates current repo behavior from intended future behavior or host-runtime needs
- stays grounded in targeted evidence rather than broad speculation

## Penalties
Note regressions when answer:
- claims placeholder behavior that current source has already replaced
- treats external Pi runtime support as if it were the only missing repo implementation
- cites README/plan/review more heavily than current `src` and tests
- gives a broad project-status summary instead of answering the concrete debug question
