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

_Status:_ reviewed

Short verdict:
- approve with small fixes

Strengths:
- core v1 value now real: symbol slice, definition lookup, references lookup
- commands stay thin in `src/commands.ts`
- tool registration stays mostly declarative in `src/tools.ts`
- shared navigation engine lives in `src/symbols.ts`
- ambiguity and failure handling are explicit instead of fake success
- tests moved from scaffold checks to behavior checks
- cache integration remains lightweight and bounded

Main issues:
- runtime Pi tool payload names may not match actual built-in tool schemas
- backend labels overclaim `lsp` in some fallback-only paths
- `src/symbols.ts` now carries too much responsibility
- fallback reference search is text-level and should advertise lower confidence more clearly
- README status section still says planning-only, now stale

---

## Review checklist

## Product / scope
- [x] Project still aligned with `plan.md`
- [x] No accidental expansion into full repo-map / SoulForge clone
- [x] `pi-lsp` remains separate from `pi-codesight` concerns
- [x] v1 only includes intended tools and commands, or deviations are justified

## Architecture
- [~] Uses existing Pi primitives first: `lsp_navigation`, `ast_grep_search`, `read`
- [x] Does not rebuild parser/index stack unnecessarily
- [x] Symbol-level slicing implemented as core value
- [x] Ranking layer is deterministic and small
- [x] Cache is simple and invalidated safely

## Tooling / API design
- [x] `pi_lsp_get_symbol` implemented and useful
- [x] `pi_lsp_find_definition` implemented or explicitly deferred
- [x] `pi_lsp_find_references` implemented or explicitly deferred
- [x] `pi_lsp_rank_context` implemented or explicitly deferred
- [~] Tool schemas match plan or documented deviation exists
- [x] `promptSnippet` present where needed
- [x] `promptGuidelines` present where needed

## Behavior quality
- [x] Symbol lookup returns minimal relevant slice, not giant file dump
- [x] Ambiguous symbol results are handled honestly
- [~] LSP failure falls back clearly to AST search or explicit error
- [~] References are grouped or summarized usefully
- [x] Ranking avoids unrelated monorepo noise

## Caching / freshness
- [x] Cache keys are sensible and bounded
- [x] File mtime invalidation exists
- [~] No stale-result success lies
- [x] No noisy healthy-state notifications

## Testing
- [x] Unit tests exist for core helpers
- [x] Integration-ish tests stub backend wrappers cleanly
- [~] Tests cover ambiguity, fallback, and invalidation paths
- [x] Tests are not overly coupled to implementation trivia

## Docs
- [~] `README.md` explains purpose and scope clearly
- [x] README examples match real tool/command names
- [ ] Deviations from `plan.md` documented

Legend:
- `[x]` yes
- `[ ]` no
- `[~]` partial / risk remains

---

## Findings

### Finding 1
- Severity: high
- File(s): `src/symbols.ts`
- Problem: Built-in tool invocation payloads appear mismatched with actual Pi tool schemas. Code calls `lsp_navigation` with keys like `action`, `file`, `path`, `uri`, while current Pi tool spec expects `operation`, `filePath`, `line`, `character`. Code calls `ast_grep_search` with `path`, while spec expects `paths`.
- Why it matters: If runtime Pi does not normalize these aliases, real LSP/AST paths may fail silently and implementation will fall back to local scans. That would reduce precision and make backend labels inaccurate.
- Recommendation: Verify against real Pi runtime. Change payload keys to canonical names from tool spec. Add integration tests with fake invoker asserting exact request shape.

---

### Finding 2
- Severity: medium
- File(s): `src/symbols.ts`, `test/tools.test.ts`
- Problem: Backend reporting can overclaim `lsp`. Example: in no-`invokeTool` path, `findLspCandidates()` falls back to local file/workspace scans, but `getSymbolSlice()` still records backend `lsp`. `findReferences()` also uses `const backend: BackendName = lspHits || params.file ? 'lsp' : 'ast';`, which marks any file-hinted fallback result as `lsp`.
- Why it matters: Plan requires honest names and clear fallback reporting. User should know when result came from semantic navigation versus heuristic scanning.
- Recommendation: Track actual source of result separately from lookup phase name. Return `backend: 'fallback'` or `backend: 'ast'` when built-in tools were not used. Add explicit tests for backend honesty.

---

### Finding 3
- Severity: medium
- File(s): `src/symbols.ts`
- Problem: Core module now mixes orchestration, file discovery, regex declaration parsing, candidate ranking, AST/LSP response normalization, reference scanning, and output shaping in one large file.
- Why it matters: Current code works, but future fixes will get harder. Main risk is accidental regressions in result honesty and fallback precedence.
- Recommendation: Split into small modules after runtime payload issue fixed. Candidate split: `backends/lsp.ts`, `backends/fallback.ts`, `normalize.ts`, `references.ts`, `candidates.ts`.

---

### Finding 4
- Severity: medium
- File(s): `src/symbols.ts`
- Problem: Reference lookup fallback is plain workspace/file scan using regex line matches. Output lists hits but does not group by file, and confidence downgrade is mostly implicit.
- Why it matters: Plan asked for grouped references and lower-confidence marking when fallback path used. Current output useful, but not fully aligned.
- Recommendation: Group hits by file in formatted output and add `confidence`/`fallbackUsed` details. Consider excluding obvious declaration-only lines when user asked for usages.

---

### Finding 5
- Severity: low
- File(s): `README.md`
- Problem: README says `Status` = `Planning only. Implementation not yet started.`
- Why it matters: Repo docs now misrepresent project state and can mislead next agent.
- Recommendation: Update README to reflect implemented v1 milestone state and known limitations.

---

## Questions for reviewer to answer explicitly

### 1. Is symbol-level read actually better than plain file read?
Answer:
- yes
- evidence: `getSymbolSlice()` now returns exact declaration/body slice via `sliceSymbolFromFile()` and tests verify it avoids unrelated top-of-file lines
- result is materially better than scaffold behavior

### 2. Is ranking adding real value, or premature complexity?
Answer:
- acceptable, not overbuilt
- ranking remains small and deterministic
- main value still comes from symbol/definition/reference paths, which is correct priority

### 3. Is fallback behavior honest and predictable?
Answer:
- partially
- ambiguity and no-match paths are honest
- backend labels are not always honest yet
- fallback invocation path needs runtime verification

### 4. Is extension still thin enough to maintain?
Answer:
- mostly yes
- extension avoided custom index/database and kept commands/tools thin
- but `src/symbols.ts` is now too dense and should be decomposed next

---

## Suggested fix order

1. Fix Pi built-in tool payload names and verify in real runtime
2. Fix backend honesty labels and add tests for no-`invokeTool` fallback cases
3. Improve reference output grouping/confidence markers
4. Update README and document deviations from `plan.md`

---

## Final verdict

- [ ] approve for next phase
- [x] approve with small fixes
- [ ] hold for redesign
- [ ] split scope before continuing

Reason:
- project now delivers real v1 user value
- tests and load check pass
- no scope explosion
- but runtime integration correctness with actual Pi tool schemas must be verified before calling implementation fully done
