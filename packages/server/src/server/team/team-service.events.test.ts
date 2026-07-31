import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { SessionOutboundMessage } from "../messages.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import { subscribeTeamMemberLifecycle, TeamSession } from "./team-session.js";
import {
  createWorkspaceRegistryStub,
  FakeAgentManager,
  seedAssignedMember,
} from "./test-support/team-test-fakes.js";

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

  test("one lifecycle subscription broadcasts running and idle transitions to every session", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const agentManager = new FakeAgentManager();
    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: "/repo",
      }),
      logger: createTestLogger(),
    });
    const unsubscribe = subscribeTeamMemberLifecycle(service, lifecycle);
    const emittedA: SessionOutboundMessage[] = [];
    const emittedB: SessionOutboundMessage[] = [];
    const _sessionA = new TeamSession({ service, emit: (message) => emittedA.push(message) });
    const _sessionB = new TeamSession({ service, emit: (message) => emittedB.push(message) });
    const agent = await lifecycle.start({
      projectId: "project-1",
      memberId: "member-reviewer",
    });
    if (!agent) {
      throw new Error("Expected a member runtime");
    }

    agentManager.setAgentLifecycle(agent.id, "running");
    agentManager.setAgentLifecycle(agent.id, "idle");

    expect(agentManager.subscriberCount()).toBe(1);
    for (const emitted of [emittedA, emittedB]) {
      expect(
        emitted
          .filter((message) => message.type === "team.member.changed")
          .map((message) => message.payload.member),
      ).toEqual([
        expect.objectContaining({ id: "member-reviewer", status: "running" }),
        expect.objectContaining({ id: "member-reviewer", status: "idle" }),
      ]);
    }

    unsubscribe();
    service.close();
  });

  test("a member's own post advances its channel cursor", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-30T12:00:00.000Z"),
      createId: sequenceIds("member-human", "channel-all", "message-1"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });
    const postTeamMessage = service.postMessage.bind(service);

    postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: "member-reviewer",
      body: "My review is complete.",
    });

    expect(service.listChannels("project-1", "member-reviewer")).toEqual([
      expect.objectContaining({ id: channel.id, unreadCount: 0 }),
    ]);

    service.close();
  });

  test("lists and advances the human identity's unread cursor", async () => {
    const service = new TeamService({
      paseoHome: await createPaseoHome(),
      now: () => new Date("2026-07-30T12:00:00.000Z"),
      createId: sequenceIds("member-human", "channel-all", "message-1"),
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });
    const postTeamMessage = service.postMessage.bind(service);
    postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: "member-agent",
      body: "new work",
    });

    const emitted: SessionOutboundMessage[] = [];
    const session = new TeamSession({ service, emit: (message) => emitted.push(message) });
    await session.handle({
      type: "team.channel.list.request",
      requestId: "req-list-before",
      projectId: "project-1",
    });
    expect(findByType(emitted, "team.channel.list.response")?.payload.channels).toEqual([
      expect.objectContaining({ id: channel.id, unreadCount: 1 }),
    ]);

    await session.handle({
      type: "team.channel.mark_read.request",
      requestId: "req-read",
      projectId: "project-1",
      channelId: channel.id,
    });
    await session.handle({
      type: "team.channel.list.request",
      requestId: "req-list-after",
      projectId: "project-1",
    });
    const lists = emitted.filter(
      (
        message,
      ): message is Extract<SessionOutboundMessage, { type: "team.channel.list.response" }> =>
        message.type === "team.channel.list.response",
    );
    expect(lists.at(-1)?.payload.channels).toEqual([
      expect.objectContaining({ id: channel.id, unreadCount: 0 }),
    ]);

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
