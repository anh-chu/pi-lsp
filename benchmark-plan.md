# pi-lsp benchmark plan

## Purpose

Measure whether `pi-lsp` improves Pi on real code-navigation tasks.

Primary comparison:
- **baseline** = Pi without `pi-lsp`
- **treatment** = Pi with `pi-lsp`

Main outcomes to measure:
1. lower token usage
2. lower dollar cost
3. faster completion time
4. fewer turns/tool calls
5. equal or better answer quality

This file is written as handoff for another agent.
Assume next agent has **no prior context** beyond this repo and files referenced here.

---

## Current benchmark asset status

Benchmark assets already exist in this repo.

### Prompt packs
- `benchmarks/prompts/suite-a-symbol.jsonl`
- `benchmarks/prompts/suite-b-refs.jsonl`
- `benchmarks/prompts/suite-c-ranking.jsonl`
- `benchmarks/prompts/suite-d-debug.jsonl`
- `benchmarks/prompts/suite-e-control.jsonl`

### Rubrics
- `benchmarks/rubrics/suite-a.md`
- `benchmarks/rubrics/suite-b.md`
- `benchmarks/rubrics/suite-c.md`
- `benchmarks/rubrics/suite-d.md`
- `benchmarks/rubrics/suite-e.md`

### Result schema/template
- `benchmarks/results/schema.json`
- `benchmarks/results/results-template.jsonl`

### Bench readme
- `benchmarks/README.md`

Meaning:
- prompt corpus exists
- scoring rubric exists
- result row schema exists
- next agent should **run or automate**, not redesign from scratch unless needed

---

## Core benchmarking principle

Do **not** compare two different workflows at once.

When comparing baseline vs treatment, keep these fixed:
- same repo snapshot
- same model
- same thinking level
- same prompt text
- same tool availability except `pi-lsp`
- same codesight state
- same environment variables
- same working directory per prompt
- same session mode
- same session-history starting point

Only difference should be:
- `pi-lsp` loaded or not loaded

---

## Most important control decision

Keep `codesight` constant across both groups.

Reason:
- isolate value of `pi-lsp`
- avoid confounding repo-context differences

So preferred first benchmark is:
- baseline = Pi + codesight context, **without** `pi-lsp`
- treatment = Pi + codesight context, **with** `pi-lsp`

Optional later matrix:
- Pi only
- Pi + codesight
- Pi + pi-lsp
- Pi + codesight + pi-lsp

But first benchmark should stay simple.

---

## Hypotheses

## H1 — symbol tasks
`pi-lsp` should reduce token usage and wall-clock time on symbol-specific questions.

Examples:
- "show me `runRefresh` implementation"
- "where is `registerCodesightTools` defined?"
- "where is `registerCodesightTools` used?"

Why:
- baseline tends to read whole files or search broadly
- treatment should use exact symbol tools

## H2 — navigation tasks
`pi-lsp` should reduce broad exploration on tasks asking what to inspect next.

Examples:
- "what files should I inspect next for route parsing bug?"
- "what files matter most right now?"

Why:
- treatment has ranking tool and symbol-aware navigation

## H3 — control tasks
`pi-lsp` should not materially hurt performance/cost on tasks where it is not needed.

Examples:
- README summarization
- broad repo summary
- routes/schema questions already answered by codesight

Why:
- extension should not distract model into unnecessary tool use

---

## Metrics

## Primary metrics

### 1. Input tokens
Best proxy for exploration overhead.

### 2. Output tokens
Separates verbosity from navigation savings.

### 3. Cost
Final economic outcome.

### 4. Wall-clock completion time
Start: prompt submitted.
End: final answer delivered.

### 5. Number of assistant turns
Proxy for navigation efficiency.

### 6. Number of tool calls
Should drop for symbol tasks if `pi-lsp` works.

## Secondary metrics

### 7. Distinct files read
Key expected reduction for symbol tasks.

### 8. Total bytes/lines read
Approximate evidence of narrower context acquisition.

