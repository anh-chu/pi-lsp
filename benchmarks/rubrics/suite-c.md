# Suite C rubric — ranking tasks

## Goal
Measure whether treatment surfaces the right next files for a concrete task without drifting into broad repo exploration.

## Quality score (0-2)
- 0 = mostly generic, broad, or off-target ranking
- 1 = partly relevant but mixed with broad architectural/helper picks or weak evidence
- 2 = tightly scoped ranking centered on the concrete implementation path with specific evidence per file

## What strong answer looks like
- stays inside the target project subtree requested by the prompt
- prioritizes files in the active execution path over general overview files
- includes one concrete reason tied to current code responsibility for each file
- avoids unrelated sibling packages and avoids broad “read the whole repo” guidance

## Penalties
Note regressions when answer:
- pads the list with README/plan/review or repo-level overview files without prompt justification
- gives generic architecture summaries instead of ranking concrete files
- names plausible files but without evidence tied to current symbol/route flow
- ignores prompt scope limits such as staying in `src` or allowing only one test file
