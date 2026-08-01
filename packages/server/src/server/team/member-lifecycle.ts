import { formatSystemNotificationPrompt, startAgentRun } from "../agent/agent-prompt.js";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import type { AgentManager, ManagedAgent } from "../agent/agent-manager.js";
import type { WorkspaceRegistry } from "../workspace-registry.js";
import type { Logger } from "pino";
import type { TeamChannel, TeamMessage } from "@getpaseo/protocol/team/types";
import { TeamService } from "./team-service.js";

export const TEAM_MEMBER_ID_LABEL = "paseo.team.memberId";
export const TEAM_PROJECT_ID_LABEL = "paseo.team.projectId";
export const TEAM_AUTO_STARTED_LABEL = "paseo.team.autoStarted";
const AGENT_MESSAGE_WARNING_THRESHOLD = 20;

interface MemberLifecycleOptions {
  teamService: TeamService;
  agentManager: Pick<
    AgentManager,
    | "createAgent"
    | "getAgent"
    | "getMcpBaseUrl"
    | "listAgents"
    | "tryRunOutOfBand"
    | "hasInFlightRun"
    | "replaceAgentRun"
    | "streamAgent"
    | "subscribe"
    // FR-021: the user can stop a member by hand, which ends its runtime and nothing else.
    | "cancelAgentRun"
    | "closeAgent"
  >;
  workspaceRegistry: Pick<WorkspaceRegistry, "get">;
  logger: Logger;
}

export class MemberLifecycle {
  private readonly teamService: TeamService;
  private readonly agentManager: MemberLifecycleOptions["agentManager"];
  private readonly workspaceRegistry: MemberLifecycleOptions["workspaceRegistry"];
  private readonly logger: Logger;

  constructor(options: MemberLifecycleOptions) {
    this.teamService = options.teamService;
    this.agentManager = options.agentManager;
    this.workspaceRegistry = options.workspaceRegistry;
    this.logger = options.logger;
  }

  public async deliverMentions(input: { projectId: string; message: TeamMessage }): Promise<void> {
    this.warnOnRunawayAgentConversation(input);
    const deliveries = this.resolveMessageDeliveries(input);
    if (deliveries.length === 0) {
      return;
    }
    const prompt = formatMentionPrompt(
      this.teamService,
      input.projectId,
      input.message,
      this.logger,
    );
    for (const delivery of deliveries) {
      const delivered = await this.deliverMention({
        projectId: input.projectId,
        memberId: delivery.memberId,
        prompt,
        interruptRunning: delivery.interruptRunning,
      });
      if (delivered && this.teamService.getChannel(input.projectId, input.message.channelId)) {
        this.teamService.markChannelRead(
          input.projectId,
          input.message.channelId,
          delivery.memberId,
        );
      }
    }
  }

  public async deliverMention(input: {
    projectId: string;
    memberId: string;
    prompt: string;
    interruptRunning?: boolean;
  }): Promise<ManagedAgent | null> {
    const member = this.teamService.getMember(input.memberId);
    if (!member) {
      throw new Error(`Member ${input.memberId} not found`);
    }
    if (member.kind === "human") {
      return null;
    }
    this.assertTeamToolsReachable(member.name);

    const assignment = this.teamService.getProjectMemberAssignment(input.projectId, input.memberId);
    if (!assignment) {
      throw new Error(`Member ${member.name} is not assigned to project ${input.projectId}.`);
    }
    if (!assignment.homeWorkspaceId) {
      throw new Error(
        `Member ${member.name} is unable to run until it is re-pointed to a workspace.`,
      );
    }

    const workspace = await this.workspaceRegistry.get(assignment.homeWorkspaceId);
    if (!workspace || workspace.archivedAt) {
      this.teamService.markMemberHomeWorkspaceUnavailable({
        projectId: input.projectId,
        memberId: input.memberId,
        homeWorkspaceId: assignment.homeWorkspaceId,
      });
      throw new Error(
        `Home workspace ${assignment.homeWorkspaceId} is unavailable for ${member.name}.`,
      );
    }

    const notification = formatSystemNotificationPrompt(input.prompt);
    const existing = findLiveTeamMemberAgent(this.agentManager.listAgents(), {
      projectId: input.projectId,
      memberId: input.memberId,
    });

    if (existing) {
      if (input.interruptRunning === false && this.agentManager.hasInFlightRun(existing.id)) {
        return null;
      }
      await startAgentRun(this.agentManager, existing.id, notification, this.logger, {
        replaceRunning: input.interruptRunning ?? true,
      });
      return existing;
    }

    const created = await this.agentManager.createAgent(
      buildMemberAgentConfig(this.teamService, member, workspace.cwd),
      undefined,
      {
        workspaceId: workspace.workspaceId,
        labels: buildTeamAgentLabels({
          projectId: input.projectId,
          memberId: input.memberId,
          autoStarted: true,
        }),
        initialTitle: member.name,
      },
    );

    await startAgentRun(this.agentManager, created.id, notification, this.logger, {
      replaceRunning: input.interruptRunning ?? true,
    });
    return this.agentManager.getAgent(created.id) ?? created;
  }