### 9. Quality score
Human- or rubric-scored correctness/usefulness.

### 10. Precision score for symbol tasks
0-2 scale:
- 0 = wrong symbol/file or no implementation slice shown
- 1 = right area but broad/imprecise; symbol found with excess surrounding code or summary-heavy answer
- 2 = exact symbol with useful minimal slice

When scoring prompts such as "Read one symbol definition with minimal surrounding code," prefer exactness over comprehensiveness. Extra unrelated code should lower precision even if the target symbol is correct.

### 11. Unnecessary broad-read penalty
Example threshold:
- reading >150 lines before resolving exact symbol = penalty on symbol tasks
- returning whole-file or multi-helper context for a single-definition request = penalty even if answer is otherwise correct

---

## Benchmark suites

Need both benefit-heavy tasks and control tasks.

## Suite A — symbol extraction tasks
Purpose:
- direct value of exact symbol reads

Pack file:
- `benchmarks/prompts/suite-a-symbol.jsonl`

Examples already in pack:
- `registerPiLspTools`
- `getSymbolSlice`
- `registerCodesightTools`

Expected winner:
- treatment strongly better

Key metrics:
- input tokens
- files read
- precision score
- wall-clock
- over-reading notes for any answer that reads beyond the requested symbol slice

## Suite B — definition/reference tasks
Purpose:
- exact navigation value

Pack file:
- `benchmarks/prompts/suite-b-refs.jsonl`

Expected winner:
- treatment better on turns/tool calls/files read

Key metrics:
- turns
- tool calls
- reference quality
- correctness

## Suite C — ranking tasks
Purpose:
- task-aware navigation value in monorepo

Pack file:
- `benchmarks/prompts/suite-c-ranking.jsonl`

Expected winner:
- treatment somewhat better if ranking useful
- gains may be modest

Key metrics:
- quality of ranked suggestions
- exploratory reads before first useful recommendation
- total tokens

## Suite D — mixed debugging tasks
Purpose:
- realistic navigation + explanation workflow

Pack file:
- `benchmarks/prompts/suite-d-debug.jsonl`

Expected winner:
- treatment should help somewhat, but less dramatically than Suite A

Key metrics:
- total tokens
- files read
- correctness
- explanation quality

## Suite F — compound navigation tasks
Purpose:
- short multi-action sessions where tool-surface overhead can amortize across several navigation hops
- test whether repo-level narrowing plus symbol-level zoom produces better overall efficiency than one-shot prompts

Pack file:
- `benchmarks/prompts/suite-f-compound.jsonl`

Expected winner:
- treatment more likely better here than on trivial one-shot prompts
- especially when task requires ordered chain: entry point -> exact symbol -> impact site

Key metrics:
- total tokens across full prompt
- total tool calls across full prompt
- ordered evidence quality
- unnecessary broad-read penalty
- whether treatment uses `pi_lsp_*` after narrowing, not before

## Suite E — control tasks
Purpose:
- detect regression / unnecessary tool distraction

Pack file:
- `benchmarks/prompts/suite-e-control.jsonl`

Expected result:
- baseline and treatment roughly equal
- treatment should not get meaningfully worse

Key metrics:
- cost parity
- no spike in unnecessary tool use

---

## Repositories / task corpus

Use at least 3 contexts.

### Repo 1 — `pi-lsp`
Path:
- `/home/sil/pi-extensions/pi-lsp`

Why:
- primary target project
- controlled symbol/navigation tasks

### Repo 2 — `pi-codesight`
Path:
- `/home/sil/pi-extensions/pi-codesight`

Why:
- related but separate codebase
- cross-project symbol navigation value

### Repo 3 — monorepo root
Path:
- `/home/sil/pi-extensions`

Why:
- stresses ranking in multi-project workspace
- tests whether `pi-lsp` avoids unrelated exploration

---

## Prompt pack structure

Prompt packs already exist under:
- `benchmarks/prompts/`

