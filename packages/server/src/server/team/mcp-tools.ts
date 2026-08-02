/* eslint-disable unicorn/require-post-message-target-origin */
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
const teamTasksInputSchema = z
  .object({
    status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
    mine: z.boolean().optional(),
    claimable: z.boolean().optional(),
  })
  .strict();
const teamTaskUpdateInputSchema = z
  .object({
    action: z.enum([
      "create",
      "claim",
      "release",
      "set_status",
      "note",
      "satisfy_criterion",
      "handback",
    ]),
    taskId: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
    note: z.string().optional(),
    criterionIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

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

      const message = teamService.postMessage({
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
    "team_tasks",
    {
      title: "Read team tasks",
      description: "List tasks in the caller member's project.",
      inputSchema: teamTasksInputSchema,
    },
    async (rawInput) => {
      const input = teamTasksInputSchema.parse(rawInput);
      const teamService = getConfiguredTeamService();
      const scope = resolveCallerScope(host, teamService);
      const tasks = teamService.listTasks({
        projectId: scope.projectId,
        status: input.status,
        claimantMemberId: input.mine ? scope.memberId : undefined,
        claimable: input.claimable,
      });
      return {
        content: [{ type: "text", text: `Found ${tasks.length} task(s).` }],
        structuredContent: {
          tasks,
        },
      };
    },
  );

  registerTool(
    "team_task_update",
    {
      title: "Update team tasks",
      description: "Create, claim, release, and update tasks in the caller member's project.",
      inputSchema: teamTaskUpdateInputSchema,
    },
    async (rawInput) => {
      const input = teamTaskUpdateInputSchema.parse(rawInput);
      const teamService = getConfiguredTeamService();
      const scope = resolveCallerScope(host, teamService);

      switch (input.action) {
        case "create": {
          if (!input.title) {
            throw new Error(
              "Creating a task requires title. Provide the task title and try again.",
            );
          }
          const task = teamService.createTask({
            projectId: scope.projectId,
            title: input.title,
            body: input.body ?? null,
            creatorMemberId: scope.memberId,
          });
          return taskResult(`Created task #${task.seq}.`, task);
        }
        case "claim": {
          const taskId = requireTaskId(input.taskId, "claim");
          const task = teamService.claimTask(scope.projectId, taskId, scope.memberId);
          return taskResult(`Claimed task #${task.seq}.`, task);
        }
        case "release": {
          const taskId = requireTaskId(input.taskId, "release");
          const task = teamService.releaseTask(scope.projectId, taskId, scope.memberId);
          return taskResult(`Released task #${task.seq}.`, task);
        }
        case "set_status": {
          const taskId = requireTaskId(input.taskId, "set_status");
          if (!input.status) {
            throw new Error(
              "Setting task status requires status. Provide todo, in_progress, in_review, or done.",
            );
          }
          const task =
            input.status === "done"
              ? teamService.acceptTask(scope.projectId, taskId, scope.memberId)
              : teamService.updateTask({
                  projectId: scope.projectId,
                  taskId,
                  status: input.status,
                  actorMemberId: scope.memberId,
                });
          return taskResult(`Updated task #${task.seq} to ${task.status}.`, task);
        }
        case "note": {
          const taskId = requireTaskId(input.taskId, "note");
          if (!input.note) {
            throw new Error(
              "Adding a note requires note. Write the progress you made, then retry.",
            );
          }
          const note = teamService.addTaskNote(scope.projectId, taskId, scope.memberId, input.note);
          return {
            content: [{ type: "text", text: "Added a task note." }],
            structuredContent: { note },
          };
        }
        case "satisfy_criterion": {
          const taskId = requireTaskId(input.taskId, "satisfy_criterion");
          if (input.criterionIndex === undefined) {
            throw new Error(
              "Satisfying a criterion requires criterionIndex. Pick the zero-based criterion index and try again.",
            );
          }
          const task = teamService.satisfyTaskCriterion(
            scope.projectId,
            taskId,
            input.criterionIndex,
            scope.memberId,
          );
          return taskResult(
            `Satisfied criterion ${input.criterionIndex} on task #${task.seq}.`,
            task,
          );
        }
        case "handback": {
          const taskId = requireTaskId(input.taskId, "handback");
          const task = teamService.handbackTask(scope.projectId, taskId, scope.memberId);
          return taskResult(
            task.escalatedAt
              ? `Task #${task.seq} escalated. Ask the user to decide the next step, then resume it.`
              : `Handed back task #${task.seq}.`,
            task,
          );
        }
      }
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

function requireTaskId(taskId: string | undefined, action: string): string {
  if (!taskId) {
    throw new Error(`${action} requires taskId. Pick a task first, then retry.`);
  }
  return taskId;
}

function taskResult(text: string, task: unknown): PaseoToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { task },
  };
}
