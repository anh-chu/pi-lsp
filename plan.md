# pi-lsp plan

## Project purpose

`pi-lsp` is separate Pi extension project.

Goal:
- give Pi **runtime code-navigation precision**
- complement static repo-context tools like codesight
- let model read **exact symbol-level code slices** instead of broad files
- let model ask **where defined / where used / what to inspect next**

This project should stand on its own.

Assume implementation agent knows **nothing** beyond files and docs referenced in this plan.

---

## Current project status

Scaffold already exists in this repo.

Current files:

```text
pi-lsp/
  package.json
  tsconfig.json
  plan.md
  README.md
  review.md
  src/
    index.ts
    tools.ts
    commands.ts
    types.ts
    format.ts
    state.ts
    cache.ts
    ranking.ts
    slices.ts
    symbols.ts
  test/
    helpers.ts
    tools.test.ts
    ranking.test.ts
    cache.test.ts
```

Current quality level:
- extension loads
- tests pass
- package metadata exists
- command/tool names exist
- **real LSP behavior is not implemented yet**
- several tools still return placeholder responses
- `pi_lsp_get_symbol` currently has only crude file-hint fallback, not true symbol resolution

This means next agent should **continue from scaffold**, not start from zero.

---

## Executive summary

Pi already has strong built-in developer tools in this session:
- `read`
- `edit`
- `bash`
- `lsp_navigation`
- `ast_grep_search`
- `ast_grep_replace`

But Pi core does **not** automatically turn those into:
- symbol-level read tools with small slices
- conversation-aware relevance ranking
- thin cache for repeated def/ref lookups
- session-aware navigation helpers

`pi-lsp` should provide that missing layer.

### Simple framing

- **codesight** = repo-level structural context
  - wiki
  - summary
  - routes/schema/env/hot-files
  - blast radius
- **pi-lsp** = runtime navigation + precision layer
  - read exact symbol
  - find definition
  - find references
  - rank most relevant files/symbols now

Do **not** rebuild codesight.
Do **not** rebuild LSP client stack from scratch.
Do **not** clone SoulForge.

Use orchestration first.

---

## Product problem

LLM often wastes tokens by doing this:
1. read whole file
2. skim irrelevant code
3. grep around for symbol
4. read more files than needed
5. lose precision in larger files or monorepos

Desired behavior:
1. identify exact symbol/function/class/type
2. get definition with minimal surrounding code
3. get references if needed
4. rank next best files based on current task
5. avoid broad file reads unless necessary

That is what `pi-lsp` should optimize.

---

## User stories

### Story 1 — symbol read
User asks:
> show me `runRefresh` implementation

Good behavior:
- extension returns exact definition body or minimal slice
- model does **not** read whole `src/tools.ts`

### Story 2 — definition lookup
User asks:
> where is `registerCodesightTools` defined?

Good behavior:
- extension resolves file + line + compact preview

### Story 3 — references lookup
User asks:
> where is `registerCodesightTools` used?

Good behavior:
- extension returns small reference list, preferably grouped by file

### Story 4 — next context ranking
User asks:
> I am debugging route parsing in `pi-codesight`; what should I inspect next?

Good behavior:
- extension ranks likely relevant files/symbols from conversation and recent reads
- avoids unrelated monorepo hot files

---

## Scope

## v1 scope

Build these public tools:
1. `pi_lsp_get_symbol`
2. `pi_lsp_find_definition`
3. `pi_lsp_find_references`
4. `pi_lsp_rank_context`

Build these slash commands:
1. `/symbol <name> [fileHint]`
2. `/refs <name> [fileHint]`
3. `/rank [task text]`

Build these internal systems:
- lightweight in-memory cache
- file-mtime invalidation
- minimal session-state tracking for ranking
- fallback chain: LSP -> AST -> clear failure

## v2 scope

Delay these:
- call hierarchy tools
- diagnostics-aware ranking
- workspace-wide semantic summaries
- editor-active-file integration
- persistent index/database
- custom tree-sitter stack

---

## Non-goals

