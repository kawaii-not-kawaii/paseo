import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  TeamChannel,
  TeamHomeFileEntry,
  TeamMember,
  TeamMessage,
  TeamProjectMaintenance,
  TeamProjectSettings,
  TeamRoleTemplate,
} from "@getpaseo/protocol/team/types";
import type {
  TeamChannelListResponse,
  TeamMemberAssignResponse,
  TeamMemberCreateResponse,
  TeamMemberListResponse,
  TeamMemberListHomeFilesResponse,
  TeamMemberListTemplatesResponse,
  TeamMemberReadHomeFileResponse,
  TeamMemberRemoveResponse,
  TeamMemberStartResponse,
  TeamMemberStopResponse,
  TeamMemberUpdateResponse,
  TeamMessageListResponse,
  TeamMessagePostResponse,
  TeamProjectAdoptLegacyChatResponse,
  TeamProjectGetSettingsResponse,
  TeamProjectRestoreSnapshotResponse,
  TeamProjectUpdateSettingsResponse,
} from "@getpaseo/protocol/team/rpc-schemas";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";

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
      type: "team.member.create.request";
      requestId: string;
      projectId: string;
      name: string;
      description?: string;
      provider: AgentProvider;
      model?: string;
      homeWorkspaceId: string;
      modeId?: string | null;
      rolePrompt?: string;
      templateId?: string | null;
    }
  | {
      type: "team.member.update.request";
      requestId: string;
      memberId: string;
      name?: string;
      description?: string | null;
      provider?: AgentProvider;
      model?: string | null;
      modeId?: string | null;
      rolePrompt?: string;
      templateId?: string | null;
    }
  | {
      type: "team.member.assign.request";
      requestId: string;
      projectId: string;
      memberId: string;
      homeWorkspaceId: string;
    }
  | {
      type: "team.member.remove.request";
      requestId: string;
      projectId: string;
      memberId: string;
    }
  | {
      type: "team.member.start.request";
      requestId: string;
      projectId: string;
      memberId: string;
    }
  | {
      type: "team.member.stop.request";
      requestId: string;
      projectId: string;
      memberId: string;
    }
  | {
      type: "team.member.list_templates.request";
      requestId: string;
    }
  | {
      type: "team.member.list_home_files.request";
      requestId: string;
      memberId: string;
      path?: string;
    }
  | {
      type: "team.member.read_home_file.request";
      requestId: string;
      memberId: string;
      path: string;
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
    }
  | {
      type: "team.project.update_settings.request";
      requestId: string;
      projectId: string;
      settings: TeamProjectSettings;
    }
  | {
      type: "team.project.adopt_legacy_chat.request";
      requestId: string;
      projectId: string;
    }
  | {
      type: "team.project.restore_snapshot.request";
      requestId: string;
      projectId: string;
    };

type TeamClientResponse =
  | TeamChannelListResponse["payload"]
  | TeamMemberAssignResponse["payload"]
  | TeamMemberCreateResponse["payload"]
  | TeamMemberListResponse["payload"]
  | TeamMemberListHomeFilesResponse["payload"]
  | TeamMemberListTemplatesResponse["payload"]
  | TeamMemberReadHomeFileResponse["payload"]
  | TeamMemberRemoveResponse["payload"]
  | TeamMemberStartResponse["payload"]
  | TeamMemberStopResponse["payload"]
  | TeamMemberUpdateResponse["payload"]
  | TeamMessageListResponse["payload"]
  | TeamMessagePostResponse["payload"]
  | TeamProjectAdoptLegacyChatResponse["payload"]
  | TeamProjectRestoreSnapshotResponse["payload"]
  | TeamProjectGetSettingsResponse["payload"]
  | TeamProjectUpdateSettingsResponse["payload"];

interface TeamResponsePayload {
  error?: string | null;
}

export interface TeamLegacyChatAdoptionState {
  status: "none" | "pending" | "adopted";
  roomCount: number;
  messageCount: number;
  projectId: string | null;
}

