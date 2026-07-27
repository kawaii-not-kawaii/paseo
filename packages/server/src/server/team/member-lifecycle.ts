import { formatSystemNotificationPrompt, startAgentRun } from "../agent/agent-prompt.js";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import type { AgentManager, ManagedAgent } from "../agent/agent-manager.js";
import type { WorkspaceRegistry } from "../workspace-registry.js";
import type { Logger } from "pino";
import type { TeamMessage } from "@getpaseo/protocol/team/types";
import { TeamService } from "./team-service.js";

export const TEAM_MEMBER_ID_LABEL = "paseo.team.memberId";
export const TEAM_PROJECT_ID_LABEL = "paseo.team.projectId";
export const TEAM_AUTO_STARTED_LABEL = "paseo.team.autoStarted";

interface MemberLifecycleOptions {
  teamService: TeamService;
  agentManager: Pick<
    AgentManager,
    | "createAgent"
    | "getAgent"
    | "listAgents"
    | "tryRunOutOfBand"
    | "hasInFlightRun"
    | "replaceAgentRun"
    | "streamAgent"
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
    const mentionMemberIds = Array.from(new Set(input.message.mentionMemberIds ?? []));
    for (const memberId of mentionMemberIds) {
      await this.deliverMention({
        projectId: input.projectId,
        memberId,
        prompt: input.message.body,
      });
    }
  }

  public async deliverMention(input: {
    projectId: string;
    memberId: string;
    prompt: string;
  }): Promise<ManagedAgent | null> {
    const member = this.teamService.getMember(input.memberId);
    if (!member) {
      throw new Error(`Member ${input.memberId} not found`);
    }
    if (member.kind === "human") {
      return null;
    }

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
      await startAgentRun(this.agentManager, existing.id, notification, this.logger, {
        replaceRunning: true,
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
      replaceRunning: true,
    });
    return this.agentManager.getAgent(created.id) ?? created;
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
