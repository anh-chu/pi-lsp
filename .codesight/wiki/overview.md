# pi-code-nav — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**pi-code-nav** is a typescript project built with raw-http.

## Scale

24 library files · 5 environment variables

**Libraries:** 24 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `src/types.ts` — imported by **18** files
- `src/state.ts` — imported by **10** files
- `src/symbol-backends.ts` — imported by **10** files
- `src/format.ts` — imported by **7** files
- `src/symbols.ts` — imported by **5** files
- `src/workspace-path.ts` — imported by **4** files

## Required Environment Variables

- `HOME` — `benchmarks/results/extract-pi-usage-from-row.mjs`
- `OPENAI_API_KEY` — `benchmarks/automation/run-harness-benchmarks.mjs`
- `PATH` — `benchmarks/automation/run-live-benchmarks.mjs`
- `PI_BIN` — `benchmarks/automation/run-live-benchmarks.mjs`
- `PI_OFFLINE` — `benchmarks/automation/run-live-benchmarks.mjs`

---
_Back to [index.md](./index.md) · Generated 2026-05-11_