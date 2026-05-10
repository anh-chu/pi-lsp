# pi-code-nav — AI Context Map

> **Stack:** raw-http | none | unknown | typescript

> 0 routes | 0 models | 0 components | 22 lib files | 5 env vars | 0 middleware | 0% test coverage
> **Token savings:** this file is ~2,200 tokens. Without it, AI exploration would cost ~15,500 tokens. **Saves ~13,300 tokens per conversation.**
> **Last scanned:** 2026-05-10 21:52 — re-run after significant changes

---

# Libraries

- `src/cache.ts`
  - function getCache: (key) => CacheEntry<T> | undefined
  - function setCache: (key, value, mtimeMs?) => void
  - function clearCache: () => void
  - function invalidateCache: (keyPrefix) => void
  - function readFreshCache: (key, mtimeMs?) => T | undefined
  - function getFileMtimeMs: (file) => number | undefined
  - _...2 more_
- `src/commands.ts` — function registerPiLspCommands: (pi) => void
- `src/compare.ts` — function compareImplementations: (params, options) => Promise<CompareResult>
- `src/format.ts`
  - function formatCompactSection: (title, lines) => void
  - function truncateText: (text, max) => void
  - function bulletize: (lines) => void
- `src/navigation-evidence.ts` — function snapshotNavigationEvidence: (query) => EvidenceSnapshot
- `src/navigation-intent.ts` — function classifyNavigationIntent: (task, mode) => IntentResult, interface IntentResult
- `src/navigation-planner.ts` — function planNavigation: (query) => NavigationPlan
- `src/plan-format.ts` — function formatNavigationPlan: (plan) => void
- `src/ranking.ts` — function rankContext: (query, limit) => RankContextResult, interface RankContextResult
- `src/reference-format.ts`
  - function groupReferenceHits: (hits, backend, fallback, confidence) => ReferenceFileGroup[]
  - function formatReferenceGroups: (groups) => string[]
  - function enrichReferenceGroup: (group, symbol) => void
- `src/sg-runner.ts`
  - function sgAvailable: () => boolean
  - function sgSearch: (pattern, lang, paths, opts?) => Promise<SgResult>
  - function sgReplaceDry: (pattern, rewrite, lang, paths) => Promise<SgResult>
  - function sgReplaceApply: (pattern, rewrite, lang, paths) => Promise<SgResult>
  - function formatMatches: (matches, isDryRun, showModeIndicator) => string
  - interface SgMatch
- `src/shared-tool-invoker.ts` — function createPiToolInvoker: (pi) => ToolInvoker | undefined, function textToolResult: (content, details, unknown>) => void
- `src/slices.ts`
  - function readFileSlice: (file, startLine, endLine) => void
  - function expandRange: (line, contextLines) => void
  - function sliceSymbolFromFile: (file, request) => void
  - interface SliceRequest
- `src/state.ts`
  - function getState: () => void
  - function rememberMentionedFile: (file) => void
  - function rememberReadFile: (file) => void
  - function rememberQueriedSymbol: (symbol) => void
  - function setLastRankedItems: (items) => void
  - function setLastResolvedDefinition: (definition) => void
  - _...6 more_
- `src/symbol-backends.ts`
  - function detectLangFromPath: (filePath) => string
  - function astGrepSearchParams: (pattern, scope, lang?) => Record<string, unknown>
  - function lspDocumentSymbolParams: (file) => Record<string, unknown>
  - function lspWorkspaceSymbolParams: (symbol, fileHint) => Record<string, unknown>
  - function lspReferencesParams: (definitionLocation) => Record<string, unknown>
  - function findLspCandidates: (symbol, fileHint, invokeTool?) => Promise<SymbolCandidate[]>
  - _...5 more_
- `src/symbol-fallback.ts`
  - function findFileHintCandidates: (symbol, fileHint) => SymbolCandidate[]
  - function findWorkspaceCandidates: (symbol, fileHint?) => SymbolCandidate[]
  - function scanReferences: (symbol, fileHint, limit) => ReferenceHit[]
  - function resolveFileHint: (fileHint) => string[]
  - function listWorkspaceSourceFiles: (root) => string[]
- `src/symbol-normalization.ts`
  - function detectLangFromExt: (ext) => string
  - function normalizeLocation: (value) => LocationLike | null
  - function normalizeRange: (range) => void
  - function normalizeCharacter: (value) => number | undefined
  - function normalizeLineNumber: (value) => number
  - function normalizeFilePath: (value) => string | null
  - _...21 more_