- no full repo-map clone
- no SQLite index first
- no multi-agent system
- no custom UI first
- no code-edit/refactor tool first
- no heavy background service required in v1
- no reimplementation of `pi-lens`

---

## Why separate from pi-codesight

`pi-codesight` should remain focused on wrapping codesight semantics.

`pi-lsp` should remain focused on:
- exact navigation
- exact symbol reads
- task-aware ranking
- runtime precision

Separation good because:
- smaller mental model
- clearer ownership
- easier testing
- easier future recomposition: use both extensions together

---

## Architecture

## Core principle

Use **existing Pi tools first**.

### First-choice primitives
- `lsp_navigation`
- `ast_grep_search`
- `read`

### Why
- built-in already available
- less code to maintain
- lets extension focus on workflow and ranking

## Required implementation style

This extension should mostly be:
- parameter normalization
- backend selection
- result shaping
- file slicing
- lightweight caching
- ranking from session context

This extension should **not** mostly be:
- parser implementation
- custom AST stack
- custom DB/index
- giant code search engine

---

## Concrete backend strategy

## Symbol reads

### Primary path
1. locate symbol with `lsp_navigation.documentSymbol` if file hint exists
2. otherwise try `lsp_navigation.workspaceSymbol`
3. if exact location found, use `read` on file slice or direct fs slice helper
4. return minimal definition block

### Fallback path
1. use `ast_grep_search` declaration pattern by language if LSP fails
2. if only file hint available and AST cannot resolve symbol, return explicit ambiguity or failure

### Never do in v1
- read entire file by default unless file is already tiny
- silently claim exact match if only fuzzy text hit found

## Definition lookup

### Primary path
- `workspaceSymbol` or `documentSymbol` first
- `definition` if cursor-backed workflow becomes possible later

### Fallback path
- `ast_grep_search` in hinted file or project subtree

## References lookup

### Primary path
- `lsp_navigation.references`

### Fallback path
- `ast_grep_search` by identifier in narrowed scope
- mark result lower confidence

## Ranking

### Sources
- session state from extension itself
- optional file mentions from commands/tool params
- optional codesight context later if useful

### Important
Ranking should be deterministic and explainable.
No model-generated ranking in v1.

---

## Public tool design

## 1) `pi_lsp_get_symbol`

### Purpose
Read exact symbol definition with minimal surrounding code.

### Schema

```ts
Type.Object({
  symbol: Type.String({
    description: "Symbol name like runRefresh, registerCodesightTools, UserService"
  }),
  file: Type.Optional(Type.String({
    description: "Optional file path hint to narrow lookup"
  })),
  includeBody: Type.Optional(Type.Boolean({
    description: "If true, include full definition body when possible"
  })),
  contextLines: Type.Optional(Type.Number({
    description: "Extra lines around symbol",
    minimum: 0,
    maximum: 50
  }))
})
```

### Expected behavior
- locate exact symbol in one or more files
- return compact slice with useful body content
- if ambiguous, list candidates
- if no match, explain next step

### Prompt metadata
- `promptSnippet`: "Read one symbol definition with minimal surrounding code"
- `promptGuidelines`:
  - "Use this tool when exact function/class/type is needed instead of whole-file reads."
  - "Prefer this before reading large files."

### Return shape
- content: compact code slice
- details:
  - `symbol`
  - `file`
  - `line`
  - `startLine`
  - `endLine`
  - `confidence`
  - `backend`
  - `ambiguous`

### Current implementation gap
Current `src/symbols.ts` only:
- records queried symbol
- if `file` given, returns top-of-file slice around line 1
- otherwise returns placeholder message

This must be replaced with real symbol resolution.

---

## 2) `pi_lsp_find_definition`

### Purpose
Find where symbol is defined.

### Schema

```ts
Type.Object({
  symbol: Type.String({
    description: "Symbol to resolve"
  }),
  file: Type.Optional(Type.String({
    description: "Optional file hint"
  }))
})
```

### Expected behavior
- return likely definition candidates with file and line
- show preview if cheap
- mark ambiguity honestly

