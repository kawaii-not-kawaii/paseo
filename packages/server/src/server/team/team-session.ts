/* eslint-disable unicorn/require-post-message-target-origin */
import type { SessionInboundMessage, SessionOutboundMessage } from "../messages.js";
import { TeamRequestSchemas } from "@getpaseo/protocol/team/rpc-schemas";
import type { z } from "zod";
import type { Session } from "../session.js";
import { MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";

type TeamRequest = z.infer<(typeof TeamRequestSchemas)[number]>;

const teamRequestTypes = new Set(
  TeamRequestSchemas.map((schema) => schema.shape.type.value as TeamRequest["type"]),
);

let teamService: TeamService | null = null;

export function configureTeamRuntime(service: TeamService): void {
  teamService = service;
}

export function isTeamRequest(msg: SessionInboundMessage): msg is TeamRequest {
  return teamRequestTypes.has(msg.type as TeamRequest["type"]);
}

/**
 * Attaches the team surface to a session, when a team runtime exists.
 *
 * A session constructed without `configureTeamRuntime` — every test that builds a Session
 * directly, and any embedder that does not bootstrap the team service — simply does not get the
 * feature. It must not fail to construct: absent capability means absent feature, never a broken
 * daemon (Constitution II). `isTeamRequest` is the only path that reaches `teamSession`, and it
 * cannot match unless a team RPC arrives, which a client only sends when `features.team` is
 * published.
 */
export function attachTeamSession(session: Session): void {
  if (!teamService) {
    return;
  }

  Object.defineProperty(session, "teamSession", {
    value: new TeamSession({
      service: teamService,
      emit: (message) => session.emitServerMessage(message),
      lifecycle: createMemberLifecycle(session, teamService),
    }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export class TeamSession {
  private readonly service: TeamService;
  private readonly emit: (message: SessionOutboundMessage) => void;
  private readonly lifecycle: MemberLifecycle | null;
  private readonly handlers: Record<
    TeamRequest["type"],
    (msg: TeamRequest) => Promise<void> | void
  >;

  constructor(options: {
    service: TeamService;
    emit: (message: SessionOutboundMessage) => void;
    lifecycle?: MemberLifecycle | null;
  }) {
    this.service = options.service;
    this.emit = options.emit;
    this.lifecycle = options.lifecycle ?? null;
    this.handlers = {
      "team.channel.list.request": (msg) =>
        this.handleChannelList(msg as Extract<TeamRequest, { type: "team.channel.list.request" }>),
      "team.channel.create.request": (msg) =>
        this.handleChannelCreate(
          msg as Extract<TeamRequest, { type: "team.channel.create.request" }>,
        ),
      "team.channel.update.request": (msg) =>
        this.handleChannelUpdate(
          msg as Extract<TeamRequest, { type: "team.channel.update.request" }>,
        ),
      "team.channel.delete.request": (msg) =>
        this.handleChannelDelete(
          msg as Extract<TeamRequest, { type: "team.channel.delete.request" }>,
        ),
      "team.message.list.request": (msg) =>
        this.handleMessageList(msg as Extract<TeamRequest, { type: "team.message.list.request" }>),
      "team.message.post.request": (msg) =>
        this.handleMessagePost(msg as Extract<TeamRequest, { type: "team.message.post.request" }>),
      "team.member.list.request": (msg) =>
        this.handleMemberList(msg as Extract<TeamRequest, { type: "team.member.list.request" }>),
      "team.member.create.request": (msg) =>
        this.handleMemberCreate(
          msg as Extract<TeamRequest, { type: "team.member.create.request" }>,
        ),
      "team.member.update.request": (msg) =>
        this.handleMemberUpdate(
          msg as Extract<TeamRequest, { type: "team.member.update.request" }>,
        ),
      "team.member.assign.request": (msg) =>
        this.handleMemberAssign(
          msg as Extract<TeamRequest, { type: "team.member.assign.request" }>,
        ),
      "team.member.remove.request": (msg) =>
        this.handleMemberRemove(
          msg as Extract<TeamRequest, { type: "team.member.remove.request" }>,
        ),
      "team.member.start.request": (msg) =>
        this.handleMemberStart(msg as Extract<TeamRequest, { type: "team.member.start.request" }>),
      "team.member.stop.request": (msg) =>
        this.handleMemberStop(msg as Extract<TeamRequest, { type: "team.member.stop.request" }>),
      "team.member.list_templates.request": (msg) =>
        this.handleMemberListTemplates(
          msg as Extract<TeamRequest, { type: "team.member.list_templates.request" }>,
        ),
      "team.member.list_home_files.request": (msg) =>
        this.handleMemberListHomeFiles(
          msg as Extract<TeamRequest, { type: "team.member.list_home_files.request" }>,
        ),
      "team.member.read_home_file.request": (msg) =>
        this.handleMemberReadHomeFile(
          msg as Extract<TeamRequest, { type: "team.member.read_home_file.request" }>,
        ),
      "team.task.list.request": (msg) =>
        this.handleTaskList(msg as Extract<TeamRequest, { type: "team.task.list.request" }>),
      "team.task.get.request": (msg) =>
        this.handleTaskGet(msg as Extract<TeamRequest, { type: "team.task.get.request" }>),
      "team.task.create.request": (msg) =>
        this.handleTaskCreate(msg as Extract<TeamRequest, { type: "team.task.create.request" }>),
      "team.task.update.request": (msg) =>
        this.handleTaskUpdate(msg as Extract<TeamRequest, { type: "team.task.update.request" }>),
      "team.task.set_claim.request": (msg) =>
        this.handleTaskSetClaim(
          msg as Extract<TeamRequest, { type: "team.task.set_claim.request" }>,
        ),
      "team.task.delete.request": (msg) =>
        this.handleTaskDelete(msg as Extract<TeamRequest, { type: "team.task.delete.request" }>),
      "team.project.get_settings.request": (msg) =>
        this.handleProjectGetSettings(
          msg as Extract<TeamRequest, { type: "team.project.get_settings.request" }>,
        ),
      "team.project.update_settings.request": (msg) =>
        this.handleProjectUpdateSettings(
          msg as Extract<TeamRequest, { type: "team.project.update_settings.request" }>,
        ),
      "team.project.stop_all.request": (msg) =>
        this.handleProjectStopAll(
          msg as Extract<TeamRequest, { type: "team.project.stop_all.request" }>,
        ),
      "team.project.resume.request": (msg) =>
        this.handleProjectResume(
          msg as Extract<TeamRequest, { type: "team.project.resume.request" }>,
        ),
      "team.project.adopt_legacy_chat.request": (msg) =>
        this.handleProjectAdoptLegacyChat(
          msg as Extract<TeamRequest, { type: "team.project.adopt_legacy_chat.request" }>,
        ),
    };
    this.service.subscribe((event) => {
      if (event.type === "team.message.posted") {
        this.emit({
          type: "team.message.posted",
          payload: {
            projectId: event.projectId,
            message: event.message,
          },
        });
        return;
      }
      if (event.type === "team.task.changed") {
        this.emit({
          type: "team.task.changed",
          payload: {
            projectId: event.projectId,
            task: event.task,
          },
        });
        return;
      }
      if (event.type === "team.project.stopped") {
        this.emit({
          type: "team.project.stopped",
          payload: {
            projectId: event.projectId,
            task: event.task,
            reason: event.reason,
          },
        });
      }
    });
  }

  public async handle(msg: TeamRequest): Promise<void> {
    const handler = this.handlers[msg.type];
    if (handler) {
      await handler(msg);
      return;
    }
    this.emitNotImplemented(msg);
  }

  private handleChannelList(
    msg: Extract<TeamRequest, { type: "team.channel.list.request" }>,
  ): void {
    this.emit({
      type: "team.channel.list.response",
      payload: {
        requestId: msg.requestId,
        error: null,
        channels: this.service.listChannels(msg.projectId),
      },
    });
  }

  private handleChannelCreate(
    msg: Extract<TeamRequest, { type: "team.channel.create.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.channel.create.response",
      msg.requestId,
      () => ({ channel: this.service.createChannel(msg) }),
      { channel: null },
    );
  }

  private handleChannelUpdate(
    msg: Extract<TeamRequest, { type: "team.channel.update.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.channel.update.response",
      msg.requestId,
      () => ({
        channel: this.service.updateChannel({
          projectId: msg.projectId,
          channelId: msg.channelId,
          name: msg.name,
          purpose: msg.purpose,
        }),
      }),
      { channel: null },
    );
  }

  private handleChannelDelete(
    msg: Extract<TeamRequest, { type: "team.channel.delete.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.channel.delete.response",
      msg.requestId,
      () => ({ channelId: this.service.deleteChannel(msg.projectId, msg.channelId) }),
      { channelId: null },
    );
  }

  private handleMessageList(
    msg: Extract<TeamRequest, { type: "team.message.list.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.message.list.response",
      msg.requestId,
      () => {
        const page = this.service.listMessages(msg);
        return {
          messages: page.messages,
          nextCursor: page.nextCursor,
        };
      },
      { messages: [], nextCursor: null },
    );
  }

  private handleMessagePost(
    msg: Extract<TeamRequest, { type: "team.message.post.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.message.post.response",
      msg.requestId,
      async () => {
        const message = this.service.postMessage({
          projectId: msg.projectId,
          channelId: msg.channelId,
          authorMemberId: this.service.getHumanMember().id,
          body: msg.body,
          replyToMessageId: msg.replyToMessageId,
        });
        await this.lifecycle?.deliverMentions({
          projectId: msg.projectId,
          message,
        });
        return { message };
      },
      { message: null },
    );
  }

  private handleMemberList(msg: Extract<TeamRequest, { type: "team.member.list.request" }>): void {
    this.emit({
      type: "team.member.list.response",
      payload: {
        requestId: msg.requestId,
        error: null,
        members: this.service.listMembers(msg.projectId),
      },
    });
  }

  private handleMemberCreate(
    msg: Extract<TeamRequest, { type: "team.member.create.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.create.response",
      msg.requestId,
      () => ({
        member: this.service.createMember({
          projectId: msg.projectId,
          name: msg.name,
          description: msg.description,
          provider: msg.provider,
          model: msg.model,
          homeWorkspaceId: msg.homeWorkspaceId,
        }),
      }),
      { member: null },
    );
  }

  private handleMemberUpdate(
    msg: Extract<TeamRequest, { type: "team.member.update.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.update.response",
      msg.requestId,
      () => ({
        member: this.service.updateMember({
          memberId: msg.memberId,
          name: msg.name,
          description: msg.description,
          provider: msg.provider,
          model: msg.model,
          modeId: msg.modeId,
          rolePrompt: msg.rolePrompt,
          templateId: msg.templateId,
        }),
      }),
      { member: null },
    );
  }

  private handleMemberAssign(
    msg: Extract<TeamRequest, { type: "team.member.assign.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.assign.response",
      msg.requestId,
      () => ({
        member: this.service.assignMember({
          projectId: msg.projectId,
          memberId: msg.memberId,
          homeWorkspaceId: msg.homeWorkspaceId,
        }),
      }),
      { member: null },
    );
  }

  private handleMemberRemove(
    msg: Extract<TeamRequest, { type: "team.member.remove.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.remove.response",
      msg.requestId,
      () => ({ memberId: this.service.removeMember(msg.projectId, msg.memberId) }),
      { memberId: null },
    );
  }

  private handleMemberStart(
    msg: Extract<TeamRequest, { type: "team.member.start.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.start.response",
      msg.requestId,
      async () => {
        if (!this.lifecycle) {
          throw new Error("Members cannot be started without an agent runtime.");
        }
        await this.lifecycle.start({ projectId: msg.projectId, memberId: msg.memberId });
        return { member: this.service.getMember(msg.memberId) };
      },
      { member: null },
    );
  }

  private handleMemberStop(
    msg: Extract<TeamRequest, { type: "team.member.stop.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.stop.response",
      msg.requestId,
      async () => {
        if (!this.lifecycle) {
          throw new Error("Members cannot be stopped without an agent runtime.");
        }
        await this.lifecycle.stop({ projectId: msg.projectId, memberId: msg.memberId });
        return { member: this.service.getMember(msg.memberId) };
      },
      { member: null },
    );
  }

  private handleMemberListTemplates(
    msg: Extract<TeamRequest, { type: "team.member.list_templates.request" }>,
  ): void {
    this.emit({
      type: "team.member.list_templates.response",
      payload: {
        requestId: msg.requestId,
        error: null,
        templates: this.service.listRoleTemplates(),
      },
    });
  }

  private handleMemberListHomeFiles(
    msg: Extract<TeamRequest, { type: "team.member.list_home_files.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.list_home_files.response",
      msg.requestId,
      () => ({ ...this.service.listMemberHomeFiles(msg.memberId, msg.path) }),
      { memberId: msg.memberId, path: ".", entries: [] },
    );
  }

  private handleMemberReadHomeFile(
    msg: Extract<TeamRequest, { type: "team.member.read_home_file.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.member.read_home_file.response",
      msg.requestId,
      () => ({ ...this.service.readMemberHomeFile(msg.memberId, msg.path) }),
      { memberId: msg.memberId, path: msg.path, content: null },
    );
  }

  private handleTaskList(msg: Extract<TeamRequest, { type: "team.task.list.request" }>): void {
    this.emit({
      type: "team.task.list.response",
      payload: {
        requestId: msg.requestId,
        error: null,
        tasks: this.service.listTasks(msg),
      },
    });
  }

  private handleTaskGet(
    msg: Extract<TeamRequest, { type: "team.task.get.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.task.get.response",
      msg.requestId,
      () => ({ task: this.service.getTask(msg.projectId, msg.taskId) }),
      { task: null },
    );
  }

  private handleTaskCreate(
    msg: Extract<TeamRequest, { type: "team.task.create.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.task.create.response",
      msg.requestId,
      () => ({
        task: this.service.createTask({
          projectId: msg.projectId,
          title: msg.title,
          body: msg.body,
          creatorMemberId: this.service.getHumanMember().id,
          assigneeMemberId: msg.assigneeMemberId,
          dependsOnTaskIds: msg.dependsOn,
        }),
      }),
      { task: null },
    );
  }

  private handleTaskUpdate(
    msg: Extract<TeamRequest, { type: "team.task.update.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.task.update.response",
      msg.requestId,
      () => ({
        task: this.service.updateTask({
          projectId: msg.projectId,
          taskId: msg.taskId,
          title: msg.title,
          body: msg.body,
          status: msg.status,
          assigneeMemberId: msg.assigneeMemberId,
          dependsOnTaskIds: msg.dependsOn,
          acceptanceCriteria: msg.acceptanceCriteria,
          bypassClaim: true,
        }),
      }),
      { task: null },
    );
  }

  private handleTaskSetClaim(
    msg: Extract<TeamRequest, { type: "team.task.set_claim.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.task.set_claim.response",
      msg.requestId,
      () => ({
        task: this.service.overrideTaskClaim(msg.projectId, msg.taskId, msg.claimantMemberId),
      }),
      { task: null },
    );
  }

  private handleTaskDelete(
    msg: Extract<TeamRequest, { type: "team.task.delete.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.task.delete.response",
      msg.requestId,
      () => ({ taskId: this.service.deleteTask(msg.projectId, msg.taskId) }),
      { taskId: null },
    );
  }

  private handleProjectGetSettings(
    msg: Extract<TeamRequest, { type: "team.project.get_settings.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.project.get_settings.response",
      msg.requestId,
      async () => ({
        settings: this.service.getProjectSettings(msg.projectId),
        legacyChatAdoption: await this.service.getLegacyChatAdoptionState(),
      }),
      { settings: null },
    );
  }

  private handleProjectUpdateSettings(
    msg: Extract<TeamRequest, { type: "team.project.update_settings.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.project.update_settings.response",
      msg.requestId,
      () => ({
        settings: this.service.updateProjectSettings(msg.projectId, msg.settings),
      }),
      { settings: null },
    );
  }

  private handleProjectStopAll(
    msg: Extract<TeamRequest, { type: "team.project.stop_all.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.project.stop_all.response",
      msg.requestId,
      () => ({ reason: this.service.stopProject(msg.projectId) }),
      { reason: null },
    );
  }

  private handleProjectResume(
    msg: Extract<TeamRequest, { type: "team.project.resume.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.project.resume.response",
      msg.requestId,
      () => ({ ...this.service.resumeProject(msg.projectId, msg.taskId) }),
      { taskId: null },
    );
  }

  private handleProjectAdoptLegacyChat(
    msg: Extract<TeamRequest, { type: "team.project.adopt_legacy_chat.request" }>,
  ): Promise<void> {
    return this.emitResult(
      "team.project.adopt_legacy_chat.response",
      msg.requestId,
      async () => ({
        projectId: msg.projectId,
        legacyChatAdoption: await this.service.adoptLegacyChat(msg.projectId),
      }),
      { projectId: null },
    );
  }

  private emitNotImplemented(msg: TeamRequest): void {
    this.emit({
      type: "rpc_error",
      payload: {
        requestId: msg.requestId,
        requestType: msg.type,
        error: `${msg.type} is not implemented in Phase 2`,
        code: "not_implemented",
      },
    });
  }

  private emitResult(
    type: SessionOutboundMessage["type"],
    requestId: string,
    buildPayload: () => Promise<Record<string, unknown>> | Record<string, unknown>,
    fallback: Record<string, unknown>,
  ): Promise<void> {
    return this.emitResultInternal(type, requestId, buildPayload, fallback);
  }

  private async emitResultInternal(
    type: SessionOutboundMessage["type"],
    requestId: string,
    buildPayload: () => Promise<Record<string, unknown>> | Record<string, unknown>,
    fallback: Record<string, unknown>,
  ): Promise<void> {
    try {
      const payload = await buildPayload();
      this.emit({
        type,
        payload: {
          requestId,
          error: null,
          ...payload,
        },
      } as SessionOutboundMessage);
    } catch (error) {
      this.emit({
        type,
        payload: {
          requestId,
          error: error instanceof Error ? error.message : String(error),
          ...fallback,
        },
      } as SessionOutboundMessage);
    }
  }
}

function createMemberLifecycle(session: Session, service: TeamService): MemberLifecycle | null {
  const workspaceRegistry = Reflect.get(session, "workspaceRegistry");
  const agentManager = Reflect.get(session, "agentManager");
  const sessionLogger = Reflect.get(session, "sessionLogger");
  if (!workspaceRegistry || !agentManager || !sessionLogger) {
    return null;
  }
  return new MemberLifecycle({
    teamService: service,
    agentManager,
    workspaceRegistry,
    logger: sessionLogger,
  });
}

declare module "../session.js" {
  interface Session {
    /** Undefined when the daemon was built without a team runtime. See `attachTeamSession`. */
    readonly teamSession?: TeamSession;
  }
}