Each row includes:
- `id`
- `suite`
- `cwd`
- `prompt`
- `scoringNotes`

Example row format:

```json
{"id":"A-01","suite":"symbol","cwd":"/home/sil/pi-extensions/pi-lsp","prompt":"Show `registerPiLspTools` implementation and explain what it registers.","scoringNotes":"Exact function slice preferred over whole-file summary."}
```

---

## Scoring rubrics

Rubrics already exist under:
- `benchmarks/rubrics/`

### Score scale
Use 0-2 unless a prompt needs extra note.

- 0 = wrong / unusable
- 1 = partly correct or broad/imprecise
- 2 = correct and appropriately precise

Use matching rubric file by suite.
For symbol-definition prompts, "appropriately precise" means the answer should show the smallest useful implementation slice, not a defensive whole-file read.

### Important
Do not judge success by cost alone.
Cheaper but wrong = failure.

---

## Run protocol

## Baseline run
- do **not** load `pi-lsp`
- keep codesight context/artifacts identical
- run same prompt pack

## Treatment run
- load `pi-lsp`
- keep everything else the same
- run same prompt pack

## Repetitions
Model behavior varies, so run each prompt multiple times.

Recommended:
- minimum 5 repetitions per prompt
- better 10 if budget allows

Compare medians first, not only means.

---

## Session settings to lock

Lock all of these:
- model name
- provider
- thinking level
- temperature if exposed
- working directory per prompt
- enabled extensions except `pi-lsp`
- same codesight freshness/state
- same environment variables
- same branch / commit
- same session-history starting point

If any of these drift, comparison becomes noisy.

## Session reset checklist for manual pilot

Apply this especially to `C-01`, because ranking quality can change if the session already remembers files or symbols.

For every baseline/treatment pair:
1. Verify repo root, branch, and commit are identical.
2. Verify codesight artifacts are the same files with the same freshness/state in both runs.
3. Choose one control mode and record it in notes:
   - `fresh_session`: launch a brand-new Pi session for baseline and another brand-new Pi session for treatment.
   - `reset_session`: use the same documented reset procedure before each run so session memory is cleared to an equivalent empty state.
4. Do not perform any exploratory file reads, symbol lookups, or ranking calls before the benchmark prompt.
5. Submit the exact same prompt text.
6. Capture the exact Pi `session_path` for that run before leaving the session.
   - preferred value: the absolute Pi session export path from `.pi/suggester/sessions/<session-id>/meta.json` field `sessionFile`
   - example: `/home/sil/.pi/agent/sessions/--home-sil--/2026-04-11T19-37-25-036Z_af6cb40a-f953-41fe-bbcb-273c517dcd6e.jsonl`
   - do not store only a human note like "fresh session"; the parser needs the concrete path containing the session id suffix
7. If either run accidentally gets extra history or extra codesight changes, discard the pair and rerun.

Preferred control mode: `fresh_session`.
Use `reset_session` only if the reset is reproducible and logged.

---

## Data to capture per run

For every run, capture:
- `run_id`
- `condition` (`baseline` or `treatment`)
- `suite`
- `prompt_id`
- `cwd`
- `timestamp`
- `model`
- `thinking_level`
- `input_tokens` if available
- `output_tokens` if available
- `cost` if available
- `duration_ms`
- `turns`
- `tool_calls`
- `tool_call_breakdown`
- `files_read`
- `bytes_read`
- `quality_score`
- `precision_score` where relevant
- `answer_text`
- `session_path`
- `notes`

Schema file:
- `benchmarks/results/schema.json`

Template row:
- `benchmarks/results/results-template.jsonl`

---

## How to measure cost and tokens

Prefer machine-readable extraction if available.

