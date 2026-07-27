import type { SessionInboundMessage, SessionOutboundMessage } from "../messages.js";
import { TeamRequestSchemas } from "@getpaseo/protocol/team/rpc-schemas";
import type { z } from "zod";
import type { Session } from "../session.js";
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

export function attachTeamSession(session: Session): void {
  if (!teamService) {
    throw new Error("Team runtime is not configured");
  }

  Object.defineProperty(session, "teamSession", {
    value: new TeamSession({
      service: teamService,
      emit: (message) => session.emitServerMessage(message),
    }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export class TeamSession {
  private readonly service: TeamService;
  private readonly emit: (message: SessionOutboundMessage) => void;

  constructor(options: { service: TeamService; emit: (message: SessionOutboundMessage) => void }) {
    this.service = options.service;
    this.emit = options.emit;
  }

  public async handle(msg: TeamRequest): Promise<void> {
    switch (msg.type) {
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
        this.emit({
          type: "team.member.create.response",
          payload: {
            requestId: msg.requestId,
            error: null,
            member: this.service.createMember({
              projectId: msg.projectId,
              name: msg.name,
              description: msg.description,
              provider: msg.provider,
              model: msg.model,
              homeWorkspaceId: msg.homeWorkspaceId,
            }),
          },
        });
        return;
      case "team.member.remove.request":
        this.emit({
          type: "team.member.remove.response",
          payload: {
            requestId: msg.requestId,
            error: null,
            memberId: this.service.removeMember(msg.projectId, msg.memberId),
          },
        });
        return;
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
}

declare module "../session.js" {
  interface Session {
    readonly teamSession: TeamSession;
  }
}