### Current implementation gap
Current `src/tools.ts` returns placeholder response only.

---

## 3) `pi_lsp_find_references`

### Purpose
Find usages of symbol.

### Schema

```ts
Type.Object({
  symbol: Type.String({
    description: "Symbol to find usages for"
  }),
  file: Type.Optional(Type.String({
    description: "Optional file hint"
  })),
  limit: Type.Optional(Type.Number({
    description: "Maximum number of matches",
    minimum: 1,
    maximum: 100
  }))
})
```

### Expected behavior
- resolve symbol if needed
- query references
- group results by file
- truncate intelligently

### Current implementation gap
Current `src/tools.ts` returns placeholder response only.

---

## 4) `pi_lsp_rank_context`

### Purpose
Rank best next files or symbols to inspect for current task.

### Schema

```ts
Type.Object({
  query: Type.Optional(Type.String({
    description: "Task or question to rank context for"
  })),
  limit: Type.Optional(Type.Number({
    description: "Maximum number of ranked items",
    minimum: 1,
    maximum: 20
  }))
})
```

### Expected behavior
- inspect session state
- score files/symbols by heuristics
- return ranked list with reasons

### Current implementation status
Current `src/ranking.ts` exists and works, but very simple.
Current signals:
- mentioned files
- read files
- queried symbols
- current query text

This is acceptable as seed version, but should improve.

---

## Slash commands

### `/symbol <name> [fileHint]`
- should emit visible symbol slice message
- currently works, but only as thin wrapper around placeholder logic

### `/refs <name> [fileHint]`
- currently placeholder
- should use real references logic later

### `/rank [task text]`
- currently returns deterministic ranking from extension state

---

## How Pi will trigger tools

Pi custom tools become callable by model through `pi.registerTool()`.

Important Pi behavior:
- `pi.registerTool()` registers custom tool
- `promptSnippet` adds one-line hint into default system prompt
- `promptGuidelines` adds tool-specific bullets into system prompt while tool active
- tools registered on load or `session_start` are callable without `/reload`

### Example 1 — symbol read
User asks:
> show me `runRefresh` implementation

Expected model behavior:
1. sees `pi_lsp_get_symbol`
2. calls `{ symbol: "runRefresh" }`
3. extension resolves location
4. extension reads minimal slice
5. model answers from exact code

### Example 2 — definition lookup
User asks:
> where is `registerCodesightTools` defined?

Expected model behavior:
1. sees `pi_lsp_find_definition`
2. calls `{ symbol: "registerCodesightTools" }`
3. extension returns file/line candidates
4. model answers or follows with `pi_lsp_get_symbol`

### Example 3 — references lookup
User asks:
> where is `registerCodesightTools` used?

Expected model behavior:
1. model calls `pi_lsp_find_references`
2. extension returns grouped usage list
3. model summarizes impact

### Example 4 — ranking
User asks:
> what should I inspect next for route bug in `pi-codesight`?

Expected model behavior:
1. model calls `pi_lsp_rank_context`
2. extension returns ranked files/symbols based on session state
3. model reads top candidates only

---

## Ranking heuristics

No fancy ML. Keep deterministic.

## Current signals already scaffolded
- file explicitly mentioned by extension logic
- file recently read by extension logic
- symbol recently queried by extension logic
- current ranking query text

## Target v1 signals

### Positive
- file explicitly mentioned by user or command: +8
- file recently read in current session: +5
- file in current package/subtree: +5
- symbol recently queried: +5
- file appears in codesight hot files: +3
- file near recent blast-radius result: +4
- file changed recently: +2

### Negative
- unrelated monorepo package: -4
- generated/vendor files: -6
- test files when task is clearly product-code first: -2

## Important constraint
Do not overengineer ranking before symbol lookup works.

---

## Session-state tracking

Track minimal state only.

## Current state already scaffolded
`src/state.ts` currently tracks:
- `mentionedFiles`
- `readFiles`
- `queriedSymbols`
- `lastRankedItems`

## Missing improvement
State does not yet automatically learn from built-in Pi tool usage or user prompt parsing.
That is OK for first real milestone.