Current status from inspected Pi runtime artifacts available on this machine:
- `.pi/suggester/sessions/*/usage.json` contains machine-readable token and cost totals such as `inputTokens`, `outputTokens`, and `costTotal`.
- `.pi/suggester/sessions/*/meta.json` contains a `sessionFile` path pointing at the underlying Pi session export/log file.
- `.pi/suggester/logs/events.ndjson` also records per-turn usage metadata including token counts and `cost` for some extension-driven interactions.
- Confirmed live examples exist: `/home/sil/.pi/suggester/sessions/af6cb40a-f953-41fe-bbcb-273c517dcd6e/usage.json` reports non-zero `suggestionUsage.inputTokens`, `suggestionUsage.outputTokens`, and `suggestionUsage.costTotal`, and its sibling `meta.json` points at `/home/sil/.pi/agent/sessions/--home-sil--/2026-04-11T19-37-25-036Z_af6cb40a-f953-41fe-bbcb-273c517dcd6e.jsonl`.
- Additional live `pi` CLI runs were executed on 2026-04-12 in `/home/sil/pi-extensions/pi-lsp`; new `.pi/suggester/sessions/<session-id>/meta.json` entries were observed and verified to resolve to `.pi/agent/sessions/..._UUID.jsonl`, confirming the benchmark environment can now capture exact `session_path` values.
- The same session family is also corroborated in `/home/sil/.pi/suggester/logs/events.ndjson`, where turn-level `suggestion.generated` and `suggestion.next_turn.cache_observed` entries expose `inputTokens`, `outputTokens`, and `cost` values.

Implication:
- token/cost extraction is available now from Pi-owned runtime artifacts for some live sessions.
- however, the observed fields are extension-owned and mixed-granularity: `usage.json` is session-aggregate, while `events.ndjson` is per-turn and includes both `suggestion.generated` and `suggestion.next_turn.cache_observed` events with different semantics.
- because benchmark rows must map to exactly one Pi session, record the exact `session_path` for every completed run; this is now the required linkage field for later usage extraction.
- the parser should derive `session_id` from the `_UUID.jsonl` suffix in `session_path`, resolve `.pi/suggester/sessions/<session-id>/meta.json`, and require `meta.json.sessionFile === session_path` before attributing any token/cost data.
- after that verification passes, use `.pi/suggester/sessions/<session-id>/usage.json` as the canonical aggregate source for `input_tokens`, `output_tokens`, and `cost`; the parser prefers `suggestionUsage.{inputTokens,outputTokens,costTotal,calls}` and falls back to same-named root fields only if that nested object is absent.
- consult `.pi/suggester/logs/events.ndjson` only as a secondary audit source for per-turn detail when its event payload can be linked to the same session unambiguously; otherwise do not merge event-level numbers into the benchmark row. The parser now emits an `event_summary` block for audit, but benchmark rows should still be backfilled from `usage.json` only.
- therefore, for older manual pilot rows that still lack recorded `session_path`, keep `input_tokens`, `output_tokens`, and `cost` as `null` rather than guessing.

Potential sources:
- Pi session metadata
- exported session files
- session logs
- provider usage metadata surfaced by Pi

Backfill procedure once `session_path` is recorded:
1. save the benchmark row with the exact `session_path`
2. run `node benchmarks/results/extract-pi-usage-from-row.mjs <results.jsonl> <run_id>`
3. let the script verify that the benchmark row `session_path` matches `.pi/suggester/sessions/<session-id>/meta.json` and that `meta.json.sessionId` agrees with the `_UUID` suffix from `session_path` when present
4. copy the script's aggregate `input_tokens`, `output_tokens`, and `cost` values from `usage.json` into the benchmark row; treat the emitted `event_summary` as audit-only
5. keep the script output or mention verification in `notes` for auditability
6. if the script refuses attribution, leave token/cost fields as `null` and explain why in `notes`

Fallback rule for first pilot pass:
- still capture duration
- turns
- tool calls
- files read
- bytes read
- quality score
- and leave token/cost fields as `null` when no verified extraction is available for that exact run

These are valid proxy metrics for first benchmark pass.

