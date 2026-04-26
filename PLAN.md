# pi-code-nav — ast_grep tools addition

Add `ast_grep_search` and `ast_grep_replace` tool registration directly to pi-code-nav.
Replaces the tool-registration layer of pi-lens with zero startup cost and no write-time pipeline.

## Goal

Drop `npm:pi-lens` entirely. Keep `ast_grep_search` / `ast_grep_replace` as standalone tools.
`lsp_navigation` is out of scope (low real-world value for agents — see decision notes below).

## Decision notes

- `ast_grep_search` — genuinely better than `grep` for structural/semantic code patterns
- `ast_grep_replace` — no good substitute for batch structural refactor; worth keeping
- `lsp_navigation` — cursor-position-dependent ops (hover, signatureHelp) rarely usable by agents;
  definition/references already covered by pi-code-nav's `code_nav_*` tools; omitted
- pi-code-nav (`code_nav_*` tools) calls `ast_grep_search` internally as a backend —
  must remain registered or pi-code-nav degrades

## What changes

| Before | After |
|---|---|
| pi-lens registers tools (13.5s startup, write-blocking) | pi-lsp registers same tools (~0ms startup, no pipeline) |
| pi-code-nav calls ast_grep_search via pi-lens | pi-code-nav calls ast_grep_search via pi-lsp |
| lsp_navigation available | lsp_navigation gone (acceptable) |

## File structure

Additions to existing pi-code-nav repo (`~/pi-extensions/pi-lsp/`):

```
src/
  sg-runner.ts          # NEW: spawn sg CLI, parse JSON, formatMatches
  tools/
    ast-grep-search.ts  # NEW
    ast-grep-replace.ts # NEW
    shared.ts           # NEW: LANGUAGES const
index.ts                # MODIFIED: register two new tools
```

## Implementation

### sg-runner.ts

Thin wrapper around the `sg` CLI. No class needed — just functions.

```ts
import { spawnSync } from "node:child_process"
import { execSync } from "node:child_process"

// Check sg is available in PATH
export function sgAvailable(): boolean

// Run: sg run -p $pattern --lang $lang --json=compact [...paths]
export function sgSearch(pattern, lang, paths, opts?): SgMatch[]

// Dry-run: sg run -p $pattern -r $rewrite --lang $lang --json=compact [...paths]
export function sgReplaceDry(pattern, rewrite, lang, paths): SgMatch[]

// Apply: sg run -p $pattern -r $rewrite --lang $lang --update-all [...paths]
//        then search for rewrite pattern to show what changed
export function sgReplaceApply(pattern, rewrite, lang, paths): SgMatch[]

// Format matches array into readable output string
export function formatMatches(matches, isDryRun?, showModeIndicator?): string
```

SgMatch shape (from `sg --json=compact`):

```ts
type SgMatch = {
  file: string
  text: string
  range: { start: { line: number; column: number }; end: { line: number; column: number } }
}
```

### tools/shared.ts

Copy LANGUAGES const from pi-lens verbatim (25 language literals).

### tools/ast-grep-search.ts

Copy logic from pi-lens `createAstGrepSearchTool` with two changes:
- Replace `astGrepClient.ensureAvailable()` with `sgAvailable()`
- Replace `astGrepClient.search(...)` with `sgSearch(...)`
- Drop `looksLikeRuleYamlOrPlainText` guard (optional — keep if desired)

### tools/ast-grep-replace.ts

Copy logic from pi-lens `createAstGrepReplaceTool` with:
- Replace client calls with `sgReplaceDry` / `sgReplaceApply`

### index.ts (modification)

Add two `pi.registerTool()` calls alongside existing tool registrations. No new events or lifecycle hooks.

## Scope

~350 lines total. No npm dependencies beyond `typebox` (already available via pi SDK).
`sg` binary expected in PATH — already installed at `/usr/local/bin/sg` or equivalent.

## After implementation

1. Bump pi-code-nav version, publish to npm
2. `pi update` to pull new version
3. `pi uninstall npm:pi-lens`
4. Run `pi` — verify `ast_grep_search` and `ast_grep_replace` tools appear
5. Verify `code_nav_find_references` still works (uses ast_grep_search as backend)

## Out of scope

- `lsp_navigation` tool — not worth porting (see decision notes)
- Write-time linting/formatting — intentionally omitted
- Auto-install of `sg` binary — if missing, tools return clear error message
- Publishing to npm — local extension only for now
