// Shared fakes for the team tests. Both member-lifecycle.test.ts and claims.test.ts need to
// simulate the idle runtime reaper, and a second copy of this would be a second thing to keep
// honest. See research R1 and R5.
import { join } from "node:path";
import type { TeamMessage } from "@getpaseo/protocol/team/types";
import type { AgentSessionConfig } from "../../agent/agent-sdk-types.js";
import type { ManagedAgent } from "../../agent/agent-manager.js";
import type { PersistedWorkspaceRecord, WorkspaceRegistry } from "../../workspace-registry.js";
import { createProjectStore } from "../storage/project-store.js";
import { createRosterStore } from "../storage/roster-store.js";
import { createTeamDatabaseManager } from "../storage/database.js";

export class FakeAgentManager {
  public readonly createCalls: Array<{
    config: AgentSessionConfig;
    options: { workspaceId: string | undefined; labels?: Record<string, string> };
  }> = [];
  public readonly promptCalls: Array<{ agentId: string; prompt: unknown }> = [];
  public readonly cancelledAgentIds: string[] = [];
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

  public async cancelAgentRun(agentId: string): Promise<{ status: string }> {
    this.cancelledAgentIds.push(agentId);
    return { status: "cancelled" };
  }

  public async closeAgent(agentId: string): Promise<void> {
    this.liveAgents.delete(agentId);
  }

  public clearLiveAgents(): void {
    this.liveAgents.clear();
  }

  /**
   * What `IDLE_AGENT_RUNTIME_TTL_MS` does in bootstrap.ts: the runtime is gone, while everything
   * persisted about the member — including any claim it holds — must be untouched.
   */
  public reapIdleRuntimes(): void {
    this.liveAgents.clear();
  }
}

export function seedAssignedMember(input: {
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
  // Windows cannot unlink an open file, so a leaked handle fails the temp-dir cleanup rather
  // than the assertion. Close what we opened.
  dbManager.closeAll();
}

export function createWorkspaceRegistryStub(input: {
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

export function buildWorkspaceRecord(input: {
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

export function buildMessage(body: string, mentionMemberIds: string[]): TeamMessage {
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

export function createManagedAgent(
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

export function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
