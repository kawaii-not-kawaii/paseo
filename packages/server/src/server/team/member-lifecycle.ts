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
