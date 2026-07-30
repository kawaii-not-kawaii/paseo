import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { createTeamDatabaseManager } from "./database.js";
import { createProjectStore } from "./project-store.js";

describe("project store", () => {
  const tempDirs: string[] = [];

  async function createTeamDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "team-project-store-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("pages channel messages backward without rereading rows and uses the composite index", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });
    const db = manager.openProject("proj-1");
    const store = createProjectStore(db);

    db.prepare(
      "INSERT INTO channels (id, name, purpose, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      "chn_1",
      "general",
      "coordination",
      "2026-07-27T00:00:00.000Z",
      "2026-07-27T00:00:00.000Z",
      null,
    );

    const inserted: Array<{ id: string; createdAt: string }> = [];
    const insertMessage = db.prepare(
      "INSERT INTO messages (id, channel_id, author_member_id, body, reply_to_message_id, created_at, auto_started) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    db.exec("BEGIN");
    try {
      for (let index = 0; index < 10_000; index += 1) {
        const id = `msg_${String(index).padStart(5, "0")}`;
        const createdAt = new Date(
          Date.UTC(2026, 6, 27, 0, 0, Math.floor(index / 10)),
        ).toISOString();
        inserted.push({ id, createdAt });
        insertMessage.run(id, "chn_1", "mem_1", `message ${index}`, null, createdAt, 0);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const expectedIds = [...inserted]
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      )
      .map((message) => message.id);

    const readIds: string[] = [];
    let cursor: string | null = null;

    while (true) {
      const page = store.listMessages({ channelId: "chn_1", cursor, limit: 137 });
      if (page.messages.length === 0) {
        break;
      }
      readIds.push(...page.messages.map((message) => message.id));
      cursor = page.nextCursor;
      if (!cursor) {
        break;
      }
    }

    expect(readIds).toEqual(expectedIds);
    expect(new Set(readIds)).toHaveLength(10_000);

    const plan = db
      .prepare(`
        EXPLAIN QUERY PLAN
        SELECT id, channel_id, author_member_id, body, reply_to_message_id, created_at, auto_started
          FROM messages
         WHERE channel_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?
      `)
      .all("chn_1", 137) as Array<{ detail: string }>;

    expect(plan.some((row) => row.detail.includes("messages_channel_created_id_desc"))).toBe(true);

    manager.closeAll();
  });

  test("persists unread counts independently for each identity", async () => {
    const teamDir = await createTeamDir();
    const manager = createTeamDatabaseManager({ teamDir });
    const store = createProjectStore(manager.openProject("proj-1"));
    const createdAt = "2026-07-30T12:00:00.000Z";
    store.createChannel({
      id: "chn_1",
      name: "general",
      purpose: null,
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
    });

    store.markChannelRead("chn_1", "human-1", createdAt);
    store.createMessage({
      id: "msg_1",
      channelId: "chn_1",
      authorMemberId: "member-1",
      body: "first",
      replyToMessageId: null,
      createdAt,
      autoStarted: false,
    });
    store.createMessage({
      id: "msg_2",
      channelId: "chn_1",
      authorMemberId: "member-1",
      body: "second",
      replyToMessageId: null,
      createdAt,
      autoStarted: false,
    });

    expect(store.listChannelUnreadCounts("human-1")).toEqual(new Map([["chn_1", 2]]));
    expect(store.listChannelUnreadCounts("human-2")).toEqual(new Map([["chn_1", 2]]));

    store.markChannelRead("chn_1", "human-1", "2026-07-30T12:01:00.000Z");
    expect(store.listChannelUnreadCounts("human-1")).toEqual(new Map([["chn_1", 0]]));
    expect(store.listChannelUnreadCounts("human-2")).toEqual(new Map([["chn_1", 2]]));

    manager.closeAll();
    const reopened = createTeamDatabaseManager({ teamDir });
    expect(
      createProjectStore(reopened.openProject("proj-1")).listChannelUnreadCounts("human-1"),
    ).toEqual(new Map([["chn_1", 0]]));
    reopened.closeAll();
  });
});
