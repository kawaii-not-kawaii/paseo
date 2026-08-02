import { createRequire } from "node:module";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createProjectStore } from "./project-store.js";
import { createTeamDatabaseManager } from "./database.js";
import { createTeamBackupManager } from "./backup.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => {
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): unknown;
    };
  };
};

describe("team backups", () => {
  const tempDirs: string[] = [];

  async function createTeamDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "team-backup-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("VACUUM INTO produces a readable snapshot while a concurrent write is in flight and keeps only the last 3", async () => {
    const teamDir = await createTeamDir();
    const manager = createTeamDatabaseManager({ teamDir });
    const backupManager = createTeamBackupManager({
      teamDir,
      now: (() => {
        let counter = 0;
        return () => new Date(Date.UTC(2026, 6, 27, 12, 0, counter++));
      })(),
    });
    const projectId = "project-1";
    const projectPath = manager.getProjectPath(projectId);
    const store = createProjectStore(manager.openProject(projectId));

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
      body: "before backup",
      replyToMessageId: null,
      createdAt: "2026-07-27T12:00:01.000Z",
      autoStarted: false,
    });

    const writer = new DatabaseSync(projectPath);
    writer.exec("PRAGMA busy_timeout=5000");
    writer.exec("BEGIN IMMEDIATE");
    writer
      .prepare(
        `INSERT INTO messages (
          id,
          channel_id,
          author_member_id,
          body,
          reply_to_message_id,
          created_at,
          auto_started
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("message-2", "channel-1", "human", "during backup", null, "2026-07-27T12:00:02.000Z", 0);

    try {
      const first = await backupManager.snapshotDatabase({
        databaseName: projectId,
        databasePath: projectPath,
      });
      expect(await stat(first.path)).toBeTruthy();

      const snapshotDb = new DatabaseSync(first.path);
      expect(
        snapshotDb
          .prepare("SELECT COUNT(*) AS count FROM messages WHERE channel_id = ?")
          .get("channel-1"),
      ).toEqual({ count: 1 });
      snapshotDb.close();
    } finally {
      writer.exec("ROLLBACK");
      writer.close();
    }

    for (let index = 0; index < 3; index += 1) {
      await backupManager.snapshotDatabase({ databaseName: projectId, databasePath: projectPath });
    }

    const backupFiles = (await readdir(join(teamDir, "backups")))
      .filter((entry) => entry.startsWith(`${projectId}-`))
      .sort();
    expect(backupFiles).toHaveLength(3);
    expect(backupFiles[0]).toContain("20260727T120001");
    expect(backupFiles[2]).toContain("20260727T120003");

    manager.closeAll();
  });
});
