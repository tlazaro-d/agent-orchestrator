# @aoagents/ao-plugin-tracker-static-file

Agent Orchestrator (AO) tracker plugin that reads tickets from a static JSON file. Designed to consume the output of the [`jira-epic-bootstrap`](https://github.com/datavant/...) Claude Code skill — but works with any tool that produces `tickets.json` in the documented schema.

## Why this plugin

AO ships first-class trackers for GitHub Issues, Linear, and GitLab. This plugin fills a gap: teams using Jira (or any other tracker without a first-class AO plugin) can produce a JSON snapshot of their work and feed it to AO, with the bootstrap tooling handling per-ticket prompt generation upstream.

## Install

```bash
pnpm add @aoagents/ao-plugin-tracker-static-file
```

## Configure

In your `agent-orchestrator.yaml`:

```yaml
projects:
  my-epic:
    repo: org/repo
    path: ~/projects/repo
    defaultBranch: main
    tracker:
      plugin: static-file
      ticketsPath: ./.agent-orchestrator/EPIC-KEY/tickets.json
      seedPromptDir: ./.agent-orchestrator/EPIC-KEY    # optional, defaults to dirname(ticketsPath)
      issueUrlBase: https://your-tracker.example.com/browse/    # optional, falls back to file:// URLs
      branchPrefix: jt/                                          # optional, defaults to "ao/"
```

The plugin reads `ticketsPath`, then for each ticket reads the seed prompt at `<seedPromptDir>/<ticket.seedPromptPath>`.

## `tickets.json` schema

Top-level: JSON array of `TicketEntry`.

```typescript
interface TicketEntry {
  id: string;             // e.g., "REP-5502"
  title: string;
  status: "open" | "in-progress" | "done";
  baseBranch: string;     // git branch loop work targets
  blockers: string[];     // other ticket ids that must be "done" before this one is claimable
  seedPromptPath: string; // path relative to seedPromptDir
}
```

## Status mapping

| `TicketEntry.status` | AO `Issue.state` |
|---|---|
| `"open"` | `"open"` |
| `"in-progress"` | `"in_progress"` |
| `"done"` | `"closed"` |

`Issue.state: "cancelled"` is never produced by this tracker (`TicketEntry` has no equivalent status).

## Blocker-aware claiming

`listIssues({ state: "open" })` — the default AO uses for its polling loop — **excludes** tickets whose `blockers` array contains any ticket NOT yet `status: "done"`. This naturally serializes work in dependency order without requiring AO to know about the graph.

`listIssues({ state: "all" })` disables blocker filtering — useful for operator visibility (e.g., `ao tracker list --state=all`).

When a ticket is marked `closed` via `updateIssue`, its dependents become claimable on the next poll.

## Atomic state updates

`updateIssue` writes via `atomicWriteFileSync` from `@aoagents/ao-core`: write to a temp file, then `rename` to the target. Single-writer per project (AO's lifecycle manager) — no file lock; concurrent writes from another tool (e.g., a manual `jq` edit while AO is running) follow last-writer-wins semantics.

## Re-running the bootstrap

The upstream `jira-epic-bootstrap` skill is re-runnable. Each run regenerates `tickets.json` from current Jira state. AO picks up the changes on its next poll cycle — no restart needed (every plugin call reads fresh from disk).

## License

MIT