Important:
- do not block benchmark work waiting for perfect cost parser
- do not invent token or dollar estimates from heuristics
- start with reliable proxies, then add token/cost extraction later

---

## Expected patterns

## Likely biggest gains
- Suite A symbol tasks
- Suite B definition/reference tasks

## Likely moderate gains
- Suite C ranking tasks
- Suite D mixed debugging tasks

## Likely little gain
- Suite E control tasks

This is expected.
`pi-lsp` is specialized, not universal.

---

## Regression checks

Must explicitly look for bad outcomes.

### Regression 1 — tool distraction
Treatment may overuse `pi_lsp_*` on simple tasks.

Detect by:
- higher tool calls on control tasks
- higher tokens/cost on Suite E

### Regression 2 — ambiguous symbol confusion
Treatment may confidently choose wrong symbol.

Detect by:
- quality failures on ambiguous-symbol prompts
- bad precision score

### Regression 3 — latency overhead
Treatment may add orchestration overhead with little benefit.

Detect by:
- worse wall-clock on simple tasks

---

## Suggested ambiguous-symbol stress tasks

Add these later if needed:
- "Show `register` implementation."
- "Where is `formatCompactSection` used?"
- "Find `index.ts` entry point symbol."

Reason:
- tests whether `pi-lsp` handles ambiguity honestly

---

## Practical benchmark phases

## Phase 1 — manual pilot
Recommended first.

Use 4 prompts only:
- `A-01`
- `B-01`
- `C-01`
- `E-01`

Run in both conditions:
- baseline
- treatment

Why:
- validates prompt quality
- reveals whether metrics capture works
- catches harness issues before large batch

## Phase 2 — first full batch
Run all prompts currently in prompt packs.

## Phase 3 — automation
Build small driver that:
- launches Pi with/without `pi-lsp`
- submits one prompt
- waits for completion
- captures result/session data
- writes JSONL row

Do not start with giant infra.

---

## Concrete first benchmark batch already defined

Prompt ids to prioritize first:

### Suite A
- `A-01`
- `A-02`
- `A-03`

### Suite B
- `B-01`
- `B-02`
- `B-03`

### Suite C
- `C-01`
- `C-02`

### Suite D
- `D-01`
- `D-02`
- `D-03`

### Suite E
- `E-01`
- `E-02`

These prompt ids already exist in prompt files.

---

## Recommended result table

One row per run.

Suggested fields:

| run_id | condition | suite | prompt_id | cwd | duration_ms | input_tokens | output_tokens | cost | turns | tool_calls | files_read | quality_score |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|

Aggregate by prompt and suite:

| suite | metric | baseline_median | treatment_median | delta | notes |
|---|---|---:|---:|---:|---|

### Pilot comparison summary

Current state on 2026-04-12: the required 8-row pilot matrix exists in `benchmarks/results/manual-pilot-2026-04-12.jsonl`, but all rows are blocked stubs rather than full benchmark executions. A live treatment-side Pi CLI session was exercised successfully and confirmed runtime visibility of the four `pi-lsp` tools; slash commands still remain source-confirmed rather than runtime-registry-confirmed because the CLI surface used here does not expose a command-list dump.

| prompt_id | suite | quality (baseline→treatment) | duration_ms (baseline→treatment) | turns (baseline→treatment) | tool_calls (baseline→treatment) | files_read (baseline→treatment) | takeaway |
|---|---|---|---|---|---|---|---|
| A-01 | symbol | 0 → 0 (blocked stub) | null → null | null → null | null → null | null → null | No live evidence yet. This remains the key prompt for proving symbol/navigation benefit. |
| B-01 | refs | 0 → 0 (blocked stub) | null → null | null → null | null → null | null → null | No live evidence yet. This remains the key prompt for proving reference-finding benefit. |
| C-01 | ranking | 0 → 0 (blocked stub) | null → null | null → null | null → null | null → null | Still advisory only; current rows cannot support any ranking conclusion. |
| E-01 | control | 0 → 0 (blocked stub) | null → null | null → null | null → null | null → null | Still unavailable as a regression signal because there was no live control run. |
| Overall | pilot | quality not measurable | duration not measurable | turns not measurable | tool usage partly verified only on treatment startup | file-reading not measurable | The matrix is complete, and treatment extension loading is now partially runtime-verified, but the pilot is not decision-grade until live prompt runs replace the stubs. |

