import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TeamMessage } from "@getpaseo/protocol/team/types";
import { afterEach, describe, expect, test } from "vitest";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import type { ManagedAgent } from "../agent/agent-manager.js";
import type { PersistedWorkspaceRecord, WorkspaceRegistry } from "../workspace-registry.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { isAutoStartedTeamAgent, MemberLifecycle } from "./member-lifecycle.js";
import { createProjectStore } from "./storage/project-store.js";
import { createRosterStore } from "./storage/roster-store.js";
import { createTeamDatabaseManager } from "./storage/database.js";
import { TeamService } from "./team-service.js";

describe("MemberLifecycle", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("mentioning a member with no running session starts one and delivers the mention with the role prompt as systemPrompt", async () => {
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
      rolePrompt: "Review carefully before approving.",
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

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Please review this change", ["member-reviewer"]),
    });

    expect(agentManager.createCalls).toHaveLength(1);
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      "Review carefully before approving.",
    );
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      join(paseoHome, "team", "members", "member-reviewer"),
    );
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      "Your role prompt defines who you are and what you own.",
    );
    expect(agentManager.createCalls[0]?.config.cwd).toBe("/repo");
    expect(agentManager.createCalls[0]?.options.workspaceId).toBe("workspace-reviewer");
    expect(String(agentManager.promptCalls[0]?.prompt)).toContain("Please review this change");

    service.close();
  });

  test("does not rely on a blocking wait tool or resident runtime; a reaped member is still reachable on the next mention", async () => {
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
      rolePrompt: "Review carefully before approving.",
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

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("First ping", ["member-reviewer"]),
    });
    agentManager.clearLiveAgents();
    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Second ping after idle reap", ["member-reviewer"]),
    });

    expect(agentManager.createCalls).toHaveLength(2);
    expect(String(agentManager.promptCalls[1]?.prompt)).toContain("Second ping after idle reap");

    service.close();
  });

  test("records auto_started on messages written by automatically started sessions", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "channel-all", "message-1"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });

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

    const started = await lifecycle.deliverMention({
      projectId: "project-1",
      memberId: "member-reviewer",
      prompt: "Please review this change",
    });
    if (!started) {
      throw new Error("Expected an auto-started agent");
    }

    const postTeamMessage = service.postMessage.bind(service);
    const created = postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: "member-reviewer",
      body: "Reviewed it.",
      autoStarted: isAutoStartedTeamAgent(started),
    });

    expect(created.autoStarted).toBe(true);

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "member-lifecycle-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

class FakeAgentManager {
  public readonly createCalls: Array<{
    config: AgentSessionConfig;
    options: { workspaceId: string | undefined; labels?: Record<string, string> };
  }> = [];
  public readonly promptCalls: Array<{ agentId: string; prompt: unknown }> = [];
  private readonly liveAgents = new Map<string, ManagedAgent>();
  private nextAgentId = 1;

  public listAgents(): ManagedAgent[] {
    return Array.from(this.liveAgents.values());
  }

  public getAgent(agentId: string): ManagedAgent | undefined {
    return this.liveAgents.get(agentId);
  }

  public async createAgent(
    config: AgentSessionConfig,
    _agentId: string | undefined,
    options: { workspaceId: string | undefined; labels?: Record<string, string> },
  ): Promise<ManagedAgent> {
    this.createCalls.push({ config, options });
    const id = `agent-${this.nextAgentId++}`;
    const agent = createManagedAgent(id, config, options.labels ?? {}, options.workspaceId);
    this.liveAgents.set(id, agent);
    return agent;
  }

  public tryRunOutOfBand(): boolean {
    return false;
  }

  public hasInFlightRun(): boolean {
    return false;
  }

  public async replaceAgentRun(): Promise<AsyncGenerator<never, void, unknown>> {
    return (async function* noop() {})();
  }

  public streamAgent(agentId: string, prompt: unknown): AsyncGenerator<never, void, unknown> {
    this.promptCalls.push({ agentId, prompt });
    return (async function* noop() {})();
  }

  public async waitForAgentRunStart(): Promise<void> {
    return undefined;
  }

  public clearLiveAgents(): void {
    this.liveAgents.clear();
  }
}

function seedAssignedMember(input: {
  paseoHome: string;
  projectId: string;
  memberId: string;
  name: string;
  rolePrompt: string;
  homeWorkspaceId: string;
}): void {
  const dbManager = createTeamDatabaseManager({ teamDir: join(input.paseoHome, "team") });
  createRosterStore(dbManager.openRoster()).createMember({
    id: input.memberId,
    name: input.name,
    description: "Checks diffs",
    provider: "codex",
    model: "gpt-5",
    modeId: null,
    rolePrompt: input.rolePrompt,
    templateId: null,
    kind: "agent",
    createdAt: "2026-07-27T12:00:00.000Z",
    archivedAt: null,
  });
  createProjectStore(dbManager.openProject(input.projectId)).addProjectMember({
    memberId: input.memberId,
    homeWorkspaceId: input.homeWorkspaceId,
    joinedAt: "2026-07-27T12:00:00.000Z",
  });
}

function createWorkspaceRegistryStub(input: {
  workspaceId: string;
  projectId: string;
  cwd: string;
}): WorkspaceRegistry {
  const workspace = buildWorkspaceRecord(input);
  return {
    initialize: async () => undefined,
    existsOnDisk: async () => true,
    list: async () => [workspace],
    get: async (workspaceId) => (workspaceId === workspace.workspaceId ? workspace : null),
    update: async () => workspace,
    upsert: async () => undefined,
    archive: async () => undefined,
    remove: async () => undefined,
  };
}

function buildWorkspaceRecord(input: {
  workspaceId: string;
  projectId: string;
  cwd: string;
}): PersistedWorkspaceRecord {
  return {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    cwd: input.cwd,
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
  };
}

function buildMessage(body: string, mentionMemberIds: string[]): TeamMessage {
  return {
    id: "message-1",
    channelId: "channel-1",
    authorMemberId: "member-human",
    body,
    replyToMessageId: null,
    mentionMemberIds,
    createdAt: "2026-07-27T12:00:00.000Z",
    autoStarted: false,
  };
}

function createManagedAgent(
  id: string,
  config: AgentSessionConfig,
  labels: Record<string, string>,
  workspaceId: string | undefined,
): ManagedAgent {
  return {
    id,
    provider: config.provider,
    cwd: config.cwd,
    workspaceId,
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
    config,
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
    labels,
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
