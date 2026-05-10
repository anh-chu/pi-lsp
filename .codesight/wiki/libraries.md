# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**22 library files** across 22 modules

## Cache.ts (1 files)

- `src/cache.ts` — getCache, setCache, clearCache, invalidateCache, readFreshCache, getFileMtimeMs, …

## Commands.ts (1 files)

- `src/commands.ts` — registerPiLspCommands

## Compare.ts (1 files)

- `src/compare.ts` — compareImplementations

## Format.ts (1 files)

- `src/format.ts` — formatCompactSection, truncateText, bulletize

## Navigation-evidence.ts (1 files)

- `src/navigation-evidence.ts` — snapshotNavigationEvidence

## Navigation-intent.ts (1 files)

- `src/navigation-intent.ts` — classifyNavigationIntent, IntentResult

## Navigation-planner.ts (1 files)

- `src/navigation-planner.ts` — planNavigation

## Plan-format.ts (1 files)

- `src/plan-format.ts` — formatNavigationPlan

## Ranking.ts (1 files)

- `src/ranking.ts` — rankContext, RankContextResult

## Reference-format.ts (1 files)

- `src/reference-format.ts` — groupReferenceHits, formatReferenceGroups, enrichReferenceGroup

## Sg-runner.ts (1 files)

- `src/sg-runner.ts` — sgAvailable, sgSearch, sgReplaceDry, sgReplaceApply, formatMatches, SgMatch

## Shared-tool-invoker.ts (1 files)

- `src/shared-tool-invoker.ts` — createPiToolInvoker, textToolResult

## Slices.ts (1 files)

- `src/slices.ts` — readFileSlice, expandRange, sliceSymbolFromFile, SliceRequest

## State.ts (1 files)

- `src/state.ts` — getState, rememberMentionedFile, rememberReadFile, rememberQueriedSymbol, setLastRankedItems, setLastResolvedDefinition, …

## Symbol-backends.ts (1 files)

- `src/symbol-backends.ts` — detectLangFromPath, astGrepSearchParams, lspDocumentSymbolParams, lspWorkspaceSymbolParams, lspReferencesParams, findLspCandidates, …

## Symbol-fallback.ts (1 files)

- `src/symbol-fallback.ts` — findFileHintCandidates, findWorkspaceCandidates, scanReferences, resolveFileHint, listWorkspaceSourceFiles

## Symbol-normalization.ts (1 files)

- `src/symbol-normalization.ts` — detectLangFromExt, normalizeLocation, normalizeRange, normalizeCharacter, normalizeLineNumber, normalizeFilePath, …

## Symbol-reference-resolution.ts (1 files)

- `src/symbol-reference-resolution.ts` — resolveReferences, ReferenceResolution, DefinitionLocationResolver

## Symbol-selection.ts (1 files)

- `src/symbol-selection.ts` — selectBestResult

## Symbols.ts (1 files)

- `src/symbols.ts` — findDefinition, findReferences, getSymbolSlice

## Tools.ts (1 files)

- `src/tools.ts` — registerPiLspTools

## Trace.ts (1 files)

- `src/trace.ts` — traceCallChain

---
_Back to [overview.md](./overview.md)_