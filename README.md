# pi-lsp

Thin Pi extension for symbol-level code navigation.

## What this is

`pi-lsp` adds runtime precision on top of Pi's existing tooling.

It helps Pi do these well:
- read exact symbol definitions
- find where symbol is defined
- find where symbol is used
- rank best next files or symbols for current task

It is meant to complement repo-context tools like codesight.

- codesight = repo-level context
- pi-lsp = symbol-level navigation

## What this is not

- not full repo-map system
- not SoulForge replica
- not custom parser/index platform
- not refactor engine in v1

## Planned v1 tools

- `pi_lsp_get_symbol`
- `pi_lsp_find_definition`
- `pi_lsp_find_references`
- `pi_lsp_rank_context`

## Planned v1 commands

- `/symbol <name> [fileHint]`
- `/refs <name> [fileHint]`
- `/rank [task text]`

## Why build this

LLMs often over-read code.

Example bad flow:
- read whole file
- search around manually
- read neighboring files
- waste tokens on irrelevant code

Desired flow:
- find symbol
- read only definition body or small slice
- inspect references if needed
- rank next likely files from current task context

## Design principles

1. Orchestrate first, reinvent last
2. Use existing Pi tools before custom infra
3. Prefer exact code slice over whole-file read
4. Be honest about ambiguity and fallback
5. Keep ranking deterministic
6. Keep cache lightweight

## Backends

Planned backend order:

1. `lsp_navigation`
2. `ast_grep_search`
3. explicit failure with guidance

`pi-lsp` should mostly shape and combine results from these tools.

## Repository docs

Implementation plan:
- `./plan.md`

Review template:
- `./review.md`

## References

Pi extension docs:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`

Pi extension examples:
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/dynamic-tools.ts`
- `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/tools.ts`

Reference repo for prior art:
- `/home/sil/pi-extensions/pi-lens`

## Intended implementation shape

```text
pi-lsp/
  plan.md
  review.md
  README.md
  src/
    index.ts
    tools.ts
    commands.ts
    state.ts
    cache.ts
    ranking.ts
    symbols.ts
    slices.ts
    format.ts
    types.ts
  test/
    helpers.ts
    tools.test.ts
    ranking.test.ts
    cache.test.ts
```

## Suggested first milestone

Build only:
- `pi_lsp_get_symbol`
- `/symbol`
- minimal cache
- tests for exact symbol slicing

Why:
- fastest path to visible value
- lowest complexity
- good base for definition/reference tools later

## Status

Planning only. Implementation not yet started.