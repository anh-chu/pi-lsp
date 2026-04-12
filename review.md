# Review

## Scope of this review

Review implementation in `/home/sil/pi-extensions/pi-lsp` against `plan.md`.

Primary questions:
1. Does extension stay thin and orchestration-first?
2. Does it use Pi built-ins before custom parsing/indexing?
3. Does it deliver clear user value through symbol-level precision?
4. Are tool names, schemas, and trigger behavior coherent?
5. Are caching and ranking simple, deterministic, and low-risk?

---

## Summary

_Status:_ pending review

Short verdict:
- pending

Strengths:
- pending

Main issues:
- pending

---

## Review checklist

## Product / scope
- [ ] Project still aligned with `plan.md`
- [ ] No accidental expansion into full repo-map / SoulForge clone
- [ ] `pi-lsp` remains separate from `pi-codesight` concerns
- [ ] v1 only includes intended tools and commands, or deviations are justified

## Architecture
- [ ] Uses existing Pi primitives first: `lsp_navigation`, `ast_grep_search`, `read`
- [ ] Does not rebuild parser/index stack unnecessarily
- [ ] Symbol-level slicing implemented as core value
- [ ] Ranking layer is deterministic and small
- [ ] Cache is simple and invalidated safely

## Tooling / API design
- [ ] `pi_lsp_get_symbol` implemented and useful
- [ ] `pi_lsp_find_definition` implemented or explicitly deferred
- [ ] `pi_lsp_find_references` implemented or explicitly deferred
- [ ] `pi_lsp_rank_context` implemented or explicitly deferred
- [ ] Tool schemas match plan or documented deviation exists
- [ ] `promptSnippet` present where needed
- [ ] `promptGuidelines` present where needed

## Behavior quality
- [ ] Symbol lookup returns minimal relevant slice, not giant file dump
- [ ] Ambiguous symbol results are handled honestly
- [ ] LSP failure falls back clearly to AST search or explicit error
- [ ] References are grouped or summarized usefully
- [ ] Ranking avoids unrelated monorepo noise

## Caching / freshness
- [ ] Cache keys are sensible and bounded
- [ ] File mtime invalidation exists
- [ ] No stale-result success lies
- [ ] No noisy healthy-state notifications

## Testing
- [ ] Unit tests exist for core helpers
- [ ] Integration-ish tests stub backend wrappers cleanly
- [ ] Tests cover ambiguity, fallback, and invalidation paths
- [ ] Tests are not overly coupled to implementation trivia

## Docs
- [ ] `README.md` explains purpose and scope clearly
- [ ] README examples match real tool/command names
- [ ] Deviations from `plan.md` documented

---

## Findings

### Finding 1
- Severity: high | medium | low
- File(s):
- Problem:
- Why it matters:
- Recommendation:

---

### Finding 2
- Severity: high | medium | low
- File(s):
- Problem:
- Why it matters:
- Recommendation:

---

### Finding 3
- Severity: high | medium | low
- File(s):
- Problem:
- Why it matters:
- Recommendation:

---

## Questions for reviewer to answer explicitly

### 1. Is symbol-level read actually better than plain file read?
Answer:
- pending

### 2. Is ranking adding real value, or premature complexity?
Answer:
- pending

### 3. Is fallback behavior honest and predictable?
Answer:
- pending

### 4. Is extension still thin enough to maintain?
Answer:
- pending

---

## Suggested fix order

1. pending
2. pending
3. pending
4. pending

---

## Final verdict

- [ ] approve for next phase
- [ ] approve with small fixes
- [ ] hold for redesign
- [ ] split scope before continuing

Reason:
- pending
