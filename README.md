# pi-code-nav
Grounded code navigation companion for Pi.
`pi-code-nav` is the navigation policy layer. It helps Pi decide the next code-intelligence hop after repo area, file, or symbol is grounded, and it hands off to the right tool family, from repo discovery to exact-symbol navigation to raw IDE-style LSP ops. In practice this means fewer wasted hops on exact symbol and reference tasks, and better first-move decisions on compound debug or feature work.

## Install

```bash
pi install npm:pi-code-nav
```

Or from git:

```bash
pi install git:github.com/anh-chu/pi-code-nav
```

Or via npm directly:

```bash
npm install pi-code-nav
```

Pi loads the extension through `package.json.pi.extensions`. After install, run `pi update` if new slash commands are not yet visible.

## Why it exists

Natural coding tasks, debug, fix, or feature, break into subtasks. Broad discovery, grounded symbol inspection, usage tracing, semantic IDE ops, and final answer. Different tools win at different phases.

`pi-code-nav` keeps that decision sharp so the agent:

- does not jump to symbol lookups before grounding
- does not fall back to broad `read` once a symbol is already known
- does not repeat work when the session already has enough evidence
- hands off semantic IDE work to raw `lsp_navigation`

## Value props

- **Grounded symbol navigation**, minimal slices, definition location, grouped references.
- **Navigation planner**, bounded 1-4 hop plan across `codesight_*`, `code_nav_*`, `lsp_navigation`, `read`, and answer-now.
- **Session-aware reuse**, resolved definitions, top caller files, and queried symbols persist inside the session.
- **Answer-now short-circuit**, planner can return a direct answer when evidence already suffices.
- **Tight steering**, tool descriptions and intent classifier target agent subtask shape, not literal user wording.
- **Complements, not replaces**, works alongside `pi-codesight` for discovery and the built-in `ast_grep_search` / `ast_grep_replace` for structural edits.

## Ecosystem

Recommended stack:

