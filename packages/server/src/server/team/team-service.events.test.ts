import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { SessionOutboundMessage } from "../messages.js";
import { TeamService } from "./team-service.js";
import { TeamSession } from "./team-session.js";

describe("TeamService live events", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("two connected sessions viewing the same project both receive team.message.posted", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "channel-all", "message-1"),
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });

    const emittedA: SessionOutboundMessage[] = [];
    const emittedB: SessionOutboundMessage[] = [];
    const sessionA = new TeamSession({
      service,
      emit: (message) => emittedA.push(message),
    });
    const _sessionB = new TeamSession({
      service,
      emit: (message) => emittedB.push(message),
    });

    await sessionA.handle({
      type: "team.message.post.request",
      requestId: "req-1",
      projectId: "project-1",
      channelId: channel.id,
      body: "hello everyone",
    });

    expect(findByType(emittedA, "team.message.posted")).toEqual({
      type: "team.message.posted",
      payload: {
        projectId: "project-1",
        message: expect.objectContaining({
          id: "message-1",
          channelId: "channel-all",
          body: "hello everyone",
        }),
      },
    });
    expect(findByType(emittedB, "team.message.posted")).toEqual({
      type: "team.message.posted",
      payload: {
        projectId: "project-1",
        message: expect.objectContaining({
          id: "message-1",
          channelId: "channel-all",
          body: "hello everyone",
        }),
      },
    });

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-service-events-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function findByType<TType extends SessionOutboundMessage["type"]>(
  emitted: SessionOutboundMessage[],
  type: TType,
): Extract<SessionOutboundMessage, { type: TType }> | undefined {
  return emitted.find((message) => message.type === type) as
    | Extract<SessionOutboundMessage, { type: TType }>
    | undefined;
}

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