  public subscribeRuntimeStatus(
    listener: (change: { projectId: string; memberId: string; status: "running" | "idle" }) => void,
  ): () => void {
    const statuses = new Map<string, "running" | "idle">();
    return this.agentManager.subscribe(
      (event) => {
        if (event.type !== "agent_state") {
          return;
        }
        const projectId = event.agent.labels[TEAM_PROJECT_ID_LABEL];
        const memberId = event.agent.labels[TEAM_MEMBER_ID_LABEL];
        if (!projectId || !memberId) {
          return;
        }
        const status = resolveMemberRuntimeStatus([event.agent], { projectId, memberId }) ?? "idle";
        const key = `${projectId}\0${memberId}`;
        if (statuses.get(key) === status) {
          return;
        }
        statuses.set(key, status);
        listener({ projectId, memberId, status });
        // Catch-up rides the running -> idle transition rather than `turn_completed`.
        // `turn_completed` is emitted from inside the run's own stream loop, so the
        // run is still in flight when it arrives: `deliverCatchUp` would hit the
        // `hasInFlightRun` guard, return without advancing the cursor, and never be
        // retried — silently dropping exactly the messages it exists to deliver.
        // The idle transition is emitted after the run has drained, and is already
        // deduped by `statuses` above, so it fires once per completion.
        if (status !== "idle") {
          return;
        }
        void this.deliverCatchUp({ projectId, memberId }).catch((error: unknown) => {
          this.logger.error(
            { err: error, projectId, memberId },
            "Failed to deliver deferred team-message catch-up",
          );
        });
      },
      { replayState: false },
    );
  }

  /**
   * Brings up a member's runtime on the user's instruction (FR-021), without giving it a prompt.
   *
   * This is not how members normally start — a mention starts them, and the mention is the prompt.
   * Starting one by hand is for the user who wants it warm and waiting. Idempotent: if a runtime
   * is already live, that one is returned rather than a second being created.
   */
  public async start(input: { projectId: string; memberId: string }): Promise<ManagedAgent | null> {
    const member = this.teamService.getMember(input.memberId);
    if (!member) {
      throw new Error(`Member ${input.memberId} not found`);
    }
    if (member.kind === "human") {
      return null;
    }
    this.assertTeamToolsReachable(member.name);

    const existing = findLiveTeamMemberAgent(this.agentManager.listAgents(), input);
    if (existing) {
      return existing;
    }

    const workspace = await this.resolveRunnableWorkspace(input);
    const created = await this.agentManager.createAgent(
      buildMemberAgentConfig(this.teamService, member, workspace.cwd),
      undefined,
      {
        workspaceId: workspace.workspaceId,
        labels: buildTeamAgentLabels({ ...input, autoStarted: false }),
        initialTitle: member.name,
      },
    );
    return this.agentManager.getAgent(created.id) ?? created;
  }

  /** Runtime status for one member, or null when nothing is live for it. */
  public runtimeStatus(input: { projectId: string; memberId: string }): "running" | "idle" | null {
    return resolveMemberRuntimeStatus(this.agentManager.listAgents(), input);
  }

  /**
   * Stops a member's runtime on the user's instruction (FR-021).
   *
   * Stopping is about the runtime only. It must never touch the member's claims — a stopped
   * member keeps what it holds until the lease expires or it is released, or another member would
   * steal work that is merely paused (research R1). Returns false when nothing was running.
   */
  public async stop(input: { projectId: string; memberId: string }): Promise<boolean> {
    const live = findLiveTeamMemberAgent(this.agentManager.listAgents(), input);
    if (!live) {
      return false;
    }
    await this.agentManager.cancelAgentRun(live.id);
    await this.agentManager.closeAgent(live.id);
    return true;
  }

