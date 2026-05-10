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
- `src/workspace-path.ts` — imported by **3** files
- `src/code-context.ts` — imported by **3** files
- `src/tools.ts` — imported by **3** files
- `src/symbol-normalization.ts` — imported by **3** files
- `src/plan-format.ts` — imported by **2** files
- `src/commands.ts` — imported by **2** files
- `src/navigation-intent.ts` — imported by **2** files
- `src/sg-runner.ts` — imported by **2** files
- `src/tools/shared.ts` — imported by **2** files
- `src/cache.ts` — imported by **2** files

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
