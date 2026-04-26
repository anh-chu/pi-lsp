# Workflows

## Repo discovery -> exact symbol

1. `codesight_*` to find subsystem, route, schema, or hot files
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