  private resolveMessageDeliveries(input: {
    projectId: string;
    message: TeamMessage;
  }): Array<{ memberId: string; interruptRunning: boolean }> {
    const mentionedMemberIds = new Set(input.message.mentionMemberIds ?? []);
    return this.teamService
      .listMembers(input.projectId)
      .filter((member) => member.id !== input.message.authorMemberId)
      .map((member) => ({
        memberId: member.id,
        interruptRunning: mentionedMemberIds.has(member.id),
      }));
  }

  private warnOnRunawayAgentConversation(input: { projectId: string; message: TeamMessage }): void {
    const humanMemberId = this.teamService.getHumanMember().id;
    const messages = this.teamService.listMessages({
      projectId: input.projectId,
      channelId: input.message.channelId,
      limit: AGENT_MESSAGE_WARNING_THRESHOLD + 2,
    }).messages;
    const firstHumanMessage = messages.findIndex(
      (message) => message.authorMemberId === humanMemberId,
    );
    const consecutiveAgentMessages = firstHumanMessage === -1 ? messages.length : firstHumanMessage;
    if (consecutiveAgentMessages !== AGENT_MESSAGE_WARNING_THRESHOLD + 1) {
      return;
    }
    this.logger.warn(
      {
        projectId: input.projectId,
        channelId: input.message.channelId,
        consecutiveAgentMessages,
      },
      "Team channel has exceeded the consecutive agent-message warning threshold.",
    );
  }

  private async deliverCatchUp(input: { projectId: string; memberId: string }): Promise<void> {
    const unreadChannels = this.teamService
      .listChannels(input.projectId, input.memberId)
      .filter((channel) => (channel.unreadCount ?? 0) > 0);
    if (unreadChannels.length === 0) {
      return;
    }
    const delivered = await this.deliverMention({
      ...input,
      prompt: formatCatchUpPrompt(unreadChannels),
      interruptRunning: false,
    });
    if (!delivered) {
      return;
    }
    for (const channel of unreadChannels) {
      this.teamService.markChannelRead(input.projectId, channel.id, input.memberId);
    }
  }

  /**
   * Refuses to start a member that cannot reach the team tools.
   *
   * `features.team` tells clients not to offer Team, but a capability flag only guides a
   * well-behaved client with a current `server_info`. Team RPCs are routed unconditionally
   * (`session.ts`, `isTeamRequest`), and `server_info` is delivered at hello and re-broadcast only
   * on speech-readiness changes — so a client that connected while injection was on keeps offering
   * Team after it is toggled off, and its next mention lands here.
   *
   * Without this the member starts, burns a model turn, finds no `team_*` tools, and goes silent.
   * That is the exact failure this whole change exists to remove, so it must not be reachable by
   * any path.
   */
  private assertTeamToolsReachable(memberName: string): void {
    if (this.agentManager.getMcpBaseUrl() !== null) {
      return;
    }
    throw new Error(
      `${memberName} cannot start: team members coordinate through the Paseo MCP tools, and this daemon is not injecting them. Enable mcp.injectIntoAgents on the host.`,
    );
  }

  private async resolveRunnableWorkspace(input: { projectId: string; memberId: string }) {
    const member = this.teamService.getMember(input.memberId);
    const name = member?.name ?? input.memberId;
    const assignment = this.teamService.getProjectMemberAssignment(input.projectId, input.memberId);
    if (!assignment) {
      throw new Error(`Member ${name} is not assigned to project ${input.projectId}.`);
    }
    if (!assignment.homeWorkspaceId) {
      throw new Error(`Member ${name} is unable to run until it is re-pointed to a workspace.`);
    }
    const workspace = await this.workspaceRegistry.get(assignment.homeWorkspaceId);
    if (!workspace || workspace.archivedAt) {
      this.teamService.markMemberHomeWorkspaceUnavailable({
        projectId: input.projectId,
        memberId: input.memberId,
        homeWorkspaceId: assignment.homeWorkspaceId,
      });
      throw new Error(`Home workspace ${assignment.homeWorkspaceId} is unavailable for ${name}.`);
    }
    return workspace;
  }
}

/**
 * Names the channel the member was mentioned in.
 *
 * `team_post` and `team_read` both require an exact channel name, and no tool lists channels, so a
 * member handed only the message body has no way to learn where it is expected to reply. Guessing
 * throws `Channel <name> was not found`, which reads to a model exactly like a broken tool — the
 * member then reports the team tools as unusable and goes quiet.
 *
 * Falls back to the bare body when the channel cannot be resolved: a mention that still reaches the
 * member is better than one that throws on its way there.
 */
