import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyTeamMessageRetention } from "./retention.js";
import { createTeamDatabaseManager } from "./storage/database.js";
import { createProjectStore } from "./storage/project-store.js";

describe("team retention", () => {
  const tempDirs: string[] = [];

  async function createTeamDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "team-retention-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("prunes messages beyond the project cap oldest-first on start and records the pruned count", async () => {
    const manager = createTeamDatabaseManager({ teamDir: await createTeamDir() });
    const store = createProjectStore(manager.openProject("project-1"));
    store.createChannel({
      id: "channel-1",
      name: "general",
      purpose: null,
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
      archivedAt: null,
    });
    store.updateProjectSettings({
      ...store.getProjectSettings(),
      messageRetentionCap: 2,
    });
    for (let index = 1; index <= 4; index += 1) {
      store.createMessage({
        id: `message-${index}`,
        channelId: "channel-1",
        authorMemberId: "human",
        body: `message ${index}`,
        replyToMessageId: null,
        createdAt: `2026-07-27T12:00:0${index}.000Z`,
        autoStarted: false,
      });
    }

    const result = applyTeamMessageRetention({
      listProjectIds: () => manager.listProjectIds(),
      openProject: (projectId) => manager.openProject(projectId),
      now: () => new Date("2026-07-27T13:00:00.000Z"),
    });

    expect(result).toEqual([{ projectId: "project-1", prunedMessageCount: 2 }]);
    expect(
      store.listMessages({ channelId: "channel-1", cursor: null, limit: 10 }).messages,
    ).toEqual([
      expect.objectContaining({ id: "message-4" }),
      expect.objectContaining({ id: "message-3" }),
    ]);
    expect(store.getRetentionStatus()).toEqual({
      lastPrunedAt: "2026-07-27T13:00:00.000Z",
      lastPrunedMessageCount: 2,
    });

    manager.closeAll();
  });
});