---

## Cache design

Keep in-memory only for v1.

## Current cache already scaffolded
`src/cache.ts` currently provides:
- get
- set
- clear
- prefix invalidation

## Missing improvement
It does not yet integrate with symbol/definition/reference results.
Add that only after real symbol lookup exists.

## Recommended cache keys
- `symbol:def:${root}:${fileHint ?? '*'}:${symbol}`
- `symbol:refs:${root}:${fileHint ?? '*'}:${symbol}:${limit}`
- `symbol:body:${root}:${fileHint ?? '*'}:${symbol}:${includeBody}:${contextLines}`
- `rank:${root}:${normalizedQuery}:${recentContextHash}`

## Invalidation
- invalidate per file on mtime change
- clear rank cache when recent context changes materially

---

## Freshness / stale detection

This project should detect stale cached symbol info.

### What to detect
- file newer than cached entry
- file deleted/moved
- symbol lookup location invalid after edits

### What to do
- recompute silently
- avoid success lies
- do not spam user with healthy-state notifications

### Important
Freshness here means **cache correctness**, not codesight artifact staleness.
That is separate concern from `pi-codesight`.

---

## File-by-file implementation guidance

## `src/index.ts`
Keep tiny.
Should only register commands/tools.
Current state acceptable.

## `src/tools.ts`
Contains custom Pi tools.
Current state:
- schemas mostly good
- prompt metadata present
- three tools still placeholder-heavy

Next work:
- move real symbol/definition/reference orchestration into dedicated modules
- keep tool file mostly declarative

## `src/commands.ts`
Current commands exist and emit visible messages.
Good.
Keep thin wrappers around module logic.

## `src/symbols.ts`
This should become core implementation file.
Next work here:
- wrap `lsp_navigation`
- add fallback `ast_grep_search`
- use `src/slices.ts` for exact file slicing
- return structured `SymbolResult`

## `src/slices.ts`
Current helper is too naive.
Next work:
- once symbol line/range known, slice exact region
- optionally expand to body using AST/LSP range instead of fixed context

## `src/ranking.ts`
Current version is fine bootstrap.
Do not overbuild yet.
Enhance only after symbol tool works.

## `src/cache.ts`
Current version fine bootstrap.
Wire into real lookup paths later.

## `src/types.ts`
Keep shared types honest and minimal.
Refine as real backends appear.

---

## Implementation order

## Milestone 1 — make `pi_lsp_get_symbol` real

This is highest-priority milestone.

### Deliverables
- real symbol lookup by file hint if present
- real symbol lookup by workspace if file hint absent
- exact code slice output
- ambiguity handling
- tests for happy path and failure path

### Suggested algorithm
1. if `file` present:
   - call `lsp_navigation.documentSymbol` on file
   - find matching symbol name
   - if found, use returned range/selection range
   - slice file exactly
2. if no file or file match fails:
   - call `lsp_navigation.workspaceSymbol` with symbol name
   - rank exact-name hits above partial matches
   - use best candidate or return ambiguous list
3. if LSP fails:
   - fallback to `ast_grep_search` declaration pattern in hinted file or project
4. if still unresolved:
   - explicit failure with next-step suggestion

### Done criteria
User can ask:
> show me `registerPiLspTools`

and get exact function slice, not top-of-file fallback.

## Milestone 2 — definitions
- implement `pi_lsp_find_definition`
- reuse same candidate resolution logic from milestone 1

## Milestone 3 — references
- implement `pi_lsp_find_references`
- group by file
- cap output

## Milestone 4 — better ranking
- add codesight-aware signals if available
- add package/subtree prioritization

## Milestone 5 — cache + mtime invalidation
- add cache keys to real lookup paths
- invalidate on file change

---

## Testing strategy

## Current tests already scaffolded
- `test/tools.test.ts`
- `test/ranking.test.ts`
- `test/cache.test.ts`

They only validate scaffold behavior.

## Required next tests

### Symbol tests
1. exact symbol resolved in one file
2. ambiguous symbol across two files
3. file hint narrows correct candidate
4. symbol missing returns explicit failure
5. fallback path used when LSP unavailable