### Pilot decision rule

- Proceed to Phase 3 automation only if the manual pilot shows likely benefit on `A-01` and `B-01`, with quality preserved and no obvious metric-capture issues.
- Refine prompts/metrics first if `A-01` and `B-01` do not show likely benefit, if quality drops, or if required fields remain missing/unreliable.
- Treat `C-01` as advisory unless session reset controls were followed.
- Use `E-01` as a regression/control check rather than a primary win signal.

### Current decision memo

Decision for the current pilot artifact: refine execution readiness and metrics capture first; do not proceed to automation yet. Treatment loading is no longer the main uncertainty for tools, but slash-command runtime enumeration and actual prompt execution data are still missing.

Rationale:
- `A-01` and `B-01` show no measurable benefit yet because the rows are placeholders, not completed runs.
- Quality preservation is unproven because there are no live answers to score.
- Core metrics required by the decision rule remain missing (`duration_ms`, `turns`, `tool_calls`, `files_read`).
- Token/cost extraction is technically available when an exact `session_path` can be linked to a live Pi session, and live CLI runs now confirm that path can be captured from `.pi/suggester/sessions/*/meta.json`; however, that linkage is still absent for the blocked stub rows.
- Treatment startup/runtime now visibly exposes the four expected `pi-lsp` tools (`pi_lsp_get_symbol`, `pi_lsp_find_definition`, `pi_lsp_find_references`, `pi_lsp_rank_context`), reducing concern about extension-loading mismatch on the tool surface.
- The three slash commands (`/symbol`, `/refs`, `/rank`) are still source-confirmed only in this environment because no runtime command-registry listing was exposed.
- `E-01` cannot rule out regressions yet, so the control guardrail is still untested.

---

## Success criteria

### Strong success
- >=20% lower median input tokens on Suites A+B
- >=15% lower median wall-clock on Suites A+B
- no drop in quality score

### Moderate success
- >=10% lower cost or token usage on Suites A+B
- same or better quality
- no meaningful regression in Suite E

### Failure / rethink
- no measurable gain on Suites A+B
- treatment increases tool churn without quality gain
- treatment hurts control tasks or answer quality

---

## Recommended next steps for handoff agent

Do this next:

1. Read:
   - `benchmarks/README.md`
   - this file
   - one prompt pack
   - one rubric
2. Confirm current `pi-lsp` implementation state enough for pilot
3. Run manual pilot on:
   - `A-01`
   - `B-01`
   - `C-01`
   - `E-01`
   using fresh comparable sessions or the documented reset checklist above before each baseline/treatment pair
   - in treatment notes, explicitly record the live surface-check finding: four `pi_lsp_*` tools were runtime-visible in a real Pi treatment session; `/symbol`, `/refs`, and `/rank` remain expected-but-not-registry-listed in this CLI environment
4. Save rows using `benchmarks/results/results-template.jsonl` shape, including the exact `session_path` and session-control notes for audit
5. Backfill token/cost data with `node benchmarks/results/extract-pi-usage-from-row.mjs <results.jsonl> <run_id>` when the row has a verified `session_path`
6. Leave token/cost fields as `null` only when the parser cannot attribute the run unambiguously
7. Only then automate

---

## Final recommendation

Benchmark `pi-lsp` as **specialized navigation accelerator**, not general-purpose magic.

If benchmark shows strong gains on Suites A+B and no regressions on Suite E, extension is doing job.

If not, likely root causes are:
- weak symbol resolution
- bad ambiguity handling
- unnecessary tool usage
- ranking overreach
