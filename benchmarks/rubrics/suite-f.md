# Suite F rubric — compound navigation tasks

## Goal
Measure whether `pi-lsp` becomes more valuable once task requires multiple navigation actions in one run.

These prompts are meant to amortize `pi-lsp` tool-surface overhead across a short evidence chain:
- locate entry point
- zoom to exact symbol/function
- follow next hop or impact site

## Quality score (0-2)
- 0 = wrong path, unordered guesses, or unrelated files
- 1 = partly right chain but missing key hop or weak ordering
- 2 = correct ordered chain with actionable next step / breakpoint / staged plan

## What strong answer looks like
- names concrete files and functions, not only package names
- keeps chain ordered by likely execution flow
- distinguishes repo-level context from symbol-level navigation when relevant
- identifies fallback boundary or next-hop boundary when prompt asks for it
- gives short reasons for each hop

## Efficiency signals to note
- treatment should earn credit when it uses `pi_lsp_*` after an initial repo-level narrowing step, not when it sprays broad file reads
- broad monorepo touring without narrowing is regression
- repeated whole-file reads before naming concrete symbols/functions is regression

## Prompt-specific anchors

### F-01
Strong answer must **not** be solvable from the provided fileArgs alone.

Required grounding pattern:
1. start from `pi-lsp/src/tools.ts` or another real tool/command entry already in fileArgs
2. connect to `pi-lsp/src/symbols.ts:getSymbolSlice(...)`
3. add at least one **newly discovered** backend file outside fileArgs, typically `pi-lsp/src/symbol-backends.ts` with `findLspCandidates(...)` and/or `findAstCandidates(...)`
4. add at least one **newly discovered** selection or slicing file outside fileArgs, typically `pi-lsp/src/symbol-selection.ts:selectBestResult(...)` or `pi-lsp/src/slices.ts:sliceSymbolFromFile(...)`
5. explicitly note where exact lookup falls back
6. answers that stay inside fileArgs only should score at most `1` even if the prose sounds plausible
7. treatment win is most meaningful when it narrows first, then uses `pi_lsp_get_symbol` or `pi_lsp_find_definition` to jump to the missing backend/selection hop instead of broad repo touring

### F-02
Strong answer should connect most of this chain in order:
1. `pi-codesight/src/tools.ts` public tool registration/wiring
2. `pi-codesight/src/queries.ts:readRoutes(...)`
3. route filtering inside `readRoutes(...)`
4. `pi-codesight/src/format.ts` only if output shaping matters
5. best first breakpoint near `readRoutes(...)` line range that filters section lines

### F-03
Strong answer should show staged order, not flat list, and must go beyond the provided fileArgs.
1. repo-level narrowing should anchor in current route surface evidence from provided files such as `pi-codesight/src/tools.ts:registerCodesightTools` or the `codesight_get_routes` tool entry
2. exact implementation must be newly located outside fileArgs and should connect the public route tool wrapper in `pi-codesight/src/tools.ts` to `pi-codesight/src/queries.ts:readRoutes(...)` with a concrete call edge
3. impact/reference check should include grounded callers/tests of that exact implementation, with at least one source-backed site outside fileArgs, preferably `pi-codesight/test/queries.test.ts` or `pi-codesight/src/index.ts`
4. planning docs / review notes may support prioritization but do not count as primary grounding for stages 1-3
5. fileArgs-only staged plans should score at most `1`
6. treatment win is strongest when it uses repo-level evidence first, then `pi_lsp_find_definition` or `pi_lsp_find_references` only after the route tool/function names are grounded

## Expected outcome pattern
- strongest win condition: treatment keeps later steps narrow after initial context step
- weak treatment: calls `pi_lsp_*` too early with no narrowing context
- weak baseline: broad reads across unrelated files before locating exact implementation
- weak treatment: uses planning docs or review notes instead of tracing source/tool entry and callers
- strong answer explicitly says `insufficient evidence` when additional callers are not visible in current source

## Ungrounded-answer rule
- if answer invents files/functions not present in current repo slice, score `0`
- if answer stays generic without exact repo paths or concrete function names, score at most `1`
- if prompt explicitly requests grounded evidence and answer gives architecture guesses instead, score `0`

> For live automation, prefer scoring `0` for phrases like `likely`, `probably`, or invented entry points when no concrete repo anchor follows.
