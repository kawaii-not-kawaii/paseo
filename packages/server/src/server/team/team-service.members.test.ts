import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import type { PersistedWorkspaceRecord, WorkspaceRegistry } from "../workspace-registry.js";

describe("TeamService member behavior", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("applies a member role_prompt as AgentConfig.systemPrompt on every session it runs", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });
    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
      rolePrompt: "Review carefully before approving.",
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

    await lifecycle.deliverMention({
      projectId: "project-1",
      memberId: member.id,
      prompt: "First run",
    });
    agentManager.clearLiveAgents();
    await lifecycle.deliverMention({
      projectId: "project-1",
      memberId: member.id,
      prompt: "Second run",
    });

    expect(agentManager.createCalls).toHaveLength(2);
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      "Review carefully before approving.",
    );
    expect(agentManager.createCalls[1]?.config.systemPrompt).toContain(
      "Review carefully before approving.",
    );

    service.close();
  });

  test("a member whose home workspace disappears survives, is flagged unavailable, and cannot run until re-pointed", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: sequenceTimes("2026-07-27T12:00:00.000Z", "2026-07-27T12:01:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });
    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
      rolePrompt: "Review carefully before approving.",
    });

    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager: new FakeAgentManager(),
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: "/repo",
        archivedAt: "2026-07-27T12:00:30.000Z",
      }),
      logger: createTestLogger(),
    });

    await expect(
      lifecycle.deliverMention({
        projectId: "project-1",
        memberId: member.id,
        prompt: "Run now",
      }),
    ).rejects.toThrowError("Home workspace workspace-reviewer is unavailable for Reviewer.");

    // Select the agent rather than asserting the whole roster: the roster also carries the human
    // identity, and this test is about the stranded member's state.
    expect(service.listMembers("project-1").find((entry) => entry.id === member.id)).toEqual(
      expect.objectContaining({
        id: member.id,
        status: "unavailable",
        homeWorkspaceId: null,
      }),
    );

    await expect(
      lifecycle.deliverMention({
        projectId: "project-1",
        memberId: member.id,
        prompt: "Try again",
      }),
    ).rejects.toThrowError(
      "Member Reviewer is unable to run until it is re-pointed to a workspace.",
    );

    const reassigned = service.assignMember({
      projectId: "project-1",
      memberId: member.id,
      homeWorkspaceId: "workspace-repointed",
    });
    expect(reassigned.homeWorkspaceId).toBe("workspace-repointed");

    service.close();
  });

  test("removing a member leaves its messages readable and correctly attributed", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: sequenceTimes("2026-07-27T12:00:00.000Z", "2026-07-27T12:01:00.000Z"),
      createId: sequenceIds(
        "member-human",
        "member-reviewer",
        "channel-all",
        "message-reviewer",
        "message-human",
      ),
    });
    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
      rolePrompt: "Review carefully before approving.",
    });
    const channel = service.createChannel({
      projectId: "project-1",
      name: "all",
      memberIds: [member.id],
    });
    const postTeamMessage = service.postMessage.bind(service);
    postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: member.id,
      body: "Review complete.",
    });

    expect(service.removeMember("project-1", member.id)).toBe(member.id);

    const page = service.listMessages({
      projectId: "project-1",
      channelId: channel.id,
    });

    expect(page.messages).toEqual([
      expect.objectContaining({
        authorMemberId: member.id,
        body: "Review complete.",
      }),
    ]);
    expect(service.getMemberDisplayName(member.id)).toBe("Reviewer");

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-service-members-test-"));
    cleanupPaths.push(path);
    return path;
  }
  // The human authors messages and is the escalation target, but is never assigned to a project.
  // If the project roster omits it, the app resolves the author of the user's own messages to a
  // raw id and escalation has nobody to mention (FR-006a, FR-035e).
  test("the project roster includes the human identity alongside assigned members", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({ paseoHome });
    service.createMember({
      projectId: "project-1",
      name: "impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });

    const roster = service.listMembers("project-1");

    expect(roster.map((member) => member.kind).sort()).toEqual(["agent", "human"]);
    expect(roster.find((member) => member.kind === "human")).toBeDefined();

    service.close();
  });
});

class FakeAgentManager {
  public readonly createCalls: Array<{
    config: { systemPrompt?: string };
  }> = [];
  private liveAgents = 0;

  /** Members refuse to start without an agent MCP base URL — see MemberLifecycle. */
  public getMcpBaseUrl(): string | null {
    return "http://127.0.0.1:6768/mcp/agents";
  }

  public listAgents() {
    return Array.from({ length: this.liveAgents }, (_, index) => ({
      id: `agent-${index + 1}`,
      labels: {},
      lifecycle: "idle",
    })) as never[];
  }

  public getAgent() {
    return undefined;
  }

  public async createAgent(config: { systemPrompt?: string }) {
    this.createCalls.push({ config });
    this.liveAgents += 1;
    return {
      id: `agent-${this.liveAgents}`,
      labels: {},
      lifecycle: "idle",
    } as never;
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

  public streamAgent(): AsyncGenerator<never, void, unknown> {
    return (async function* noop() {})();
  }

  public async waitForAgentRunStart(): Promise<void> {
    return undefined;
  }

  public clearLiveAgents(): void {
    this.liveAgents = 0;
  }
}

function createWorkspaceRegistryStub(input: {
  workspaceId: string;
  projectId: string;
  cwd: string;
  archivedAt?: string | null;
}): WorkspaceRegistry {
  const workspace: PersistedWorkspaceRecord = {
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
    archivedAt: input.archivedAt ?? null,
    pinnedAt: null,
  };

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

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function sequenceTimes(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[index++] ?? timestamps.at(-1) ?? "2026-07-27T12:00:00.000Z");
}