### Definition tests
1. returns file + line candidate
2. exact match preferred over partial match

### References tests
1. grouped by file
2. limit enforced
3. fallback path marked lower confidence

### Ranking tests
1. current package beats unrelated package
2. recent symbol affects rank
3. recent read affects rank

---

## Hard constraints

1. Keep names and behavior honest.
2. If result ambiguous, say ambiguous.
3. If LSP unavailable, state fallback used.
4. Prefer exact slice over whole-file read.
5. Avoid giant output.
6. No custom database first.
7. No background daemon first.
8. Do not silently degrade into bad broad text search without saying so.

---

## Must-read references

Implementation agent should read these before coding.

## 1. Pi extension docs
Path:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`

Read for:
- extension quick start
- extension auto-discovery paths
- `pi.registerTool(definition)`
- `promptSnippet`
- `promptGuidelines`
- command registration
- events and session hooks

Important points already known:
- `pi.registerTool()` works at load and after startup
- `promptSnippet` adds one-line tool entry to default prompt
- `promptGuidelines` adds tool-specific bullets to prompt

## 2. Pi README
Path:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/README.md`

Read for:
- general Pi behavior
- extension loading/reload
- command UX
- philosophy and boundaries

## 3. Pi extension examples
Paths:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/dynamic-tools.ts`
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/tools.ts`
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/README.md`

Why:
- shows minimal extension patterns
- shows tool registration
- shows command registration
- shows state/session handling patterns

## 4. `pi-lens` reference repo
Path:
- `/home/sil/pi-extensions/pi-lens`

This repo is **reference only**, not copy target.

Read these files if needed:
- `clients/lsp/client.ts`
- `clients/tree-sitter-client.ts`
- `clients/tree-sitter-navigator.ts`
- `clients/tree-sitter-symbol-extractor.ts`
- `clients/project-index.ts`
- `clients/file-utils.ts`
- `clients/runtime-session.ts`
- `clients/dispatch/fact-store.ts`

Why:
- prior art for LSP orchestration
- prior art for tree-sitter symbol extraction
- prior art for runtime state and indexing

## 5. Optional contextual reference: `pi-codesight`
Path:
- `/home/sil/pi-extensions/pi-codesight`

Why:
- shows adjacent extension style for repo-level context layer
- useful if later combining both extensions

This plan does **not** require `pi-codesight` implementation to exist.

---

## Recommended shell / tool checks before coding

Use these to de-risk implementation.

### Check current scaffold health
```bash
cd /home/sil/pi-extensions/pi-lsp
npm test
npm run check
```

### Inspect current source quickly
```bash
find src test -maxdepth 2 -type f | sort
```

### Validate Pi docs/examples exist
```bash
ls /home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/docs
ls /home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions
```

---

## Important implementation notes

### Note 1
Use orchestration over reinvention.

Meaning:
- wrapper around Pi built-in `lsp_navigation` first
- wrapper around `ast_grep_search` second
- extension logic should mostly be workflow glue

### Note 2
Symbol slicing is main value.

Do not overfocus on ranking before `pi_lsp_get_symbol` works well.

### Note 3
Ranking should stay deterministic.

No hidden model call for ranking in v1.

### Note 4
Monorepo relevance matters.

Workspace often has multiple sibling projects.
Ranking should prefer current target subtree when user mentions one project.

---

## Concrete success criteria

v1 succeeds if agent can do these cheaply:
1. "show `runRefresh` implementation"
2. "where is `registerCodesightTools` defined?"
3. "where is `registerCodesightTools` used?"
4. "what symbol or file should I inspect next for route parsing bug?"
5. all without broad whole-file reads by default

---

## Suggested next action for implementation agent

Do this next, in order:

1. inspect current scaffold files
2. make `pi_lsp_get_symbol` real in `src/symbols.ts`
3. update tests for exact symbol resolution
4. only then implement definition lookup
5. only then references
6. only then ranking polish

If tempted to build index/database first: stop.
Wrong v1.