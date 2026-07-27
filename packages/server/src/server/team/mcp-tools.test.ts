import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ManagedAgent } from "../agent/agent-manager.js";
import { createPaseoToolCatalog } from "../agent/tools/paseo-tools.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { afterEach, describe, expect, test } from "vitest";
import { buildTeamAgentLabels } from "./member-lifecycle.js";
import { setConfiguredTeamServiceForTests } from "./bootstrap.js";
import { TeamService } from "./team-service.js";

describe("team MCP tools", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    setConfiguredTeamServiceForTests(null);
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("team_post derives project scope from the calling member and never accepts it as a parameter", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "channel-all", "message-1"),
    });
    setConfiguredTeamServiceForTests(service);

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
    });
    service.createChannel({ projectId: "project-1", name: "all" });

    const catalog = createCatalog(
      createCallerAgent({
        agentId: "agent-reviewer",
        projectId: "project-1",
        memberId: member.id,
      }),
    );
    const tool = catalog.getTool("team_post");
    if (!tool) {
      throw new Error("team_post was not registered");
    }

    const parsed = await tool.inputSchema?.safeParseAsync?.({
      channel: "all",
      body: "hello",
      projectId: "project-2",
    });
    expect(parsed?.success).toBe(false);

    const result = await catalog.executeTool("team_post", {
      channel: "all",
      body: "hello from reviewer",
    });

    expect(result.structuredContent).toEqual({
      messageId: "message-1",
      channelId: "channel-all",
    });

    service.close();
  });

  test("team_read pages messages and resolves author names", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: sequenceTimes("2026-07-27T12:00:00.000Z", "2026-07-27T12:01:00.000Z"),
      createId: sequenceIds(
        "member-human",
        "member-reviewer",
        "channel-all",
        "message-2",
        "message-1",
      ),
    });
    setConfiguredTeamServiceForTests(service);

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });
    const postTeamMessage = service.postMessage.bind(service);
    postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: member.id,
      body: "Latest",
    });
    postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: "member-human",
      body: "Earlier",
    });

    const catalog = createCatalog(
      createCallerAgent({
        agentId: "agent-reviewer",
        projectId: "project-1",
        memberId: member.id,
      }),
    );

    const firstPage = await catalog.executeTool("team_read", { channel: "all", limit: 1 });
    expect(firstPage.structuredContent).toEqual({
      messages: [
        expect.objectContaining({
          body: "Latest",
          authorName: "Reviewer",
        }),
      ],
      nextCursor: expect.any(String),
    });

    const nextCursor = (firstPage.structuredContent as { nextCursor: string }).nextCursor;
    const secondPage = await catalog.executeTool("team_read", {
      channel: "all",
      limit: 1,
      before: nextCursor,
    });
    expect(secondPage.structuredContent).toEqual({
      messages: [
        expect.objectContaining({
          body: "Earlier",
          authorName: "Human",
        }),
      ],
      nextCursor: expect.any(String),
    });

    service.close();
  });

  test("team_roster includes the human identity so members know who to mention when escalating", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });
    setConfiguredTeamServiceForTests(service);

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
    });
    const catalog = createCatalog(
      createCallerAgent({
        agentId: "agent-reviewer",
        projectId: "project-1",
        memberId: member.id,
      }),
    );

    const result = await catalog.executeTool("team_roster", {});
    expect(result.structuredContent).toEqual({
      members: expect.arrayContaining([
        expect.objectContaining({ id: member.id, name: "Reviewer", kind: "agent" }),
        expect.objectContaining({ name: "Human", kind: "human" }),
      ]),
    });

    service.close();
  });

  test("refuses caller labels that claim a project the member is not assigned to", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "channel-all"),
    });
    setConfiguredTeamServiceForTests(service);

    const member = service.createMember({
      projectId: "project-2",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
    });
    service.createChannel({ projectId: "project-1", name: "all" });

    const catalog = createCatalog(
      createCallerAgent({
        agentId: "agent-reviewer",
        projectId: "project-1",
        memberId: member.id,
      }),
    );

    await expect(
      catalog.executeTool("team_post", { channel: "all", body: "should fail" }),
    ).rejects.toThrowError(`Caller member ${member.id} is not assigned to project project-1.`);
    await expect(catalog.executeTool("team_read", { channel: "all" })).rejects.toThrowError(
      `Caller member ${member.id} is not assigned to project project-1.`,
    );

    service.close();
  });

  test("team_propose_members returns proposals only and creates nothing", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });
    setConfiguredTeamServiceForTests(service);

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
      rolePrompt: "Review carefully before approving.",
    });

    const before = service.listMembers("project-1");
    const catalog = createCatalog(
      createCallerAgent({
        agentId: "agent-reviewer",
        projectId: "project-1",
        memberId: member.id,
      }),
    );

    const result = await catalog.executeTool("team_propose_members", {});
    expect(result.structuredContent).toEqual({
      proposals: expect.arrayContaining([
        expect.objectContaining({ templateId: "lead" }),
        expect.objectContaining({ templateId: "qa" }),
      ]),
    });
    expect(service.listMembers("project-1")).toEqual(before);

    service.close();
  });

  test("team_tasks lists claimable tasks and team_task_update explains refusals", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "member-qa", "task-1", "task-2"),
    });
    setConfiguredTeamServiceForTests(service);

    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
    });
    const qa = service.createMember({
      projectId: "project-1",
      name: "QA",
      description: "Breaks things",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-qa",
    });
    const blocker = service.createTask({
      projectId: "project-1",
      title: "Blocker",
      creatorMemberId: reviewer.id,
    });
    const blocked = service.createTask({
      projectId: "project-1",
      title: "Blocked",
      creatorMemberId: reviewer.id,
      dependsOnTaskIds: [blocker.id],
    });
    const catalog = createCatalog(
      createCallerAgent({
        agentId: "agent-reviewer",
        projectId: "project-1",
        memberId: reviewer.id,
      }),
    );

    const list = await catalog.executeTool("team_tasks", { claimable: true });
    expect(list.structuredContent).toEqual({
      tasks: [expect.objectContaining({ id: blocker.id })],
    });

    await expect(
      catalog.executeTool("team_task_update", {
        action: "claim",
        taskId: blocked.id,
      }),
    ).rejects.toThrowError(`Task #${blocked.seq} is blocked by #${blocker.seq}.`);

    await catalog.executeTool("team_task_update", {
      action: "claim",
      taskId: blocker.id,
    });

    const qaCatalog = createCatalog(
      createCallerAgent({
        agentId: "agent-qa",
        projectId: "project-1",
        memberId: qa.id,
      }),
    );

    await expect(
      qaCatalog.executeTool("team_task_update", {
        action: "set_status",
        taskId: blocker.id,
        status: "in_review",
      }),
    ).rejects.toThrowError(`Task #${blocker.seq} is claimed by Reviewer.`);

    await expect(
      qaCatalog.executeTool("team_task_update", {
        action: "note",
        taskId: blocker.id,
        note: "trying anyway",
      }),
    ).rejects.toThrowError(`Task #${blocker.seq} is claimed by Reviewer.`);

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-mcp-tools-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function createCatalog(callerAgent: ManagedAgent) {
  return createPaseoToolCatalog({
    agentManager: {
      getAgent: (agentId: string) => (agentId === callerAgent.id ? callerAgent : undefined),
      listAgents: () => [callerAgent],
      createAgent: async () => callerAgent,
      tryRunOutOfBand: () => false,
      hasInFlightRun: () => false,
      replaceAgentRun: async () => (async function* noop() {})(),
      streamAgent: () => (async function* noop() {})(),
      waitForAgentRunStart: async () => undefined,
    } as never,
    agentStorage: {} as never,
    providerSnapshotManager: { resolveCreateConfig: async () => ({}) } as never,
    workspaceRegistry: {
      get: async (workspaceId: string) =>
        workspaceId === "workspace-reviewer"
          ? {
              workspaceId,
              projectId: "project-1",
              cwd: "/repo",
              kind: "directory",
              displayName: "Repo",
              title: null,
              branch: null,
              worktreeRoot: null,
              baseBranch: null,
              isPaseoOwnedWorktree: false,
              mainRepoRoot: null,
              createdAt: "2026-07-27T12:00:00.000Z",
              updatedAt: "2026-07-27T12:00:00.000Z",
              archivedAt: null,
              pinnedAt: null,
            }
          : null,
    } as never,
    callerAgentId: callerAgent.id,
    logger: createTestLogger(),
  });
}