export interface TeamProjectSettingsState {
  settings: TeamProjectSettings | null;
  legacyChatAdoption: TeamLegacyChatAdoptionState | null;
  maintenance: TeamProjectMaintenance | null;
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

export async function createTeamMember(input: {
  client: DaemonClient;
  projectId: string;
  name: string;
  description?: string;
  provider: AgentProvider;
  model?: string | null;
  homeWorkspaceId: string;
  modeId?: string | null;
  rolePrompt?: string;
  templateId?: string | null;
}): Promise<TeamMember | null> {
  const requestId = createRequestId("team-member-create");
  const payload = await sendTeamRequest<TeamMemberCreateResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.create.request",
      requestId,
      projectId: input.projectId,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      provider: input.provider,
      ...(input.model ? { model: input.model } : {}),
      homeWorkspaceId: input.homeWorkspaceId,
      ...(input.modeId !== undefined ? { modeId: input.modeId } : {}),
      ...(input.rolePrompt !== undefined ? { rolePrompt: input.rolePrompt } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    },
    responseType: "team.member.create.response",
  });
  throwTeamError(payload);
  return payload.member;
}

export async function updateTeamMember(input: {
  client: DaemonClient;
  memberId: string;
  name?: string;
  description?: string | null;
  provider?: AgentProvider;
  model?: string | null;
  modeId?: string | null;
  rolePrompt?: string;
  templateId?: string | null;
}): Promise<TeamMember | null> {
  const requestId = createRequestId("team-member-update");
  const payload = await sendTeamRequest<TeamMemberUpdateResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.update.request",
      requestId,
      memberId: input.memberId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.modeId !== undefined ? { modeId: input.modeId } : {}),
      ...(input.rolePrompt !== undefined ? { rolePrompt: input.rolePrompt } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    },
    responseType: "team.member.update.response",
  });
  throwTeamError(payload);
  return payload.member;
}

export async function assignTeamMember(input: {
  client: DaemonClient;
  projectId: string;
  memberId: string;
  homeWorkspaceId: string;
}): Promise<TeamMember | null> {
  const requestId = createRequestId("team-member-assign");
  const payload = await sendTeamRequest<TeamMemberAssignResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.assign.request",
      requestId,
      projectId: input.projectId,
      memberId: input.memberId,
      homeWorkspaceId: input.homeWorkspaceId,
    },
    responseType: "team.member.assign.response",
  });
  throwTeamError(payload);
  return payload.member;
}

export async function removeTeamMember(input: {
  client: DaemonClient;
  projectId: string;
  memberId: string;
}): Promise<string | null> {
  const requestId = createRequestId("team-member-remove");
  const payload = await sendTeamRequest<TeamMemberRemoveResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.remove.request",
      requestId,
      projectId: input.projectId,
      memberId: input.memberId,
    },
    responseType: "team.member.remove.response",
  });
  throwTeamError(payload);
  return payload.memberId;
}

export async function startTeamMember(input: {
  client: DaemonClient;
  projectId: string;
  memberId: string;
}): Promise<TeamMember | null> {
  const requestId = createRequestId("team-member-start");
  const payload = await sendTeamRequest<TeamMemberStartResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.start.request",
      requestId,
      projectId: input.projectId,
      memberId: input.memberId,
    },
    responseType: "team.member.start.response",
  });
  throwTeamError(payload);
  return payload.member;
}

export async function stopTeamMember(input: {
  client: DaemonClient;
  projectId: string;
  memberId: string;
}): Promise<TeamMember | null> {
  const requestId = createRequestId("team-member-stop");
  const payload = await sendTeamRequest<TeamMemberStopResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.stop.request",
      requestId,
      projectId: input.projectId,
      memberId: input.memberId,
    },
    responseType: "team.member.stop.response",
  });
  throwTeamError(payload);
  return payload.member;
}

export async function listTeamMemberTemplates(client: DaemonClient): Promise<TeamRoleTemplate[]> {
  const requestId = createRequestId("team-member-list-templates");
  const payload = await sendTeamRequest<TeamMemberListTemplatesResponse["payload"]>({
    client,
    requestId,
    message: {
      type: "team.member.list_templates.request",
      requestId,
    },
    responseType: "team.member.list_templates.response",
  });
  throwTeamError(payload);
  return payload.templates;
}

