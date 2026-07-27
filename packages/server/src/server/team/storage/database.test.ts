import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { TEAM_DATABASE_BUSY_TIMEOUT_MS, createTeamDatabaseManager } from "./database.js";
import { LATEST_TEAM_DATABASE_VERSION } from "./migrations.js";

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
});
