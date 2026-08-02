// Shared fakes for the team tests. Both member-lifecycle.test.ts and claims.test.ts need to
// simulate the idle runtime reaper, and a second copy of this would be a second thing to keep
// honest. See research R1 and R5.
import { join } from "node:path";
import type { TeamMessage } from "@getpaseo/protocol/team/types";
import type { AgentSessionConfig } from "../../agent/agent-sdk-types.js";
import type {
  AgentManagerEvent,
  AgentLifecycleStatus,
  AgentSubscriber,
  ManagedAgent,
  SubscribeOptions,
} from "../../agent/agent-manager.js";
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
  public readonly replaceCalls: Array<{ agentId: string; prompt: unknown }> = [];
  public readonly cancelledAgentIds: string[] = [];
  private readonly liveAgents = new Map<string, ManagedAgent>();
  private readonly nextStreamErrors = new Map<string, Error>();
  private readonly subscribers = new Set<AgentSubscriber>();
  private nextAgentId = 1;

  /** Non-null by default: most tests are about member behaviour, not about injection being off. */
  public mcpBaseUrl: string | null = "http://127.0.0.1:6768/mcp/agents";

  public getMcpBaseUrl(): string | null {
    return this.mcpBaseUrl;
  }

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

  public hasInFlightRun(agentId: string): boolean {
    return this.liveAgents.get(agentId)?.lifecycle === "running";
  }

  public async replaceAgentRun(
    agentId: string,
    prompt: unknown,
  ): Promise<AsyncGenerator<never, void, unknown>> {
    this.replaceCalls.push({ agentId, prompt });
    return (async function* noop() {})();
  }

  public streamAgent(agentId: string, prompt: unknown): AsyncGenerator<never, void, unknown> {
    this.promptCalls.push({ agentId, prompt });
    const error = this.nextStreamErrors.get(agentId);
    if (error) {
      this.nextStreamErrors.delete(agentId);
      throw error;
    }
    return (async function* noop() {})();
  }

  public failNextStream(agentId: string, error: Error): void {
    this.nextStreamErrors.set(agentId, error);
  }

  public async waitForAgentRunStart(): Promise<void> {
    return undefined;
  }

  public async cancelAgentRun(agentId: string): Promise<{ status: string }> {
    this.cancelledAgentIds.push(agentId);
    return { status: "cancelled" };
  }

  public async closeAgent(agentId: string): Promise<void> {
    const agent = this.liveAgents.get(agentId);
    if (agent) {
      this.dispatchAgentState({ ...agent, lifecycle: "closed" } as ManagedAgent);
    }
    this.liveAgents.delete(agentId);
  }

  public subscribe(callback: AgentSubscriber, options?: SubscribeOptions): () => void {
    this.subscribers.add(callback);
    if (options?.replayState !== false) {
      for (const agent of this.liveAgents.values()) {
        callback({ type: "agent_state", agent });
      }
    }
    return () => this.subscribers.delete(callback);
  }

  public setAgentLifecycle(agentId: string, lifecycle: AgentLifecycleStatus): void {
    const agent = this.liveAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    agent.lifecycle = lifecycle;
    this.dispatchAgentState(agent);
  }

  /**
   * Models the real AgentManager's ordering: `turn_completed` is emitted from inside
   * the run's own stream loop, so the agent is still `running` when it arrives, and
   * only afterwards does the run drain and the lifecycle fall to `idle`. Emitting the
   * two the other way round makes `hasInFlightRun` falsely false at `turn_completed`
   * and hides anything that keys deferred work off that event.
   */
  public completeTurn(agentId: string): void {
    const event: AgentManagerEvent = {
      type: "agent_stream",
      agentId,
      event: { type: "turn_completed", provider: "codex" },
    };
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
    // The drain is not instantaneous, so the agent stays `running` past the event.
    // Flipping to `idle` in the same tick would let anything keyed off
    // `turn_completed` clear `hasInFlightRun` by luck and pass regardless.
    setImmediate(() => {
      if (this.liveAgents.has(agentId)) {
        this.setAgentLifecycle(agentId, "idle");
      }
    });
  }

  public subscriberCount(): number {
    return this.subscribers.size;
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

  private dispatchAgentState(agent: ManagedAgent): void {
    for (const subscriber of this.subscribers) {
      subscriber({ type: "agent_state", agent });
    }
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
