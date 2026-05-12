import { describe, it, expect, beforeEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import plugin, { create, manifest, detect, create as namedCreate } from "../index.js";
import type { ProjectConfig } from "@aoagents/ao-core";

const FIXTURES = path.join(__dirname, "fixtures");

// Minimal ProjectConfig — the plugin only uses .defaultBranch (and ignores most of it for now).
const project: ProjectConfig = {
  name: "test",
  repo: "owner/repo",
  path: FIXTURES,
  defaultBranch: "main",
} as ProjectConfig;

describe("tracker-static-file: getIssue", () => {
  it("reads a single issue from tickets.json", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json"), seedPromptDir: FIXTURES });
    const issue = await tracker.getIssue("REP-1", project);
    expect(issue.id).toBe("REP-1");
    expect(issue.title).toBe("Test ticket");
    expect(issue.state).toBe("open");
  });

  it("maps tickets.json status to Issue.state", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-with-blockers.json"), seedPromptDir: FIXTURES });
    const open = await tracker.getIssue("REP-2", project);     // status "open"
    const done = await tracker.getIssue("REP-1", project);     // status "done"
    expect(open.state).toBe("open");
    expect(done.state).toBe("closed");
  });

  it("throws when the issue does not exist", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json"), seedPromptDir: FIXTURES });
    await expect(tracker.getIssue("REP-DOES-NOT-EXIST", project)).rejects.toThrow();
  });
});

describe("tracker-static-file: isCompleted", () => {
  it("returns true for status=done (mapped to state=closed)", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-with-blockers.json"), seedPromptDir: FIXTURES });
    expect(await tracker.isCompleted("REP-1", project)).toBe(true);
    expect(await tracker.isCompleted("REP-2", project)).toBe(false);
  });
});

describe("tracker-static-file: issueUrl + branchName", () => {
  it("synthesizes issueUrl from issueUrlBase config", () => {
    const tracker = create({
      ticketsPath: path.join(FIXTURES, "tickets-minimal.json"),
      issueUrlBase: "https://datavant.atlassian.net/browse/",
    });
    expect(tracker.issueUrl("REP-1", project)).toBe("https://datavant.atlassian.net/browse/REP-1");
  });

  it("falls back to file:// URL of the seed prompt when no issueUrlBase configured", () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json"), seedPromptDir: FIXTURES });
    const url = tracker.issueUrl("REP-1", project);
    expect(url.startsWith("file://")).toBe(true);
    expect(url).toContain("prompts/REP-1.md");
  });

  it("derives branchName as branchPrefix + lowercased id", () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json") });
    expect(tracker.branchName("REP-1", project)).toBe("ao/rep-1");
  });

  it("honors custom branchPrefix", () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json"), branchPrefix: "jt/" });
    expect(tracker.branchName("REP-1", project)).toBe("jt/rep-1");
  });
});

describe("tracker-static-file: generatePrompt", () => {
  it("returns the seed prompt file contents", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json"), seedPromptDir: FIXTURES });
    const prompt = await tracker.generatePrompt("REP-1", project);
    expect(prompt).toContain("# Seed prompt: REP-1");
    expect(prompt).toContain("Implement the test ticket");
  });

  it("includes the ticket's baseBranch as guidance in the prompt", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json"), seedPromptDir: FIXTURES });
    const prompt = await tracker.generatePrompt("REP-1", project);
    expect(prompt).toContain("main"); // tickets-minimal.json has baseBranch: "main"
  });
});

