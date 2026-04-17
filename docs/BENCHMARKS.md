# Benchmarks

Release proof should stay narrow.

## Primary publish comparison

- baseline = Pi + `codesight` + `pi-lens`
- treatment = Pi + `codesight` + `pi-lens` + `pi-lsp`

## Secondary diagnostic comparison

- baseline raw = Pi only
- treatment raw = Pi + `pi-lsp`

## Mandatory commands

```bash
npm run bench:harness:pilot
npm run bench:live:smoke
npm run bench:live:raw:smoke
```

## Gate shape

- Gate A: exact symbol value
- Gate B: reference and impact value
- Gate C: planner routing value
- Gate D: no control regression
- Gate E: headline eligibility

## Current release wording

- current live runs show strongest gains on exact symbol tasks while preserving answer quality
- planner helps choose when to use discovery, exact symbol tools, or raw LSP follow-up
