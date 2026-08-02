import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { once } from "node:events";
import { TEAM_DATABASE_BUSY_TIMEOUT_MS, createTeamDatabaseManager } from "./database.js";
import { LATEST_TEAM_DATABASE_VERSION } from "./migrations.js";
import { createProjectStore } from "./project-store.js";
import { TeamService } from "../team-service.js";
import { createTeamBackupManager } from "./backup.js";

describe("team database manager", () => {
  const tempDirs: string[] = [];

  async function createTeamDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "team-database-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("refuses a project id that would escape the team directory", async () => {
    const teamDir = await createTeamDir();
    const manager = createTeamDatabaseManager({ teamDir });

    // Every team RPC carries projectId as an unconstrained z.string() and it lands in a path join,
    // so this is reachable by any authenticated client, not just by a bug in our own callers.
    for (const projectId of [
      "../escape",
      "../../escape",
      "nested/child",
      "/absolute",
      "..",
      "",
      ".hidden",
    ]) {
      expect(() => manager.openProject(projectId)).toThrow(/Invalid project id/);
    }

    expect(existsSync(join(teamDir, "..", "escape.db"))).toBe(false);
    manager.closeAll();
  });

  test("still accepts the project id shapes the daemon actually issues", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });
    // prj_<hex> is what projects.json holds; the dashed form is what tests and fixtures use.
    for (const projectId of ["prj_6417ab69f2b15a9c", "project-1", "proj.1"]) {
      expect(() => manager.openProject(projectId)).not.toThrow();
    }
    manager.closeAll();
  });

  test("opens project databases with the required pragmas and runs migrations", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });
    const db = manager.openProject("proj-1");

    expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(db.prepare("PRAGMA synchronous").get()).toEqual({ synchronous: 1 });
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.prepare("PRAGMA busy_timeout").get()).toEqual({
      timeout: TEAM_DATABASE_BUSY_TIMEOUT_MS,
    });
    expect(db.prepare("PRAGMA user_version").get()).toEqual({
      user_version: LATEST_TEAM_DATABASE_VERSION,
    });

    manager.closeAll();
  });

  test("reuses one cached handle per project", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });

    const first = manager.openProject("proj-1");
    const second = manager.openProject("proj-1");
    const other = manager.openProject("proj-2");

    expect(second).toBe(first);
    expect(other).not.toBe(first);

    manager.closeAll();
  });

  test("rejects two project members sharing one home workspace", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });
    const db = manager.openProject("proj-1");

    db.prepare(
      "INSERT INTO project_members (member_id, home_workspace_id, joined_at) VALUES (?, ?, ?)",
    ).run("mem_1", "ws_1", "2026-07-27T00:00:00.000Z");

    expect(() =>
      db
        .prepare(
          "INSERT INTO project_members (member_id, home_workspace_id, joined_at) VALUES (?, ?, ?)",
        )
        .run("mem_2", "ws_1", "2026-07-27T00:00:01.000Z"),
    ).toThrow(/project_members\.home_workspace_id|UNIQUE constraint failed/i);

    manager.closeAll();
  });

  test("preserves an acknowledged message after a real SIGKILL mid-process", async () => {
    const teamDir = await createTeamDir();
    const scriptPath = join(teamDir, "durability-child.ts");
    await writeFile(
      scriptPath,
      `
import { createTeamDatabaseManager } from ${JSON.stringify(new URL("./database.ts", import.meta.url).href)};
import { createProjectStore } from ${JSON.stringify(new URL("./project-store.ts", import.meta.url).href)};

const teamDir = process.argv[2];
if (!teamDir) {
  throw new Error("Missing team dir");
}
const manager = createTeamDatabaseManager({ teamDir });
const store = createProjectStore(manager.openProject("project-1"));
store.createChannel({
  id: "channel-1",
  name: "general",
  purpose: null,
  createdAt: "2026-07-27T12:00:00.000Z",
  updatedAt: "2026-07-27T12:00:00.000Z",
  archivedAt: null,
});
store.createMessage({
  id: "message-1",
  channelId: "channel-1",
  authorMemberId: "human",
  body: "acknowledged",
  replyToMessageId: null,
  createdAt: "2026-07-27T12:00:01.000Z",
  autoStarted: false,
});
process.stdout.write("ACK\\n");
setInterval(() => {}, 1000);
`,
      "utf8",
    );

    const child = spawn(process.execPath, ["--import", "tsx", scriptPath, teamDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Wait for the child's own acknowledgement, but never wait forever: if the child dies before
    // acknowledging, surface its stderr instead of hanging until the suite timeout. A hang here
    // also skips the cleanup below, which then fails the Windows job with EBUSY rather than
    // pointing at the real problem.
    let stderr = "";
    child.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const acknowledged = await Promise.race([
      once(child.stdout!, "data").then(() => true),
      once(child, "exit").then(() => false),
    ]);
    if (!acknowledged) {
      throw new Error(`Durability child exited before acknowledging the write.\n${stderr}`);
    }

    child.kill("SIGKILL");
    await once(child, "exit");

    const manager = createTeamDatabaseManager({ teamDir });
    const messages = createProjectStore(manager.openProject("project-1")).listMessages({
      channelId: "channel-1",
      cursor: null,
      limit: 10,
    }).messages;

    expect(messages).toEqual([expect.objectContaining({ id: "message-1", body: "acknowledged" })]);

    manager.closeAll();
  });

  // Regression: openDatabase constructs the handle before running pragmas and migrations, so a
  // corrupt file throws with the handle already open. Leaking it is invisible on POSIX but holds
  // the file on Windows, which blocks the very restore FR-042 offers. Asserted by deleting the
  // file, which is what the leak prevents.
  test("a failed open leaves no handle holding the database file", async () => {
    const teamDir = await createTeamDir();
    const manager = createTeamDatabaseManager({ teamDir });
    const projectPath = manager.getProjectPath("project-1");
    manager.openProject("project-1");
    manager.closeAll();

    await writeFile(projectPath, "not sqlite", "utf8");

    const reopened = createTeamDatabaseManager({ teamDir });
    expect(() => reopened.openProject("project-1")).toThrow();
    reopened.closeAll();

    await rm(projectPath, { force: true });
    expect(existsSync(projectPath)).toBe(false);
  });

  test("corrupt project data does not block startup and exposes recovery from the latest snapshot", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "team-corrupt-project-test-"));
    tempDirs.push(paseoHome);
    const teamDir = join(paseoHome, "team");
    const manager = createTeamDatabaseManager({ teamDir });
    const store = createProjectStore(manager.openProject("project-1"));
    store.createChannel({
      id: "channel-1",
      name: "general",
      purpose: null,
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
      archivedAt: null,
    });
    await createTeamBackupManager({
      teamDir,
      now: () => new Date("2026-07-27T12:05:00.000Z"),
    }).snapshotDatabase({
      databaseName: "project-1",
      databasePath: manager.getProjectPath("project-1"),
    });
    manager.closeAll();

    await writeFile(manager.getProjectPath("project-1"), "not sqlite", "utf8");

    const service = new TeamService({ paseoHome });
    const state = await service.getProjectSettingsState("project-1");

    expect(state.settings).toBeNull();
    expect(state.maintenance.recovery).toMatchObject({
      canRestore: true,
      isCorrupt: true,
      latestSnapshotAt: "2026-07-27T12:05:00.000Z",
    });

    const maintenance = await service.restoreProjectFromLatestSnapshot("project-1");
    expect(maintenance.recovery).toMatchObject({
      canRestore: false,
      isCorrupt: false,
      error: null,
    });
    expect(service.getProjectSettings("project-1")).toMatchObject({
      messageRetentionCap: 50_000,
    });

    service.close();
  });

  test("deleting one project removes only that project's team data", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });
    createProjectStore(manager.openProject("project-1")).createChannel({
      id: "channel-1",
      name: "general",
      purpose: null,
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
      archivedAt: null,
    });
    createProjectStore(manager.openProject("project-2")).createChannel({
      id: "channel-2",
      name: "general-2",
      purpose: null,
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
      archivedAt: null,
    });

    manager.deleteProjectData("project-1");

    expect(manager.listProjectIds()).toEqual(["project-2"]);
    expect(createProjectStore(manager.openProject("project-2")).listChannels()).toEqual([
      expect.objectContaining({ id: "channel-2" }),
    ]);

    manager.closeAll();
  });
});