describe("tracker-static-file: listIssues with blocker filtering", () => {
  it("default state filter is open (omitted filter behaves like state='open')", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-with-blockers.json"), seedPromptDir: FIXTURES });
    const issues = await tracker.listIssues!({}, project);
    expect(issues.map(i => i.id)).toEqual(["REP-2"]);
    // REP-1 is closed (excluded by default state="open"); REP-3 is blocked by REP-2 (excluded by blocker filter)
  });

  it("filters by state when state='open'", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-with-blockers.json"), seedPromptDir: FIXTURES });
    const issues = await tracker.listIssues!({ state: "open" }, project);
    expect(issues.map(i => i.id)).toEqual(["REP-2"]); // REP-1 is closed; REP-3 is blocked
  });

  it("includes blocked issues when state='all'", async () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-with-blockers.json"), seedPromptDir: FIXTURES });
    const issues = await tracker.listIssues!({ state: "all" }, project);
    // state="all" disables blocker filtering — operator sees the full graph
    expect(issues.map(i => i.id).sort()).toEqual(["REP-1", "REP-2", "REP-3"].sort());
  });
});

describe("tracker-static-file: updateIssue", () => {
  let tmpDir: string;
  let ticketsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-tracker-static-file-"));
    ticketsPath = path.join(tmpDir, "tickets.json");
    fs.writeFileSync(ticketsPath, JSON.stringify([
      {"id":"REP-1","title":"A","status":"open","baseBranch":"main","blockers":[],"seedPromptPath":"REP-1.md"},
      {"id":"REP-2","title":"B","status":"open","baseBranch":"main","blockers":["REP-1"],"seedPromptPath":"REP-2.md"},
    ]));
    fs.writeFileSync(path.join(tmpDir, "REP-1.md"), "# REP-1\n");
    fs.writeFileSync(path.join(tmpDir, "REP-2.md"), "# REP-2\n");
  });

  it("marks an issue closed via updateIssue and persists to disk", async () => {
    const tracker = create({ ticketsPath, seedPromptDir: tmpDir });
    await tracker.updateIssue!("REP-1", { state: "closed" }, project);
    const after = await tracker.getIssue("REP-1", project);
    expect(after.state).toBe("closed");
    const onDisk = JSON.parse(fs.readFileSync(ticketsPath, "utf-8"));
    expect(onDisk.find((t: { id: string }) => t.id === "REP-1").status).toBe("done");
  });

  it("does not leave a temp file behind after a successful updateIssue", async () => {
    const tracker = create({ ticketsPath, seedPromptDir: tmpDir });
    await tracker.updateIssue!("REP-1", { state: "closed" }, project);
    const stragglers = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith("tickets.json.") || f.includes(".tmp."));
    expect(stragglers).toEqual([]);
  });

  it("unblocks REP-2 after REP-1 is closed (re-read via listIssues)", async () => {
    const tracker = create({ ticketsPath, seedPromptDir: tmpDir });
    const before = await tracker.listIssues!({ state: "open" }, project);
    expect(before.map(i => i.id)).toEqual(["REP-1"]);
    await tracker.updateIssue!("REP-1", { state: "closed" }, project);
    const after = await tracker.listIssues!({ state: "open" }, project);
    expect(after.map(i => i.id)).toEqual(["REP-2"]);
  });
});

describe("tracker-static-file: name", () => {
  it("returns 'static-file'", () => {
    const tracker = create({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json") });
    expect(tracker.name).toBe("static-file");
  });
});

describe("plugin module exports", () => {
  it("manifest has correct shape", () => {
    expect(manifest.name).toBe("static-file");
    expect(manifest.slot).toBe("tracker");
    expect(manifest.description).toContain("static");
    expect(manifest.version).toBeTruthy();
  });

  it("default export bundles manifest + create + detect", () => {
    expect(plugin.manifest).toBe(manifest);
    expect(plugin.create).toBe(namedCreate);
    expect(plugin.detect).toBe(detect);
  });

  it("detect returns false when no config provided", () => {
    expect(detect!()).toBe(false);
  });

  it("detect returns false when ticketsPath does not exist", () => {
    expect(detect!({ ticketsPath: "/nonexistent/path/tickets.json" })).toBe(false);
  });

  it("detect returns true when ticketsPath exists and is readable", () => {
    expect(detect!({ ticketsPath: path.join(FIXTURES, "tickets-minimal.json") })).toBe(true);
  });
});