- `src/symbol-reference-resolution.ts`
  - function resolveReferences: (symbol, fileHint, limit, resolveDefinition, invokeTool?) => Promise<ReferenceResolution>
  - interface ReferenceResolution
  - interface DefinitionLocationResolver
- `src/symbol-selection.ts` — function selectBestResult: (symbol, candidates, includeBody, contextLines, backend, rememberReadFile) => void
- `src/symbols.ts`
  - function findDefinition: (params, options) => Promise<DefinitionResult>
  - function findReferences: (params, options) => Promise<ReferenceResult>
  - function getSymbolSlice: (params, options) => Promise<SymbolResult>
- `src/tools.ts` — function registerPiLspTools: (pi) => void
- `src/trace.ts` — function traceCallChain: (params, options) => Promise<TraceResult>

---

# Config

## Environment Variables

- `HOME` **required** — benchmarks/results/extract-pi-usage-from-row.mjs
- `OPENAI_API_KEY` **required** — benchmarks/automation/run-harness-benchmarks.mjs
- `PATH` **required** — benchmarks/automation/run-live-benchmarks.mjs
- `PI_BIN` **required** — benchmarks/automation/run-live-benchmarks.mjs
- `PI_OFFLINE` **required** — benchmarks/automation/run-live-benchmarks.mjs

## Config Files

- `tsconfig.json`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `src/types.ts` — imported by **18** files
- `src/state.ts` — imported by **10** files
- `src/symbol-backends.ts` — imported by **10** files
- `src/format.ts` — imported by **7** files
- `src/symbols.ts` — imported by **5** files
- `src/symbol-fallback.ts` — imported by **4** files
- `test/helpers.ts` — imported by **4** files
- `src/navigation-planner.ts` — imported by **3** files
- `src/ranking.ts` — imported by **3** files
- `src/shared-tool-invoker.ts` — imported by **3** files
- `src/tools.ts` — imported by **3** files
- `src/symbol-normalization.ts` — imported by **3** files
- `src/plan-format.ts` — imported by **2** files
- `src/commands.ts` — imported by **2** files
- `src/navigation-intent.ts` — imported by **2** files
- `src/sg-runner.ts` — imported by **2** files
- `src/tools/shared.ts` — imported by **2** files
- `src/cache.ts` — imported by **2** files
- `src/navigation-evidence.ts` — imported by **1** files
- `src/slices.ts` — imported by **1** files

## Import Map (who imports what)

- `src/types.ts` ← `src/compare.ts`, `src/compare.ts`, `src/navigation-evidence.ts`, `src/navigation-intent.ts`, `src/navigation-planner.ts` +13 more
- `src/state.ts` ← `benchmarks/automation/run-harness-benchmarks.mjs`, `src/compare.ts`, `src/navigation-evidence.ts`, `src/navigation-planner.ts`, `src/ranking.ts` +5 more
- `src/symbol-backends.ts` ← `src/compare.ts`, `src/reference-format.ts`, `src/shared-tool-invoker.ts`, `src/symbol-fallback.ts`, `src/symbol-fallback.ts` +5 more
- `src/format.ts` ← `src/commands.ts`, `src/compare.ts`, `src/plan-format.ts`, `src/symbol-selection.ts`, `src/symbols.ts` +2 more
- `src/symbols.ts` ← `src/commands.ts`, `src/compare.ts`, `src/tools.ts`, `src/trace.ts`, `test/tools.test.ts`
- `src/symbol-fallback.ts` ← `src/symbol-backends.ts`, `src/symbol-backends.ts`, `src/symbol-backends.ts`, `src/symbol-reference-resolution.ts`
- `test/helpers.ts` ← `test/harness.test.ts`, `test/index.test.ts`, `test/planner.test.ts`, `test/tools.test.ts`
- `src/navigation-planner.ts` ← `src/commands.ts`, `src/tools.ts`, `test/planner.test.ts`
- `src/ranking.ts` ← `src/commands.ts`, `src/tools.ts`, `test/ranking.test.ts`
- `src/shared-tool-invoker.ts` ← `src/commands.ts`, `src/tools.ts`, `test/invoker.test.ts`

---

# Test Coverage

> **0%** of routes and models are covered by tests
> 9 test files found

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_