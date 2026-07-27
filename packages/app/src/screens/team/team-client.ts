import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  TeamChannel,
  TeamMember,
  TeamMessage,
  TeamProjectSettings,
} from "@getpaseo/protocol/team/types";
import type {
  TeamChannelListResponse,
  TeamMemberListResponse,
  TeamMessageListResponse,
  TeamMessagePostResponse,
  TeamProjectGetSettingsResponse,
} from "@getpaseo/protocol/team/rpc-schemas";

type TeamClientRequest =
  | {
      type: "team.channel.list.request";
      requestId: string;
      projectId: string;
    }
  | {
      type: "team.member.list.request";
      requestId: string;
      projectId: string;
    }
  | {
      type: "team.message.list.request";
      requestId: string;
      projectId: string;
      channelId: string;
      before?: string;
      limit?: number;
    }
  | {
      type: "team.message.post.request";
      requestId: string;
      projectId: string;
      channelId: string;
      body: string;
      replyToMessageId?: string;
    }
  | {
      type: "team.project.get_settings.request";
      requestId: string;
      projectId: string;
    };

type TeamClientResponse =
  | TeamChannelListResponse["payload"]
  | TeamMemberListResponse["payload"]
  | TeamMessageListResponse["payload"]
  | TeamMessagePostResponse["payload"]
  | TeamProjectGetSettingsResponse["payload"];

interface TeamResponsePayload {
  error?: string | null;
}

interface PrivateDaemonClient {
  sendRequest<T>(params: {
    requestId: string;
    message: TeamClientRequest;
    timeout?: number;
    select: (message: { type: string; payload: { requestId?: string } }) => T | null;
  }): Promise<T>;
}

function asTeamClient(client: DaemonClient): PrivateDaemonClient {
  return client as unknown as PrivateDaemonClient;
}

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sendTeamRequest<TPayload extends TeamClientResponse>(input: {
  client: DaemonClient;
  requestId: string;
  message: TeamClientRequest;
  responseType: string;
}): Promise<TPayload> {
  return asTeamClient(input.client).sendRequest<TPayload>({
    requestId: input.requestId,
    message: input.message,
    select: (message) => {
      if (message.type !== input.responseType) {
        return null;
      }
      if (message.payload.requestId !== input.requestId) {
        return null;
      }
      return message.payload as TPayload;
    },
  });
}

function throwTeamError(payload: TeamResponsePayload): void {
  if (payload.error) {
    throw new Error(payload.error);
  }
}

export async function listTeamChannels(
  client: DaemonClient,
  projectId: string,
): Promise<TeamChannel[]> {
  const requestId = createRequestId("team-channel-list");
  const payload = await sendTeamRequest<TeamChannelListResponse["payload"]>({
    client,
    requestId,
    message: {
      type: "team.channel.list.request",
      requestId,
      projectId,
    },
    responseType: "team.channel.list.response",
  });
  throwTeamError(payload);
  return payload.channels;
}

export async function listTeamMembers(
  client: DaemonClient,
  projectId: string,
): Promise<TeamMember[]> {
  const requestId = createRequestId("team-member-list");
  const payload = await sendTeamRequest<TeamMemberListResponse["payload"]>({
    client,
    requestId,
    message: {
      type: "team.member.list.request",
      requestId,
      projectId,
    },
    responseType: "team.member.list.response",
  });
  throwTeamError(payload);
  return payload.members;
}

export async function listTeamMessages(input: {
  client: DaemonClient;
  projectId: string;
  channelId: string;
  before?: string;
  limit?: number;
}): Promise<{ messages: TeamMessage[]; nextCursor: string | null }> {
  const requestId = createRequestId("team-message-list");
  const payload = await sendTeamRequest<TeamMessageListResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.message.list.request",
      requestId,
      projectId: input.projectId,
      channelId: input.channelId,
      ...(input.before ? { before: input.before } : {}),
      ...(input.limit ? { limit: input.limit } : {}),
    },
    responseType: "team.message.list.response",
  });
  throwTeamError(payload);
  return { messages: payload.messages, nextCursor: payload.nextCursor };
}

export async function postTeamMessage(input: {
  client: DaemonClient;
  projectId: string;
  channelId: string;
  body: string;
}): Promise<TeamMessage | null> {
  const requestId = createRequestId("team-message-post");
  const payload = await sendTeamRequest<TeamMessagePostResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.message.post.request",
      requestId,
      projectId: input.projectId,
      channelId: input.channelId,
      body: input.body,
    },
    responseType: "team.message.post.response",
  });
  throwTeamError(payload);
  return payload.message;
}

export async function getTeamProjectSettings(
  client: DaemonClient,
  projectId: string,
): Promise<TeamProjectSettings | null> {
  const requestId = createRequestId("team-project-settings");
  const payload = await sendTeamRequest<TeamProjectGetSettingsResponse["payload"]>({
    client,
    requestId,
    message: {
      type: "team.project.get_settings.request",
      requestId,
      projectId,
    },
    responseType: "team.project.get_settings.response",
  });
  throwTeamError(payload);
  return payload.settings;
}
