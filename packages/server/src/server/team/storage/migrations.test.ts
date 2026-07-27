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
});
