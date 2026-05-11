# Workflows

## Code exploration tool ladder

Preference order for code exploration. Do not skip steps unless the answer is already obvious.

1. **Structural discovery tools** (e.g., `codesight_*` if available, `find`, `read`) for orientation
2. **code_nav_*** for function-level tracing (find_definition, find_references, get_symbol)
3. **warpgrep_codebase_search** for fuzzy/natural-language questions
4. **grep/find/read** as fallback

## Workflow triggers

Match the situation to the tool before acting:

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

## Repo discovery -> exact symbol

1. Discovery tools (e.g., `codesight_*` if available, `find`, `read`) to find subsystem, route, schema, or hot files
2. `read` current source if exact symbol still not grounded
3. `code_nav_find_definition` or `code_nav_get_symbol`
4. stop if answer already complete

## Compound task

1. `code_nav_plan_navigation`
2. follow only first strong hop
3. rerun planner after new evidence if route changes
4. stop when exact result already answers task

## With pi-lens

- `pi-lsp` chooses next hop
- `pi-lens` handles diagnostics, autofix, hover, signature help, implementation, call hierarchy, rename

## Reference tracing

1. `code_nav_find_references`
2. inspect best caller file only
3. expand to remaining impact files only if first caller not enough
