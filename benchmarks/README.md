# Benchmarks

This directory contains benchmark assets for comparing:
- baseline = Pi without `pi-lsp`
- treatment = Pi with `pi-lsp`

Keep codesight and all other conditions constant.

## Structure

- `prompts/` — fixed prompt packs by suite
- `rubrics/` — quality scoring guides
- `results/schema.json` — result row schema
- `results/results-template.jsonl` — starter template

## First batch

Run these packs first:
- `prompts/suite-a-symbol.jsonl`
- `prompts/suite-b-refs.jsonl`
- `prompts/suite-c-ranking.jsonl`
- `prompts/suite-d-debug.jsonl`
- `prompts/suite-e-control.jsonl`

Then add compound-navigation checks:
- `prompts/suite-f-compound.jsonl`

## Recommendation

Start manually with a few rows, validate prompts and scoring, then automate.

## Automation

Run:
- `npm run bench:harness:pilot`
- runner: `benchmarks/automation/run-harness-benchmarks.mjs`
- default matrix: `A-01`, `B-01`, `C-01`, `E-01` in both `baseline` and `treatment`
- output: JSONL rows in `benchmarks/results/` plus adjacent markdown summary

What harness benchmark does:
- uses `@marcfargas/pi-test-harness`
- baseline loads `pi-codesight` only
- treatment loads `pi-codesight` + `pi-lsp`
- records duration, turns, tool calls, files read, bytes read, answer text, quality/precision heuristics
- leaves token/cost/session fields `null` because harness is not live-model runtime

What harness benchmark does not cover:
- real model behavior
- real token/cost usage
- live Pi session linkage

Use harness run for:
- regression checking
- benchmark row plumbing
- extension surface verification
- fast baseline vs treatment smoke comparisons

Use live Pi sessions for:
- final benchmark claims
- token/cost comparisons
- unscripted model behavior evaluation

## Live automation

Run pilot: `npm run bench:live:pilot`
Run full matrix: `npm run bench:live:full`
- runner: `benchmarks/automation/run-live-benchmarks.mjs`
- default `bench:live` / `bench:live:full` behavior: run all prompt ids discovered in `benchmarks/prompts/*.jsonl`
- pilot subset stays `A-01`, `B-01`, `C-01`, `E-01`
- transport: `pi --mode json --print`
- session control: one dedicated `--session-dir` per run = `fresh_session` isolation
- baseline loads `pi-codesight` only via explicit `--extension`
- treatment loads `pi-codesight` + `pi-lsp` via explicit `--extension`
- discovery disabled for consistency: `--no-extensions --no-skills --no-prompt-templates --no-themes`
- raw artifacts per run: `benchmarks/results/live-runs/<run_id>/`
- output rows: `benchmarks/results/live-benchmark-YYYY-MM-DD.jsonl`
- output summary: adjacent `-summary.md` file

What live runner captures:
- duration, turns, tool calls, files read, bytes read
- answer text
- session path
- token/cost fields from `~/.pi/suggester/sessions/<session-id>/{meta,usage}.json` when linkage verifies
- fallback token/cost extraction from assistant `message.usage` blocks inside recorded session JSONL when suggester artifacts are absent
- notes now tag `rank_context_pre_evidence=yes|no` when `pi_lsp_rank_context` is used, based on whether any prior concrete evidence tool ran first (`read`, `pi_lsp_get_symbol`, `pi_lsp_find_definition`, or `pi_lsp_find_references`)
- interpret `rank_context_pre_evidence=yes` as orchestration misuse in that run, not an automatic backend failure signal

What live runner does on failure:
- writes blocked/failed rows with null execution metrics
- keeps stderr and raw event logs for audit

Recommended usage:
- set provider/model explicitly for stable comparisons
- keep same repo snapshot and codesight state between baseline and treatment
- review heuristic quality scores manually before making final claims
- summary now includes a treatment usage breakdown separating: direct `pi_lsp` adoption (`get_symbol` / `find_definition` / `find_references`), treatment-context-only runs (`rank_context` without direct adoption), and treatment-loaded-but-unused / bypass runs
- result rows may include `treatment_usage_class`, `treatment_direct_adoption_calls`, and `treatment_context_calls` for practical downstream reporting against the current schema

### Suggested benchmark tiers

- `npm run bench:live:smoke`
  - rows: `E-01,A-01,B-01`
  - use: cheapest fast model for runner/control smoke checks

- `npm run bench:live:dev`
  - rows: `A-01,B-01,B-02,F-03,E-01`
  - use: regular iteration set on a faster code model such as `gpt-5.1-codex-mini`

- `npm run bench:live:expanded`
  - rows: `A-01,A-02,A-03,B-01,B-02,B-03,C-01,F-02,F-03,E-01`
  - use: broader pre-milestone adoption check on mid-tier model

- `npm run bench:live:milestone`
  - rows: `A-01,A-02,A-03,B-01,B-02,B-03,C-01,D-02,E-01,F-02,F-03`
  - use: practical milestone set when full matrix on strongest model is too slow

- `npm run bench:live:full`
  - rows: all discovered prompt ids
  - use: strongest-model checkpoint / publishable snapshot

### Recommended model mapping

- smoke: cheap fast model like `gemini-2.0-flash-lite`
- dev / expanded: `gpt-5.1-codex-mini`
- milestone full-matrix checkpoint: `gpt-5.4-mini`
- if milestone runtime matters more than full coverage, prefer `bench:live:milestone` on `gpt-5.1-codex-mini` before paying for `bench:live:full` on `gpt-5.4-mini`
