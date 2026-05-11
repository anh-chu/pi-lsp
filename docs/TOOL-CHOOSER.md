# Tool chooser

Use shortest grounded tool path.

## Code exploration tool ladder

Preference order for code exploration. Do not skip steps unless the answer is already obvious.

1. **Structural discovery tools** (e.g., `codesight_*` if available, `find`, `read`) for orientation
2. **code_nav_*** for function-level tracing (find_definition, find_references, get_symbol)
3. **warpgrep_codebase_search** for fuzzy/natural-language questions
4. **grep/find/read** as fallback

## Workflow triggers

Match the situation to the tool before acting:

- **Before debugging a bug:** `code_nav_find_references` on the suspect function
- **When debugging requires following a call chain:** `code_nav_trace` instead of manually chaining references
- **Before changing a file:** use discovery tools to understand downstream impact
- **When comparing patterns across files:** `code_nav_compare`
- **When you hit a multi-step trace:** `code_nav_plan_navigation`
- **When a bug touches multiple subsystems:** discovery tools to orient on one, then `code_nav_trace` across boundaries
- **When the symbol name is still uncertain:** discovery tools or `read` first
- **When you need the full function body:** `code_nav_get_symbol` with `includeBody: true`
- **When you only need the file and line:** `code_nav_find_definition`
- **When callers or impact are unknown:** `code_nav_find_references`
- **When looking for outliers or deviations:** `code_nav_compare`
- **When ranking already-seen context:** `code_nav_rank_context` only after concrete session evidence exists

## Start here

- unknown repo area, route, schema, env, package, hot file -> discovery tools (e.g., `codesight_*` if available, `find`, `read`)
- exact symbol body -> `code_nav_get_symbol`
- exact definition location -> `code_nav_find_definition`
- usages, callers, impact -> `code_nav_find_references`
- transitive call chain -> `code_nav_trace`
- comparing implementations across files -> `code_nav_compare`
- compound task, mixed uncertainty, route choice -> `code_nav_plan_navigation`
- hover, type, signature, rename, implementation, call hierarchy -> `lsp_navigation`
- diagnostics, autofix, post-edit feedback -> `pi-lens`

## Hard rules

- do not use `code_nav_rank_context` for fresh-session discovery
- do not guess symbol names repeatedly
- do not broad-read whole repo after exact symbol is grounded
- stop and answer once exact result already satisfies question

## Stack order

1. Discovery tools for orientation
2. `code_nav_*` for exact follow-up
3. `lsp_navigation` / `pi-lens` for raw IDE-style semantics and diagnostics
