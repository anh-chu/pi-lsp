# Tool chooser

Use shortest grounded tool path.

## Start here

- unknown repo area, route, schema, env, package, hot file -> `codesight_*`
- exact symbol body -> `pi_lsp_get_symbol`
- exact definition location -> `pi_lsp_find_definition`
- usages, callers, impact -> `pi_lsp_find_references`
- compound task, mixed uncertainty, route choice -> `pi_lsp_plan_navigation`
- hover, type, signature, rename, implementation, call hierarchy -> `lsp_navigation`
- diagnostics, autofix, post-edit feedback -> `pi-lens`

## Hard rules

- do not use `pi_lsp_rank_context` for fresh-session discovery
- do not guess symbol names repeatedly
- do not broad-read whole repo after exact symbol is grounded
- stop and answer once exact result already satisfies question

## Stack order

1. `codesight_*` for discovery
2. `pi_lsp_*` for exact follow-up
3. `lsp_navigation` / `pi-lens` for raw IDE-style semantics and diagnostics
