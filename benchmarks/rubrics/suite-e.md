# Suite E rubric — control tasks

## Goal
Check that treatment does not add unnecessary overhead on tasks where pi-lsp should not matter.

## Quality score (0-2)
- 0 = wrong or overcomplicated
- 1 = basically correct but noisy
- 2 = correct and efficient

## What to watch for
- unnecessary pi_lsp tool calls
- higher turn count without quality benefit
- broad over-navigation for simple README or summary tasks

For `E-01`, full score requires summary to stay grounded in `pi-lsp/README.md` and avoid confusing project with upstream `@mariozechner/pi-coding-agent` docs or dependency READMEs. Generic summaries of Pi itself should score at most `1`, and wrong-project summaries should score `0`.
