---
"@aoagents/ao-core": minor
"@aoagents/ao-plugin-agent-claude-code": minor
---

feat: add `auto` permission mode (maps to Claude Code `--permission-mode auto`)

`permissions: auto` is now a valid value in `agentConfig.permissions`. For the claude-code agent, it maps to Claude Code's `--permission-mode auto`. This sits between `auto-edit` (which auto-accepts edits but still confirms shell commands) and full bypass.

- Added `"auto"` to `AgentPermissionMode` in `packages/core/src/types.ts`.
- Added `"auto"` to the `agentPermission` enum in `schema/config.schema.json` so YAML config validation accepts it.
- `packages/plugins/agent-claude-code` now emits `--permission-mode auto` when `permissions: auto` is configured.
- Other agent plugins (codex, aider, cursor, kimicode) fall through to default behavior for `auto` — they don't have a direct equivalent of Claude Code's auto mode. Setting `permissions: auto` on a non-claude-code agent is functionally the same as `default`.
- `agent-orchestrator.yaml.example` updated to surface the new mode and document the full claude-code mapping.
