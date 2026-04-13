# pi-lsp

Thin Pi extension for symbol-level code navigation.

## What this is

`pi-lsp` adds runtime precision on top of Pi's existing tooling.

It helps Pi do these well:
- read exact symbol definitions
- find where symbol is defined
- find where symbol is used
- rank best next files or symbols for current task

It is meant to complement repo-context tools like codesight.

- codesight = repo-level context
- pi-lsp = symbol-level navigation

## What this is not

- not full repo-map system
- not SoulForge replica
- not custom parser/index platform
- not refactor engine in v1

## Planned v1 tools

- `pi_lsp_get_symbol`
- `pi_lsp_find_definition`
- `pi_lsp_find_references`
- `pi_lsp_rank_context`

## Planned v1 commands

- `/symbol <name> [fileHint]`
- `/refs <name> [fileHint]`
- `/rank [task text]`

## Why build this

LLMs often over-read code.

Example bad flow:
- read whole file
- search around manually
- read neighboring files
- waste tokens on irrelevant code

Desired flow:
- find symbol
- read only definition body or small slice
- inspect references if needed
- rank next likely files from current task context

## Design principles

1. Orchestrate first, reinvent last
2. Use existing Pi tools before custom infra
3. Prefer exact code slice over whole-file read
4. Be honest about ambiguity and fallback
5. Keep ranking deterministic
6. Keep cache lightweight

## Backends

Planned backend order:

1. `lsp_navigation`
2. `ast_grep_search`
3. explicit failure with guidance

`pi-lsp` should mostly shape and combine results from these tools.

## Repository docs

Implementation plan:
- `./plan.md`

Review template:
- `./review.md`

## References

Pi extension docs:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`

Pi extension examples:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/dynamic-tools.ts`
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/tools.ts`

Reference repo for prior art:
- `/home/sil/pi-extensions/pi-lens`

## Intended implementation shape

```text
pi-lsp/
  plan.md
  review.md
  README.md
  src/
    index.ts
    tools.ts
    commands.ts
    state.ts
    cache.ts
    ranking.ts
    symbols.ts
    slices.ts
    format.ts
    types.ts
  test/
    helpers.ts
    tools.test.ts
    ranking.test.ts
    cache.test.ts
```

## Suggested first milestone

Build only:
- `pi_lsp_get_symbol`
- `/symbol`
- minimal cache
- tests for exact symbol slicing

Why:
- fastest path to visible value
- lowest complexity
- good base for definition/reference tools later

## Status

Implemented v1 baseline:
- `pi_lsp_get_symbol` works
- `pi_lsp_find_definition` works
- `pi_lsp_find_references` works
- `pi_lsp_rank_context` works

## Benchmark scoring note

When judging treatment runs, use current `src/` behavior and tests as the source of truth, not historical scaffold notes in `plan.md`.

For treatment scoring, verify both:
- the session actually used `pi_lsp_*` tools when the task called for exact navigation
- the answer matches current tool behavior, including exact symbol lookup, definition lookup, reference grouping, backend/confidence/fallback reporting, ambiguity/failure handling, and next-step guidance metadata/text

Practical checks:
- confirm the runtime tool surface included `pi_lsp_get_symbol`, `pi_lsp_find_definition`, `pi_lsp_find_references`, and `pi_lsp_rank_context`
- prefer evidence from tool traces or transcript tool-call logs over narrative claims
- score against actual outputs produced by `src/tools.ts` and `src/symbols.ts`
- use tests in `test/tools.test.ts` to validate expected behavior and wording instead of relying on stale scaffold claims
- do not downgrade treatment quality based solely on `plan.md` statements like “not implemented yet” or “placeholder” when current code/tests contradict them
- slash commands `/symbol`, `/refs`, `/rank` registered
- tests pass
- known gaps: runtime Pi integration should be verified against live built-in tool payloads; fallback reference output still could improve grouping/confidence signaling

## Tool usage guidance

Use `codesight_*` first when the task is still repo-level or discovery-oriented, for example:
- narrowing to a package/subsystem
- identifying route/schema/env/hot-file surfaces
- finding likely files before exact symbol names are known

Use `pi_lsp_*` after names are grounded from current source, for example:
- reading one exact symbol body
- locating the exact definition for a known symbol
- checking callers/references for a known symbol

Practical rule:
- `codesight_*` first for repo/path discovery
- `pi_lsp_*` second for exact symbol/caller follow-up

Fresh-session behavior for `pi_lsp_rank_context`:
- when session evidence counts are all zero, the tool returns a warning state with no ranked items
- the current query is shown as metadata only and is not echoed back as a ranked candidate
- tool details include `freshSession: true` and `shouldRerunAfterEvidence: true` so callers can defer or down-rank the result
- safest next step is to read source or use `codesight_*`, then rerun ranking only if prioritization is still needed

## Failure-message guidance

`pi_lsp_get_symbol` should fail honestly when the requested name does not match current source exactly.
Avoid vague misses that invite repeated guessed-name retries.
Current failure guidance now points the model to:
- verify the exact exported symbol name first
- use `codesight_*` for repo-level discovery when the symbol/path is not yet grounded
- retry `pi_lsp_get_symbol` only after the symbol name or file hint is precise

## Definition/reference follow-up cues

`pi_lsp_find_definition` and `pi_lsp_find_references` now try to make the next safe step obvious once a symbol is grounded.

They explicitly return:
- concise status text in `content`
- backend/confidence/fallback details for trust calibration
- concise jump metadata in `details.owningFile`, `details.nextBestTool`, `details.nextBestReason`, and `details.nextBestArgs`
- legacy-compatible `details.suggestedNext*` aliases with the same values
- `details.suggestedNextSteps` for recovery when the result is ambiguous, empty, or needs a body read next

Practical intent:
- prefer `pi_lsp_find_definition` over plain read when you need the owning file/line first
- prefer `pi_lsp_find_references` over plain read when you need grouped caller/use-site evidence first
- use `pi_lsp_get_symbol` next when definition/reference output has already grounded the relevant file or symbol

`pi_lsp_find_references` now also prioritizes compound-task follow-up more aggressively without changing lookup scope or backend semantics.

Extra actionable fields now include:
- `details.bestNextCallerFile` and `details.bestNextCallerReason` to identify the strongest immediate caller/use-site file
- `details.bestNextReadArgs` to suggest a minimal targeted read starting line for that caller file
- `details.topImpactFiles` with the top grouped files ranked by hit count, non-test preference, and stronger preview context
- stronger text output ordering so the best caller file, top likely impact files, and top preview lines appear before the rest of the grouped file list

Practical intent:
- start with the first caller file for compound edits, bug traces, or impact analysis
- use the top preview line as the default first jump inside that file
- keep remaining impact files as secondary follow-up sites rather than scanning the whole grouped list first