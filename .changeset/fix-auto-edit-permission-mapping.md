---
"@aoagents/ao-plugin-agent-claude-code": patch
---

fix(agent-claude-code): map `auto-edit` permission to `--permission-mode acceptEdits` (not full bypass)

The `auto-edit` permission mode was advertised in `schema/config.schema.json` and `agent-orchestrator.yaml.example` as a distinct mode, but the agent plugin treated it identically to `permissionless` — both branches of `getLaunchCommand` and `getRestoreCommand` added `--dangerously-skip-permissions`. Anyone who set `permissions: auto-edit` expecting "auto-accept edits, still confirm shell commands" was actually getting full bypass.

`auto-edit` now maps to Claude Code's `--permission-mode acceptEdits`, which is what the name implies: file edits are auto-accepted, but Bash and other shell-level tools still prompt. `permissionless` continues to add `--dangerously-skip-permissions` for callers that want full bypass.

Also updates `agent-orchestrator.yaml.example` to document the corrected mapping and the alternate values.

This is a behavior change for anyone currently relying on `auto-edit`. If you actually wanted full bypass, switch to `permissions: permissionless`.