function createCallerAgent(input: {
  agentId: string;
  projectId: string;
  memberId: string;
}): ManagedAgent {
  return {
    id: input.agentId,
    provider: "codex",
    cwd: "/repo",
    workspaceId: "workspace-reviewer",
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: true,
      supportsReasoningStream: false,
      supportsToolInvocations: true,
      supportsRewindConversation: false,
      supportsRewindFiles: false,
      supportsRewindBoth: false,
    },
    config: { provider: "codex", cwd: "/repo" },
    createdAt: new Date("2026-07-27T12:00:00.000Z"),
    updatedAt: new Date("2026-07-27T12:00:00.000Z"),
    availableModes: [],
    currentModeId: null,
    pendingPermissions: new Map(),
    bufferedPermissionResolutions: new Map(),
    inFlightPermissionResponses: new Set(),
    pendingReplacement: false,
    persistence: null,
    historyPrimed: false,
    lastUserMessageAt: null,
    attention: { state: "idle" },
    foregroundTurnWaiters: new Set(),
    finalizedForegroundTurnIds: new Set(),
    unsubscribeSession: null,
    labels: buildTeamAgentLabels({
      projectId: input.projectId,
      memberId: input.memberId,
      autoStarted: true,
    }),
    lifecycle: "idle",
    session: {
      subscribe: () => () => {},
    },
    activeForegroundTurnId: null,
  } as unknown as ManagedAgent;
}

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function sequenceTimes(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[index++] ?? timestamps[timestamps.length - 1]!);
}
