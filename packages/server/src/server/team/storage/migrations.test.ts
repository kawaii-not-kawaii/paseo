import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { LATEST_TEAM_DATABASE_VERSION, migrateDatabase } from "./migrations.js";

describe("team storage migrations", () => {
  const tempDirs: string[] = [];

  async function createDbPath(name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "team-storage-migrations-"));
    tempDirs.push(dir);
    return join(dir, `${name}.db`);
  }

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("migrates a fresh database to the latest version and is idempotent on reopen", async () => {
    const dbPath = await createDbPath("project");

    const firstOpen = new DatabaseSync(dbPath);
    migrateDatabase(firstOpen, "project");
    expect(firstOpen.prepare("PRAGMA user_version").get()).toEqual({
      user_version: LATEST_TEAM_DATABASE_VERSION,
    });
    firstOpen.close();

    const reopened = new DatabaseSync(dbPath);
    migrateDatabase(reopened, "project");
    expect(reopened.prepare("PRAGMA user_version").get()).toEqual({
      user_version: LATEST_TEAM_DATABASE_VERSION,
    });
    reopened.close();
  });

  test("refuses a database created by newer code", async () => {
    const dbPath = await createDbPath("future");

    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA user_version = ${LATEST_TEAM_DATABASE_VERSION + 1}`);

    expect(() => migrateDatabase(db, "project")).toThrow(/newer team project database version/i);

    db.close();
  });

  test("backfills existing channels with every assigned member", async () => {
    const dbPath = await createDbPath("membership-backfill");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE project_members (
        member_id TEXT PRIMARY KEY,
        home_workspace_id TEXT,
        joined_at TEXT NOT NULL
      );
      CREATE TABLE channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        purpose TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      INSERT INTO project_members VALUES
        ('member-backend', 'workspace-backend', '2026-07-01T00:00:00.000Z'),
        ('member-qa', 'workspace-qa', '2026-07-02T00:00:00.000Z');
      INSERT INTO channels VALUES
        ('channel-design', 'design', NULL, '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z', NULL),
        ('channel-build', 'build', NULL, '2026-07-04T00:00:00.000Z', '2026-07-04T00:00:00.000Z', NULL);
      PRAGMA user_version = 3;
    `);

    migrateDatabase(db, "project");

    expect(
      db
        .prepare("SELECT channel_id, member_id FROM channel_members ORDER BY channel_id, member_id")
        .all(),
    ).toEqual([
      { channel_id: "channel-build", member_id: "member-backend" },
      { channel_id: "channel-build", member_id: "member-qa" },
      { channel_id: "channel-design", member_id: "member-backend" },
      { channel_id: "channel-design", member_id: "member-qa" },
    ]);

    db.prepare("DELETE FROM channels WHERE id = ?").run("channel-build");
    expect(
      db.prepare("SELECT member_id FROM channel_members WHERE channel_id = ?").all("channel-build"),
    ).toEqual([]);

    db.close();
  });
});
