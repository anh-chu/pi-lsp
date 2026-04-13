# pi-lsp

Pi extension for exact symbol navigation.

`pi-lsp` helps Pi move from broad repo exploration to precise code-level jumps. It works best once symbol names, caller files, or call edges are already grounded.

## What it does

`pi-lsp` adds four navigation tools:
- `pi_lsp_get_symbol` — read one exact symbol definition with minimal surrounding code
- `pi_lsp_find_definition` — resolve exact owning file and location for known symbol
- `pi_lsp_find_references` — group caller/use-site hits for known symbol
- `pi_lsp_rank_context` — rank already-seen session context after evidence exists

Practical split:
- `codesight_*` = repo discovery and orientation
- `pi_lsp_*` = exact symbol follow-up and code navigation

## When to use it

Good fit:
- exact symbol body reads
- definition jumps
- reference tracing
- compound follow-up after repo discovery

Weak fit today:
- first-step repo discovery
- some debug prompts that stay repo-level
- fresh-session ranking before any source evidence exists

## Current status

Implemented:
- `pi_lsp_get_symbol`
- `pi_lsp_find_definition`
- `pi_lsp_find_references`
- `pi_lsp_rank_context`
- slash commands `/symbol`, `/refs`, `/rank`
- test coverage in `test/tools.test.ts` and related suites

## Benchmark snapshot

Milestone run: `gpt-5.4-mini`, fresh-session baseline vs treatment, 2026-04-13.

Setup:
- baseline loaded `pi-codesight` only
- treatment loaded `pi-codesight` + `pi-lsp`
- artifact files: `benchmarks/results/live-benchmark-milestone-gpt54mini-postedits-2026-04-13.jsonl` and matching `-summary.md`

Headline numbers:
- direct `pi_lsp_*` adoption: `8/11` prompts
- clean control: `E-01` used no unnecessary `pi_lsp_*` tools
- strongest results: exact symbol/reference tasks
- weaker results: ranking/debug rows and some compound rows

| prompt | suite | `pi_lsp_*` used | quality | tool calls | duration ms | input tokens | observation |
|---|---|---|---|---:|---:|---:|---|
| A-01 | symbol | yes | 2→2 | 6→2 | 22362→16601 | 12443→5551 | clear win |
| A-02 | symbol | yes | 1→1 | 3→4 | 15353→10402 | 4216→9338 | mixed |
| A-03 | symbol | yes | 1→1 | 4→3 | 25143→20458 | 7453→6189 | efficiency win |
| B-01 | refs | yes | 2→2 | 9→7 | 16436→16828 | 8188→13694 | mixed |
| B-02 | refs | yes | 1→1 | 10→6 | 20109→14861 | 24386→9611 | strong efficiency win |
| B-03 | refs | yes | 1→1 | 11→4 | 31952→21051 | 11179→6505 | strong efficiency win |
| C-01 | ranking | yes | 2→2 | 18→27 | 48311→68373 | 14018→22610 | adopted but regressed |
| D-02 | debug | no | 2→2 | 26→32 | 81344→97444 | 39234→42638 | bypassed `pi_lsp_*` |
| E-01 | control | no | 2→2 | 0→0 | 13234→3762 | 2185→5018 | clean control |
| F-02 | compound | no | 2→2 | 25→21 | 37904→36790 | 18174→16842 | bypassed `pi_lsp_*` |
| F-03 | compound | yes | 2→2 | 8→5 | 35406→33293 | 18109→15373 | efficiency win |

What table says:
- best value appears after symbol or caller grounding already exists
- `pi-lsp` often cuts tool churn and token use on symbol/reference tasks
- current data does not show universal latency wins
- current data does not show universal gains across all prompt shapes

## Safe public claim

On stronger models, `pi-lsp` often reduces tool churn and token use on symbol/reference navigation tasks while preserving answer quality.

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