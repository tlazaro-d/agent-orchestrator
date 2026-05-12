/**
 * tracker-static-file plugin — reads tickets from a flat JSON file produced by
 * the jira-epic-bootstrap Claude Code skill. Implements the AO Tracker interface
 * with blocker-aware listing and on-disk status persistence.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  atomicWriteFileSync,
  type Tracker,
  type Issue,
  type IssueFilters,
  type IssueUpdate,
  type PluginModule,
  type ProjectConfig,
} from "@aoagents/ao-core";
import type { TicketEntry, StaticFileTrackerConfig, TicketsFile } from "./types.js";

const DEFAULT_BRANCH_PREFIX = "ao/";

function ticketStatusToIssueState(s: TicketEntry["status"]): Issue["state"] {
  switch (s) {
    case "open":
      return "open";
    case "in-progress":
      return "in_progress";
    case "done":
      return "closed";
  }
}

function issueStateToTicketStatus(
  s: NonNullable<IssueUpdate["state"]>,
): TicketEntry["status"] {
  switch (s) {
    case "open":
      return "open";
    case "in_progress":
      return "in-progress";
    case "closed":
      return "done";
  }
}

export function create(config?: Record<string, unknown>): Tracker {
  if (!config || typeof config !== "object") {
    throw new Error(
      "tracker-static-file: config is required and must include ticketsPath",
    );
  }
  const cfg = config as unknown as StaticFileTrackerConfig;
  if (!cfg.ticketsPath || typeof cfg.ticketsPath !== "string") {
    throw new Error("tracker-static-file: config.ticketsPath is required");
  }

  const ticketsPath = cfg.ticketsPath;
  const seedPromptDir = cfg.seedPromptDir ?? path.dirname(ticketsPath);
  const issueUrlBase = cfg.issueUrlBase ?? "";
  const branchPrefix = cfg.branchPrefix ?? DEFAULT_BRANCH_PREFIX;

  function load(): TicketsFile {
    let raw: string;
    try {
      raw = fs.readFileSync(ticketsPath, "utf-8");
    } catch (err) {
      throw new Error(
        `tracker-static-file: failed to read tickets file at ${ticketsPath}: ${(err as Error).message}`,
        { cause: err },
      );
    }
    try {
      return JSON.parse(raw) as TicketsFile;
    } catch (err) {
      throw new Error(
        `tracker-static-file: tickets file is not valid JSON at ${ticketsPath}: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  function find(id: string): TicketEntry {
    const tickets = load();
    const t = tickets.find((x) => x.id === id);
    if (!t) {
      throw new Error(`tracker-static-file: issue not found: ${id}`);
    }
    return t;
  }

  function urlForTicket(t: TicketEntry): string {
    if (issueUrlBase) return issueUrlBase + t.id;
    return `file://${path.resolve(seedPromptDir, t.seedPromptPath)}`;
  }

  function urlForId(id: string): string {
    if (issueUrlBase) return issueUrlBase + id;
    const tickets = load();
    const t = tickets.find((x) => x.id === id);
    if (!t) {
      return `file://${path.resolve(ticketsPath)}#${id}`;
    }
    return urlForTicket(t);
  }

  function toIssue(t: TicketEntry): Issue {
    return {
      id: t.id,
      title: t.title,
      description: "",
      url: urlForTicket(t),
      state: ticketStatusToIssueState(t.status),
      labels: [],
    };
  }

  return {
    name: "static-file",

    async getIssue(identifier: string, _project: ProjectConfig): Promise<Issue> {
      return toIssue(find(identifier));
    },

    async isCompleted(
      identifier: string,
      _project: ProjectConfig,
    ): Promise<boolean> {
      const t = find(identifier);
      const state = ticketStatusToIssueState(t.status);
      return state === "closed" || state === "cancelled";
    },

    issueUrl(identifier: string, _project: ProjectConfig): string {
      return urlForId(identifier);
    },

    branchName(identifier: string, _project: ProjectConfig): string {
      return branchPrefix + identifier.toLowerCase();
    },

    async generatePrompt(
      identifier: string,
      _project: ProjectConfig,
    ): Promise<string> {
      const t = find(identifier);
      const promptPath = path.resolve(seedPromptDir, t.seedPromptPath);
      let body: string;
      try {
        body = await fs.promises.readFile(promptPath, "utf-8");
      } catch (err) {
        throw new Error(
          `tracker-static-file: failed to read seed prompt for ${identifier} at ${promptPath}: ${(err as Error).message}`,
          { cause: err },
        );
      }
      const branch = branchPrefix + identifier.toLowerCase();
      const header =
        `> Branch from \`${t.baseBranch}\`. AO has placed you on agent branch \`${branch}\`.\n\n`;
      return header + body;
    },

    async listIssues(
      filters: IssueFilters,
      _project: ProjectConfig,
    ): Promise<Issue[]> {
      const tickets = load();
      const stateFilter = filters.state ?? "open";
      const statusById = new Map(tickets.map((t) => [t.id, t.status] as const));

      const result: Issue[] = [];
      for (const t of tickets) {
        const issueState = ticketStatusToIssueState(t.status);

        // State filtering
        if (stateFilter === "open") {
          if (issueState !== "open" && issueState !== "in_progress") continue;
        } else if (stateFilter === "closed") {
          if (issueState !== "closed" && issueState !== "cancelled") continue;
        }
        // stateFilter === "all" or undefined: no state restriction

        // Blocker filtering: disabled only when explicitly state="all"
        if (stateFilter !== "all") {
          const allBlockersDone = t.blockers.every(
            (b) => statusById.get(b) === "done",
          );
          if (!allBlockersDone) continue;
        }

        result.push(toIssue(t));
      }

      if (filters.limit && filters.limit > 0) {
        return result.slice(0, filters.limit);
      }
      return result;
    },

    async updateIssue(
      identifier: string,
      update: IssueUpdate,
      _project: ProjectConfig,
    ): Promise<void> {
      if (!update.state) return;

      const tickets = load();
      const idx = tickets.findIndex((t) => t.id === identifier);
      if (idx === -1) {
        throw new Error(
          `tracker-static-file: cannot update — issue not found: ${identifier}`,
        );
      }
      const next: TicketEntry = {
        ...tickets[idx],
        status: issueStateToTicketStatus(update.state),
      };
      tickets[idx] = next;
      // Atomic write via temp-file + rename. agent-orchestrator.yaml's polling
      // loop is single-writer per project, so atomic rename is sufficient and
      // no file lock is needed for v1.
      atomicWriteFileSync(ticketsPath, JSON.stringify(tickets, null, 2) + "\n");
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin module export
// ---------------------------------------------------------------------------

export const manifest = {
  name: "static-file",
  slot: "tracker" as const,
  description:
    "AO Tracker plugin: reads tickets from a static JSON file. Designed to consume the output of the jira-epic-bootstrap Claude Code skill.",
  version: "0.6.0",
};

/**
 * Auto-detect helper. Returns true only if a configured `ticketsPath` exists
 * and is readable. With no config (or no ticketsPath), returns false — this
 * plugin has no implicit "default location" to probe.
 */
export function detect(config?: Record<string, unknown>): boolean {
  if (!config || typeof config !== "object") return false;
  const ticketsPath = (config as { ticketsPath?: unknown }).ticketsPath;
  if (typeof ticketsPath !== "string" || ticketsPath.length === 0) return false;
  try {
    fs.accessSync(ticketsPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export default { manifest, create, detect } satisfies PluginModule<Tracker>;
