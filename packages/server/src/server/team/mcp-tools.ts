import { z } from "zod";
import type { ManagedAgent } from "../agent/agent-manager.js";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import type { PaseoToolHostDependencies } from "../agent/tools/paseo-tools.js";
import { getConfiguredTeamService } from "./bootstrap.js";
import {
  isAutoStartedTeamAgent,
  MemberLifecycle,
  TEAM_MEMBER_ID_LABEL,
  TEAM_PROJECT_ID_LABEL,
} from "./member-lifecycle.js";

const teamPostInputSchema = z
  .object({
    channel: z.string().min(1),
    body: z.string().min(1),
    replyToMessageId: z.string().optional(),
  })
  .strict();

const teamReadInputSchema = z
  .object({
    channel: z.string().min(1),
    limit: z.number().int().positive().optional(),
    before: z.string().optional(),
  })
  .strict();

const teamRosterInputSchema = z.object({}).strict();
const teamProposeMembersInputSchema = z.object({}).strict();

interface RegisterTeamPaseoToolsOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (input: unknown, context: PaseoToolExecutionContext) => Promise<PaseoToolResult>,
  ) => void;
  host: PaseoToolHostDependencies;
}

export function registerTeamPaseoTools(options: RegisterTeamPaseoToolsOptions): void {
  const { registerTool, host } = options;

  registerTool(
    "team_post",
    {
      title: "Post a team message",
      description: "Post a message to a channel in the caller member's project.",
      inputSchema: teamPostInputSchema,
    },
    async (rawInput) => {
      const input = teamPostInputSchema.parse(rawInput);
      const teamService = getConfiguredTeamService();
      const scope = resolveCallerScope(host, teamService);
      const channel = teamService.findChannel(scope.projectId, input.channel);
      if (!channel) {
        throw new Error(`Channel ${input.channel} was not found in project ${scope.projectId}.`);
      }

      const postTeamMessage = teamService.postMessage.bind(teamService);
      const message = postTeamMessage({
        projectId: scope.projectId,
        channelId: channel.id,
        authorMemberId: scope.memberId,
        body: input.body,
        replyToMessageId: input.replyToMessageId,
        autoStarted: isAutoStartedTeamAgent(scope.agent),
      });

      await createMemberLifecycle(host, teamService)?.deliverMentions({
        projectId: scope.projectId,
        message,
      });

      return {
        content: [{ type: "text", text: `Posted to #${channel.name}.` }],
        structuredContent: {
          messageId: message.id,
          channelId: channel.id,
        },
      };
    },
  );

  registerTool(
    "team_read",
    {
      title: "Read a team channel",
      description: "Read recent messages from a channel in the caller member's project.",
      inputSchema: teamReadInputSchema,
    },
    async (rawInput) => {
      const input = teamReadInputSchema.parse(rawInput);
      const teamService = getConfiguredTeamService();
      const scope = resolveCallerScope(host, teamService);
      const channel = teamService.findChannel(scope.projectId, input.channel);
      if (!channel) {
        throw new Error(`Channel ${input.channel} was not found in project ${scope.projectId}.`);
      }

      const page = teamService.listMessages({
        projectId: scope.projectId,
        channelId: channel.id,
        before: input.before,
        limit: input.limit,
      });

      const messages = page.messages.map((message) => ({
        id: message.id,
        channelId: message.channelId,
        authorMemberId: message.authorMemberId,
        authorName: teamService.getMemberDisplayName(message.authorMemberId) ?? "Unknown",
        body: message.body,
        replyToMessageId: message.replyToMessageId,
        mentionMemberIds: message.mentionMemberIds ?? [],
        createdAt: message.createdAt,
        autoStarted: message.autoStarted ?? false,
      }));

      return {
        content: [
          { type: "text", text: `Read ${messages.length} message(s) from #${channel.name}.` },
        ],
        structuredContent: {
          messages,
          nextCursor: page.nextCursor,
        },
      };
    },
  );

  registerTool(
    "team_roster",
    {
      title: "Read the team roster",
      description: "List the members assigned to the caller member's project.",
      inputSchema: teamRosterInputSchema,
    },
    async () => {
      const teamService = getConfiguredTeamService();
      const scope = resolveCallerScope(host, teamService);
      const liveAgents = host.agentManager.listAgents();
      const members = [
        ...teamService.listMembers(scope.projectId),
        teamService.getHumanMember(),
      ].map((member) => {
        const liveAgent =
          member.kind === "agent"
            ? (liveAgents.find(
                (agent) =>
                  agent.labels[TEAM_PROJECT_ID_LABEL] === scope.projectId &&
                  agent.labels[TEAM_MEMBER_ID_LABEL] === member.id,
              ) ?? null)
            : null;
        const status = resolveMemberStatus(member.kind, liveAgent?.lifecycle);
        return {
          id: member.id,
          name: member.name,
          description: member.description,
          kind: member.kind,
          status,
          homeWorkspaceId: member.homeWorkspaceId ?? null,
          currentAgentId: liveAgent?.id ?? null,
        };
      });

      return {
        content: [{ type: "text", text: `Found ${members.length} team member(s).` }],
        structuredContent: {
          members,
        },
      };
    },
  );

  registerTool(
    "team_propose_members",
    {
      title: "Propose team members",
      description: "Return proposed members for the caller member's project without creating them.",
      inputSchema: teamProposeMembersInputSchema,
    },
    async (rawInput) => {
      teamProposeMembersInputSchema.parse(rawInput);
      const teamService = getConfiguredTeamService();
      const scope = resolveCallerScope(host, teamService);
      const proposals = teamService.proposeMembers(scope.projectId);
      return {
        content: [{ type: "text", text: `Proposed ${proposals.length} member(s).` }],
        structuredContent: {
          proposals,
        },
      };
    },
  );
}

function resolveMemberStatus(
  kind: "agent" | "human",
  lifecycle: ManagedAgent["lifecycle"] | undefined,
): "idle" | "running" {
  if (kind === "human") {
    return "idle";
  }
  if (lifecycle === "running") {
    return "running";
  }
  return "idle";
}

function resolveCallerScope(
  host: PaseoToolHostDependencies,
  teamService: ReturnType<typeof getConfiguredTeamService>,
): { agent: ManagedAgent; projectId: string; memberId: string } {
  const callerAgentId = host.callerAgentId?.trim();
  if (!callerAgentId) {
    throw new Error("team tools require a calling member runtime.");
  }

  const agent = host.agentManager.getAgent(callerAgentId);
  if (!agent) {
    throw new Error(`Caller agent ${callerAgentId} not found.`);
  }

  const projectId = agent.labels[TEAM_PROJECT_ID_LABEL];
  const memberId = agent.labels[TEAM_MEMBER_ID_LABEL];
  if (!projectId || !memberId) {
    throw new Error("Caller agent is not a team member runtime.");
  }
  if (!teamService.getProjectMemberAssignment(projectId, memberId)) {
    throw new Error(`Caller member ${memberId} is not assigned to project ${projectId}.`);
  }

  return { agent, projectId, memberId };
}

function createMemberLifecycle(
  host: PaseoToolHostDependencies,
  teamService: ReturnType<typeof getConfiguredTeamService>,
): MemberLifecycle | null {
  if (!host.workspaceRegistry) {
    return null;
  }
  return new MemberLifecycle({
    teamService,
    agentManager: host.agentManager,
    workspaceRegistry: host.workspaceRegistry,
    logger: host.logger,
  });
}