function formatMentionPrompt(
  teamService: TeamService,
  projectId: string,
  message: TeamMessage,
  logger: Logger,
): string {
  const channel = teamService.getChannel(projectId, message.channelId);
  if (!channel) {
    // The message row is already persisted by the time mentions are delivered, so throwing here
    // would strand a stored message nobody was told about. Deliver it — but say so, because a
    // mention arriving without a channel is the exact shape of the bug this code exists to stop.
    logger.warn(
      { projectId, channelId: message.channelId, messageId: message.id },
      "Team mention delivered without a channel name; the member cannot be told where to reply.",
    );
    return message.body;
  }
  const author = teamService.getMemberDisplayName(message.authorMemberId);
  // The notification is the last thing a member reads before deciding whether to speak, so it
  // outranks the standing prompt in practice — an unconditional "then reply" here was enough to
  // sustain an agent loop despite the etiquette. It is also the only place that knows who wrote
  // the message, which is exactly the distinction that matters: a person gets an answer, a
  // teammate gets the silence default.
  const fromHuman = teamService.getMember(message.authorMemberId)?.kind === "human";
  return [
    author ? `${author} posted in #${channel.name}.` : `A message was posted in #${channel.name}.`,
    "",
    message.body,
    "",
    fromHuman
      ? `A person wrote this, and they are addressing the team. Read the channel with team_read, then answer them: call team_post with channel "${channel.name}". They expect a reply even though they did not mention you by name. Stay silent only if they were plainly addressing someone else, or the message calls for no answer. Mention a teammate as @name only to hand concrete work over.`
      : `Read the channel with team_read. If a response is needed, call team_post with channel "${channel.name}". If no response is needed, stop without posting. Mention a teammate as @name only to hand concrete work over.`,
  ].join("\n");
}

function formatCatchUpPrompt(channels: TeamChannel[]): string {
  return [
    "You have unread team messages to catch up on:",
    ...channels.map((channel) => `- #${channel.name} (${channel.unreadCount} unread)`),
    "",
    "Read each channel with team_read and respond where needed with team_post.",
  ].join("\n");
}

export function buildTeamAgentLabels(input: {
  projectId: string;
  memberId: string;
  autoStarted: boolean;
}): Record<string, string> {
  return {
    [TEAM_PROJECT_ID_LABEL]: input.projectId,
    [TEAM_MEMBER_ID_LABEL]: input.memberId,
    [TEAM_AUTO_STARTED_LABEL]: input.autoStarted ? "1" : "0",
  };
}

/**
 * The runtime status of a member, or null when it has no live agent.
 *
 * `TeamService` deliberately knows nothing about agents, so it can only report
 * `idle`/`unavailable` from stored state. That left `running` and `stopped`
 * unreachable — a member showed idle even while working, and every "working"
 * affordance in the UI was dead. The session decorates the roster with this.
 */
export function resolveMemberRuntimeStatus(
  agents: ManagedAgent[],
  input: { projectId: string; memberId: string },
): "running" | "idle" | null {
  const agent = findLiveTeamMemberAgent(agents, input);
  if (!agent) {
    return null;
  }
  // `initializing` counts as running: the member is coming up because something
  // asked it to, and reporting idle there reads as "nothing is happening".
  if (agent.lifecycle === "running" || agent.lifecycle === "initializing") {
    return "running";
  }
  if (agent.lifecycle === "closed" || agent.lifecycle === "error") {
    return null;
  }
  return "idle";
}

export function findLiveTeamMemberAgent(
  agents: ManagedAgent[],
  input: { projectId: string; memberId: string },
): ManagedAgent | null {
  return (
    agents.find(
      (agent) =>
        agent.labels[TEAM_PROJECT_ID_LABEL] === input.projectId &&
        agent.labels[TEAM_MEMBER_ID_LABEL] === input.memberId,
    ) ?? null
  );
}

export function isAutoStartedTeamAgent(agent: Pick<ManagedAgent, "labels">): boolean {
  return agent.labels[TEAM_AUTO_STARTED_LABEL] === "1";
}

function buildMemberAgentConfig(
  teamService: TeamService,
  member: ReturnType<TeamService["getMember"]> extends infer T ? Exclude<T, null> : never,
  cwd: string,
): AgentSessionConfig {
  return {
    provider: member.provider,
    cwd,
    ...(member.model ? { model: member.model } : {}),
    ...(member.modeId ? { modeId: member.modeId } : {}),
    systemPrompt: teamService.getMemberSessionSystemPrompt(member.id),
    title: member.name,
  };
}
