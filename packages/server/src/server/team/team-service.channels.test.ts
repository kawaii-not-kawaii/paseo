import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTeamDatabaseManager } from "./storage/database.js";
import { TeamService } from "./team-service.js";

describe("TeamService channel operations", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("creates, lists, updates, and deletes channels, cascading their messages", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "channel-all", "message-1"),
    });

    const created = service.createChannel({
      projectId: "project-1",
      name: "all",
      purpose: "Shared coordination",
      memberIds: [],
    });

    expect(service.listChannels("project-1")).toEqual([
      {
        id: "channel-all",
        name: "all",
        purpose: "Shared coordination",
        memberIds: [],
        createdAt: "2026-07-27T12:00:00.000Z",
        updatedAt: "2026-07-27T12:00:00.000Z",
        archivedAt: null,
      },
    ]);

    const updated = service.updateChannel({
      projectId: "project-1",
      channelId: created.id,
      name: "general",
      purpose: "General coordination",
      memberIds: [],
    });

    expect(updated).toEqual({
      id: "channel-all",
      name: "general",
      purpose: "General coordination",
      memberIds: [],
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
      archivedAt: null,
    });

    const postTeamMessage = service.postMessage.bind(service);
    postTeamMessage({
      projectId: "project-1",
      channelId: created.id,
      authorMemberId: "member-human",
      body: "hello channel",
    });

    expect(service.deleteChannel("project-1", created.id)).toBe("channel-all");
    expect(service.listChannels("project-1")).toEqual([]);

    const dbManager = createTeamDatabaseManager({ teamDir: join(paseoHome, "team") });
    const db = dbManager.openProject("project-1");
    const messageCount = db.prepare("SELECT COUNT(*) AS count FROM messages").get() as {
      count: number;
    };
    expect(messageCount.count).toBe(0);

    dbManager.closeAll();
    service.close();
  });

  test("new channels contain only picked members and new members join no channels", async () => {
    const service = new TeamService({
      paseoHome: await createPaseoHome(),
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-backend", "member-qa", "channel-build"),
    });
    const backend = service.createMember({
      projectId: "project-1",
      name: "Backend",
      provider: "codex",
      homeWorkspaceId: "workspace-backend",
    });
    const qa = service.createMember({
      projectId: "project-1",
      name: "QA",
      provider: "codex",
      homeWorkspaceId: "workspace-qa",
    });

    expect(() => service.createChannel({ projectId: "project-1", name: "old-client" })).toThrow(
      /update the client/i,
    );
    const channel = service.createChannel({
      projectId: "project-1",
      name: "build",
      memberIds: [backend.id],
    });

    expect(channel.memberIds).toEqual([backend.id]);
    expect(
      service.listMembers("project-1").find((member) => member.id === backend.id)?.channelIds,
    ).toEqual([channel.id]);
    expect(
      service.listMembers("project-1").find((member) => member.id === qa.id)?.channelIds,
    ).toEqual([]);

    expect(
      service.updateChannel({
        projectId: "project-1",
        channelId: channel.id,
        memberIds: [qa.id],
      })?.memberIds,
    ).toEqual([qa.id]);

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-service-channels-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
