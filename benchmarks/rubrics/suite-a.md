# Suite A rubric — symbol tasks

## Goal
Measure whether treatment returns exact, useful symbol slices with less exploration.

## Quality score (0-2)
- 0 = wrong file/symbol or unusable answer
- 1 = right area but broad/imprecise
- 2 = exact symbol with useful slice and explanation

## Precision score (0-2)
- 0 = wrong target or mostly noisy context
- 1 = correct target but padded, over-read, or weakly anchored
- 2 = exact symbol slice with minimal surrounding code and explicit source anchors

## Precision notes
Award full score when answer:
- identifies exact symbol location
- shows only the requested definition or the smallest useful slice around it
- explains what it registers/does without drifting into neighboring helpers
- avoids unnecessary broad file reading
- uses benchmark-grounded anchors such as `pi-lsp/src/tools.ts:60-151`

For prompts like "Show `registerPiLspTools` implementation and explain what it registers":
- canonical symbol slice: `pi-lsp/src/tools.ts:60-151`
- signature anchor: `pi-lsp/src/tools.ts:60`
- expected registered tools:
  - `pi_lsp_get_symbol` at `pi-lsp/src/tools.ts:61-84`
  - `pi_lsp_find_definition` at `pi-lsp/src/tools.ts:86-107`
  - `pi_lsp_find_references` at `pi-lsp/src/tools.ts:109-130`
  - `pi_lsp_rank_context` at `pi-lsp/src/tools.ts:132-150`
- helpful wiring corroboration:
  - `pi-lsp/src/index.ts:2` imports `registerPiLspTools`
  - `pi-lsp/src/index.ts:5` calls `registerPiLspTools(pi)`

Score `quality_score = 2` when the response:
- returns the function body or a tight slice around it
- correctly names all four registered tools
- briefly explains each tool purpose:
  - exact symbol slice retrieval
  - definition lookup
  - reference lookup
  - ranking likely next files/symbols

Score `quality_score = 1` when the response:
- finds the right function but gives a padded whole-file dump
- summarizes correctly but omits some concrete registrations
- mixes in unrelated helper implementation above the function

Score `quality_score = 0` when the response:
- uses the wrong file or wrong symbol
- fails to show the implementation slice
- invents registrations not present in `registerPiLspTools`

Score `precision_score = 2` when the response:
- centers on `registerPiLspTools` itself, not the whole `src/tools.ts`
- includes explicit anchors or line-accurate references
- avoids unnecessary mention of helper functions like cache or invoker setup

Score `precision_score = 1` when the response:
- is correct but broad
- includes large unrelated regions of `src/tools.ts`
- lacks explicit anchors while still clearly targeting the right symbol

Score `precision_score = 0` when the response:
- is unanchored and noisy enough that the scorer cannot verify it against source
- substitutes summary for the requested code slice

## Over-reading guidance
Treat over-reading as a real regression on Suite A because the suite is designed to measure narrower context acquisition.
Examples:
- reading the whole file first when the symbol could be resolved directly
- including adjacent functions/types that were not needed to answer
- replacing the requested code slice with a summary of the file

## Penalties
Subtract confidence in review notes if answer:
- reads whole file without need
- confuses nearby helper with target symbol
- returns summary without actual implementation slice
- includes substantially more context than needed for the requested definition
