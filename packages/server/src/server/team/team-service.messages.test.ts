import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeamMessagePostRequestSchema } from "@getpaseo/protocol/team/rpc-schemas";
import { afterEach, describe, expect, test } from "vitest";
import { createTeamDatabaseManager } from "./storage/database.js";
import { TeamService } from "./team-service.js";

describe("TeamService message operations", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("posts a message and extracts @name mentions in an explicit post-validation pass", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "channel-all", "message-1"),
    });

    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });

    const request = TeamMessagePostRequestSchema.parse({
      type: "team.message.post.request",
      requestId: "req-1",
      projectId: "project-1",
      channelId: channel.id,
      body: "Hi @Reviewer, please review this.",
    });

    const postTeamMessage = service.postMessage.bind(service);
    const created = postTeamMessage({
      projectId: request.projectId,
      channelId: request.channelId,
      authorMemberId: "member-human",
      body: request.body,
    });

    expect(created.mentionMemberIds).toEqual([reviewer.id]);

    const dbManager = createTeamDatabaseManager({ teamDir: join(paseoHome, "team") });
    const db = dbManager.openProject("project-1");
    const mentions = db
      .prepare(
        "SELECT message_id, member_id FROM message_mentions WHERE message_id = ? ORDER BY member_id ASC",
      )
      .all(created.id) as Array<{ message_id: string; member_id: string }>;
    expect(mentions).toEqual([{ message_id: "message-1", member_id: reviewer.id }]);

    dbManager.closeAll();
    service.close();
  });

  test("fails loudly when a mentioned member is not assigned to the project", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-outsider", "channel-all"),
    });

    service.createMember({
      projectId: "other-project",
      name: "Outsider",
      description: "Works elsewhere",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-outsider",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });

    const postTeamMessage = service.postMessage.bind(service);
    expect(() =>
      postTeamMessage({
        projectId: "project-1",
        channelId: channel.id,
        authorMemberId: "member-human",
        body: "Hi @Outsider, can you take this?",
      }),
    ).toThrowError("Mentioned member @Outsider is not assigned to project project-1.");

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-service-messages-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
