# Suite B rubric — definition/reference tasks

## Goal
Measure whether treatment improves symbol navigation and usage tracing.

## Quality score (0-2)
- 0 = wrong, missing, or definition/references confused
- 1 = partial or weak candidate list
- 2 = correct definition/references with useful grouping

## What strong answer looks like
- correct symbol target
- references grouped by file when multiple
- clear distinction between definition and usage
- ambiguity handled honestly
- reads only the definition or reference set needed for the prompt instead of broad surrounding files

For prompts that effectively ask for one definition first:
- score **2** when the answer lands on the exact definition and keeps the code/context tight
- score **1** when the answer finds the right area but behaves like broad search output, includes excess unrelated lines, or weakly separates definition from usage
- score **0** when definition and references are confused, wrong, or unsupported

## Penalties
Note regressions when answer:
- claims certainty on ambiguous symbol
- mixes definition with references
- returns broad grep-like noise
- over-reads large file regions when a precise definition/reference result was available
