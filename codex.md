# Project Context

This is a typescript project using raw-http.


High-impact files (most imported, changes here affect many other files):
- src/ranking.ts (imported by 3 files)
- src/format.ts (imported by 3 files)
- src/state.ts (imported by 3 files)
- src/types.ts (imported by 3 files)
- src/symbols.ts (imported by 2 files)
- src/commands.ts (imported by 2 files)
- src/tools.ts (imported by 2 files)
- src/slices.ts (imported by 1 files)

Read .codesight/wiki/index.md for orientation (WHERE things live). Then read actual source files before implementing.
Read .codesight/CODESIGHT.md for the complete AI context map including all routes, schema, components, libraries, config, middleware, and dependency graph.

## Code exploration tool ladder

Preference order for code exploration. Do not skip steps unless the answer is already obvious.

1. **Structural discovery tools** (e.g., `codesight_*` if available, `find`, `read`) for orientation
2. **code_nav_*** for function-level tracing (find_definition, find_references, get_symbol)
3. **warpgrep_codebase_search** for fuzzy/natural-language questions
4. **grep/find/read** as fallback

## Workflow triggers

Before taking a step, match the situation to the tool:

- **Before debugging a bug:** `code_nav_find_references` on the suspect function to trace callers and usage context.
- **When debugging requires following a call chain:** `code_nav_trace` instead of manually chaining `code_nav_find_references` calls.
- **Before changing a file:** use discovery tools to understand downstream impact.
- **When comparing patterns across files:** `code_nav_compare` for side-by-side implementation analysis.
- **When you hit a multi-step trace:** `code_nav_plan_navigation` to avoid wandering across random files.
- **When a bug touches multiple subsystems:** orient on ONE subsystem with discovery tools first, then `code_nav_trace` across boundaries. Do not explore all subsystems at once.
- **When the symbol name is still uncertain:** discovery tools or `read` first. Never guess variants.
- **When you need the full function body:** `code_nav_get_symbol` with `includeBody: true`.
- **When you only need the file and line:** `code_nav_find_definition` instead of broad reads.
- **When callers or impact are unknown:** `code_nav_find_references` grouped by caller file.
- **When looking for outliers or deviations:** `code_nav_compare` to find implementations that break the common pattern.
- **When ranking already-seen context:** `code_nav_rank_context` only after concrete session evidence exists.

## Wiki articles

Wiki articles tell you WHERE things live. Read them for orientation, then use code-nav to trace the specific symbols they reveal. They are starting points, not implementation sources.