- **[`pi-codesight`](https://github.com/anh-chu/pi-codesight)**, repo discovery. Routes, schema, subsystems, env, hot files.
- **`pi-code-nav`** (this), grounded navigation, planner, and structural AST search/replace.
- **Built-ins**, `read`, `grep`, `find`, `lsp_navigation`.

Rule of thumb:

- broad or fresh task -> `codesight_*` or `read`
- grounded symbol, caller, or usage task -> `code_nav_*`
- IDE-style semantic op -> raw `lsp_navigation`
- cheap local confirmation in already-open file -> `read`
- undecided or compound task -> `code_nav_plan_navigation`

## Guidance for users

Users do not need to learn any tool name. Just ask naturally.

- “Debug this failing auth flow.”
- “Fix the route parser bug.”
- “Implement a retry policy in the sync job.”
- “Where is this function actually used?”
- “Show me the implementation of X.”

The agent picks the right tool. Slash commands are available for direct control.

## Agent tools

All tools are registered on Pi load.

### `code_nav_get_symbol`
Read one exact grounded symbol definition with minimal code.
- Input: `symbol` (required), `file`, `includeBody`, `contextLines`.
- Best when current subtask is minimal implementation inspection.
- Returns: compact slice, location, owning file, jump-ready next-step hints.

### `code_nav_find_definition`
Find the exact definition location of a grounded symbol.
- Input: `symbol` (required), `file`.
- Best when the subtask is resolving the owning file or line.
- Returns: file, line, character, next-step hints.

### `code_nav_find_references`
Find usages of a grounded symbol, grouped by file, caller file prioritized.
- Input: `symbol` (required), `file`, `limit`.
- Best when the subtask is caller tracing, usage tracing, or impact.
- Returns: grouped hits, top caller file, next-step hints.

### `code_nav_rank_context`
Prioritize files and symbols already observed inside this Pi session.
- Input: `query`, `limit`.
- Does not explore the repo. Ranks in-memory session state only.
- Returns: ranked items, session state counts, guidance, fresh-session warning if empty.

### `code_nav_plan_navigation`
Plan the next 1-4 navigation hops.
- Input: `task` (required), `symbol`, `file`, `mode`, `limit`.
- Returns: intent, best route, next tool, next args, fallback steps, stop conditions, evidence snapshot.
- Possible routes: `codesight`, `code_nav`, `lsp_navigation`, `read`, `answer`.

## Multi-language support

`code_nav_*` symbol navigation works across all languages supported by `ast_grep_search`. The fallback scanner reads source files and applies language-aware declaration patterns.

| Language | Extensions | Declaration patterns |
|---|---|---|
| TypeScript / JS | `.ts .tsx .js .jsx .mjs .cjs` | `function`, `class`, `interface`, `type`, `enum`, `const` |
| CSS / SCSS / Sass | `.css .scss .sass .less` | `.class {`, `#id {` |
| Python | `.py` | `def`, `class`, `async def` |
| Go | `.go` | `func`, `type` |
| Rust | `.rs` | `fn`, `struct`, `impl`, `trait`, `enum` |
| Java / Kotlin | `.java .kt .kts` | `class`, `interface` |
| Ruby | `.rb` | `def`, `class`, `module` |
| PHP | `.php` | `function`, `class` |
| Swift | `.swift` | `func`, `class`, `struct`, `protocol` |
| Dart | `.dart` | `class`, `void` |
| Elixir | `.ex .exs` | `def`, `defmodule` |
| Scala | `.scala` | `def`, `class`, `object`, `trait` |
| HTML | `.html .htm` | tag / class / id patterns |
| Lua | `.lua` | `function`, `local function` |
| Haskell | `.hs` | symbol at line start |

No install or config required. Language is detected automatically from file extension.

> **Note:** LSP semantic navigation (`lsp_navigation`) remains TypeScript-only. The `code_nav_*` tools use the fallback text-scan and ast-grep backends for non-TypeScript languages.

## Slash commands

Slash commands are a direct control surface. Useful in interactive Pi sessions.

- `/symbol <name> [fileHint]`, run `code_nav_get_symbol`.
- `/refs <name> [fileHint]`, run `code_nav_find_references`.
- `/rank <task>`, run `code_nav_rank_context`.
- `/nav <task>`, run `code_nav_plan_navigation`.

After manifest changes, run `pi update` or reinstall the package so new commands register.

## Schema

### Planner result

```ts
type PlannerStatus = 'needs-discovery' | 'grounded-next-hop' | 'needs-narrowing' | 'answer-now';
type ToolRouteFamily = 'codesight' | 'code_nav' | 'lsp_navigation' | 'read' | 'answer';

interface NavigationPlan {
  intent: 'inspect' | 'define' | 'trace' | 'impact' | 'debug' | 'discover' | 'explain';
  status: PlannerStatus;
  confidence: 'low' | 'medium' | 'high';
  bestRoute: { primary: ToolRouteFamily; toolName?: string; args?: Record<string, unknown>; reason: string };
  steps: NavigationStep[];
  fallbackSteps: NavigationStep[];
  stopWhen: string[];
  nextTool?: string;
  nextArgs?: Record<string, unknown>;
  evidence: EvidenceSnapshot;
  freshSession: boolean;
}
```

### Symbol result

```ts
interface SymbolSliceResult {
  content: string;
  details: {
    symbol: string;
    location: { file: string; line: number; character?: number };
    owningFile: string;
    body?: string;
    nextBestTool?: string;
    nextBestArgs?: Record<string, unknown>;
    nextBestReason?: string;
  };
}
```

### Reference result

```ts
interface ReferenceResult {
  content: string;
  details: {
    symbol: string;
    groupedHits: Array<{ file: string; count: number; line: number; snippet?: string }>;
    bestNextCallerFile?: string;
    bestNextReadArgs?: { path: string };
    topImpactFiles: Array<{ file: string; score: number }>;
    nextBestTool?: string;
    nextBestArgs?: Record<string, unknown>;
  };
}
```

## Usage

### Natural prompts

```text
Debug why route parsing mishandles trailing slashes.
```
Agent path: discovery first, then grounded symbol hop, then reads minimal code.

```text
Show the implementation of registerPiLspTools.
```
Agent path: `code_nav_get_symbol`.

```text
Where is registerPiLspTools used across the repo?
```
Agent path: `code_nav_find_references`.

```text
Where is registerPiLspTools defined?
```
Agent path: `code_nav_find_definition`, or answer-now if already grounded in session.

### Planner-first

```text
Plan the next navigation move to debug a possible tool registration issue.
```
Agent path: `code_nav_plan_navigation`. Returns next tool + args or answer-now.

### Interactive slash

```
/symbol registerPiLspTools src/tools.ts
/refs registerPiLspTools src/tools.ts
/nav show exact definition location for registerPiLspTools
/rank changes related to tool registration
```


## User-exposed skills

No separate skill bundle ships with `pi-code-nav` yet. Planner guidance is already embedded in the tool descriptions and surfaced through `/nav`.

Recommended companion skills from the Pi ecosystem:

- `lsp-navigation`, for raw IDE ops through `lsp_navigation`.
- `ast-grep`, for structural code search and edits.
- `structured-return`, for compact test and build outputs.
- `commit` and `github`, for git and PR flow after edits.

## Configuration

`pi-code-nav` reads no external configuration. Internal caching is mtime-scoped per file.

## Docs

- `docs/TOOL-CHOOSER.md`, which tool fits which subtask.
- `docs/WORKFLOWS.md`, canonical debug, fix, and feature flows.
- `CHANGELOG.md`, version history.

## License

MIT. See `LICENSE`.
