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

  constructor(options: {
    service: TeamService;
    emit: (message: SessionOutboundMessage) => void;
    lifecycle?: MemberLifecycle | null;
  }) {
    this.service = options.service;
    this.emit = options.emit;
    this.lifecycle = options.lifecycle ?? null;
    this.service.subscribe((event) => {
      if (event.type === "team.message.posted") {
        this.emit({
          type: "team.message.posted",
          payload: {
            projectId: event.projectId,
            message: event.message,
          },
        });
      }
    });
  }

  public async handle(msg: TeamRequest): Promise<void> {
    switch (msg.type) {
      case "team.channel.list.request":
        this.emit({
          type: "team.channel.list.response",
          payload: {
            requestId: msg.requestId,
            error: null,
            channels: this.service.listChannels(msg.projectId),
          },
        });
        return;
      case "team.channel.create.request":
        return this.emitResult(
          "team.channel.create.response",
          msg.requestId,
          () => ({ channel: this.service.createChannel(msg) }),
          { channel: null },
        );
      case "team.channel.update.request":
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
      case "team.channel.delete.request":
        return this.emitResult(
          "team.channel.delete.response",
          msg.requestId,
          () => ({
            channelId: this.service.deleteChannel(msg.projectId, msg.channelId),
          }),
          { channelId: null },
        );
      case "team.message.list.request":
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
      case "team.message.post.request":
        return this.emitResult(
          "team.message.post.response",
          msg.requestId,
          async () => {
            const postTeamMessage = this.service.postMessage.bind(this.service);
            const message = postTeamMessage({
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
      case "team.member.list.request":
        this.emit({
          type: "team.member.list.response",
          payload: {
            requestId: msg.requestId,
            error: null,
            members: this.service.listMembers(msg.projectId),
          },
        });
        return;
      case "team.member.create.request":
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
      case "team.member.update.request":
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
      case "team.member.assign.request":
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
      case "team.member.remove.request":
        return this.emitResult(
          "team.member.remove.response",
          msg.requestId,
          () => ({
            memberId: this.service.removeMember(msg.projectId, msg.memberId),
          }),
          { memberId: null },
        );
      case "team.member.list_templates.request":
        this.emit({
          type: "team.member.list_templates.response",
          payload: {
            requestId: msg.requestId,
            error: null,
            templates: this.service.listRoleTemplates(),
          },
        });
        return;
      case "team.member.list_home_files.request":
        return this.emitResult(
          "team.member.list_home_files.response",
          msg.requestId,
          () => ({ ...this.service.listMemberHomeFiles(msg.memberId, msg.path) }),
          { memberId: msg.memberId, path: ".", entries: [] },
        );
      case "team.member.read_home_file.request":
        return this.emitResult(
          "team.member.read_home_file.response",
          msg.requestId,
          () => ({ ...this.service.readMemberHomeFile(msg.memberId, msg.path) }),
          { memberId: msg.memberId, path: msg.path, content: null },
        );
      default:
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
