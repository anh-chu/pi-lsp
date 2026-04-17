# Changelog

## 0.2.0

- add `pi_lsp_plan_navigation` tool and `/nav` command
- add deterministic planner modules for intent, evidence, bounded next-hop routing, and plan formatting
- extract shared tool invoker for `invokeTool`, `callTool`, and `runTool`
- persist planner-ready session evidence: last resolved definition, top caller files, last planner result
- expand tests with planner, invoker, and index smoke coverage
- update package metadata for publish-ready extension packaging
- rewrite README and add workflow, chooser, claims, and benchmark docs
- add MIT license and CI/release workflows
