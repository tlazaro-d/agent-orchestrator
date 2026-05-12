/**
 * Schema of the tickets.json file produced by the jira-epic-bootstrap skill.
 * See ~/.claude/skills/jira-epic-bootstrap/docs/specs/2026-05-11-design.md
 * (Bridge from Jira to AO: static-file tracker) for the contract.
 */
export interface TicketEntry {
  /** Issue tracker key, e.g. "REP-5502" */
  id: string;
  /** Human-readable summary */
  title: string;
  /** Status from the upstream tracker. Mapped to Issue.state by the plugin:
   * "open" → "open", "in-progress" → "in_progress", "done" → "closed". */
  status: "open" | "in-progress" | "done";
  /** Git branch the worker should base its work on (passed to the agent via generatePrompt) */
  baseBranch: string;
  /** Other ticket ids this one depends on; not listable until all blockers are status="done" */
  blockers: string[];
  /** Path to the seed prompt markdown file, relative to seedPromptDir */
  seedPromptPath: string;
}

/** Top-level shape of tickets.json — a flat array of TicketEntry */
export type TicketsFile = TicketEntry[];

/** Config passed to create(config). All paths can be relative — resolved against the project dir at call time. */
export interface StaticFileTrackerConfig {
  /** Path to tickets.json (required). */
  ticketsPath: string;
  /** Directory containing seed prompt files. Defaults to dirname(ticketsPath). */
  seedPromptDir?: string;
  /** Base URL for synthesizing issueUrl (id appended). Defaults to "" (empty → file:// URL fallback). */
  issueUrlBase?: string;
  /** Branch name prefix for agent branches. Defaults to "ao/". Final branch: prefix + id.toLowerCase(). */
  branchPrefix?: string;
}