export async function listTeamMemberHomeFiles(input: {
  client: DaemonClient;
  memberId: string;
  path?: string;
}): Promise<{ memberId: string; path: string; entries: TeamHomeFileEntry[] }> {
  const requestId = createRequestId("team-member-list-home-files");
  const payload = await sendTeamRequest<TeamMemberListHomeFilesResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.list_home_files.request",
      requestId,
      memberId: input.memberId,
      ...(input.path ? { path: input.path } : {}),
    },
    responseType: "team.member.list_home_files.response",
  });
  throwTeamError(payload);
  return {
    memberId: payload.memberId,
    path: payload.path,
    entries: payload.entries,
  };
}

export async function readTeamMemberHomeFile(input: {
  client: DaemonClient;
  memberId: string;
  path: string;
}): Promise<{ memberId: string; path: string; content: string | null }> {
  const requestId = createRequestId("team-member-read-home-file");
  const payload = await sendTeamRequest<TeamMemberReadHomeFileResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.member.read_home_file.request",
      requestId,
      memberId: input.memberId,
      path: input.path,
    },
    responseType: "team.member.read_home_file.response",
  });
  throwTeamError(payload);
  return {
    memberId: payload.memberId,
    path: payload.path,
    content: payload.content,
  };
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
  const result = await getTeamProjectSettingsState(client, projectId);
  return result.settings;
}

export async function getTeamProjectSettingsState(
  client: DaemonClient,
  projectId: string,
): Promise<TeamProjectSettingsState> {
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
  return {
    settings: payload.settings,
    legacyChatAdoption:
      (
        payload as TeamProjectGetSettingsResponse["payload"] & {
          legacyChatAdoption?: TeamLegacyChatAdoptionState;
        }
      ).legacyChatAdoption ?? null,
    maintenance:
      (
        payload as TeamProjectGetSettingsResponse["payload"] & {
          maintenance?: TeamProjectMaintenance;
        }
      ).maintenance ?? null,
  };
}

export async function updateTeamProjectSettings(input: {
  client: DaemonClient;
  projectId: string;
  settings: TeamProjectSettings;
}): Promise<TeamProjectSettings | null> {
  const requestId = createRequestId("team-project-settings-update");
  const payload = await sendTeamRequest<TeamProjectUpdateSettingsResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.project.update_settings.request",
      requestId,
      projectId: input.projectId,
      settings: input.settings,
    },
    responseType: "team.project.update_settings.response",
  });
  throwTeamError(payload);
  return payload.settings;
}

export async function adoptLegacyTeamChat(input: {
  client: DaemonClient;
  projectId: string;
}): Promise<TeamLegacyChatAdoptionState | null> {
  const requestId = createRequestId("team-project-adopt-legacy-chat");
  const payload = await sendTeamRequest<TeamProjectAdoptLegacyChatResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.project.adopt_legacy_chat.request",
      requestId,
      projectId: input.projectId,
    },
    responseType: "team.project.adopt_legacy_chat.response",
  });
  throwTeamError(payload);
  return (
    (
      payload as TeamProjectAdoptLegacyChatResponse["payload"] & {
        legacyChatAdoption?: TeamLegacyChatAdoptionState;
      }
    ).legacyChatAdoption ?? null
  );
}

export async function restoreTeamProjectSnapshot(input: {
  client: DaemonClient;
  projectId: string;
}): Promise<TeamProjectMaintenance | null> {
  const requestId = createRequestId("team-project-restore-snapshot");
  const payload = await sendTeamRequest<TeamProjectRestoreSnapshotResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.project.restore_snapshot.request",
      requestId,
      projectId: input.projectId,
    },
    responseType: "team.project.restore_snapshot.response",
  });
  throwTeamError(payload);
  return (
    (
      payload as TeamProjectRestoreSnapshotResponse["payload"] & {
        maintenance?: TeamProjectMaintenance;
      }
    ).maintenance ?? null
  );
}
