import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamTask } from "@getpaseo/protocol/team/types";
import type {
  TeamTaskCreateResponse,
  TeamTaskGetResponse,
  TeamTaskListResponse,
  TeamTaskSetClaimResponse,
  TeamTaskUpdateResponse,
} from "@getpaseo/protocol/team/rpc-schemas";

type TeamTaskClientRequest =
  | {
      type: "team.task.list.request";
      requestId: string;
      projectId: string;
      status?: TeamTask["status"];
      assigneeMemberId?: string;
      creatorMemberId?: string;
    }
  | {
      type: "team.task.get.request";
      requestId: string;
      projectId: string;
      taskId: string;
    }
  | {
      type: "team.task.update.request";
      requestId: string;
      projectId: string;
      taskId: string;
      title?: string;
      body?: string | null;
      status?: TeamTask["status"];
      assigneeMemberId?: string | null;
      dependsOn?: string[];
      acceptanceCriteria?: TeamTask["acceptanceCriteria"];
    }
  | {
      type: "team.task.set_claim.request";
      requestId: string;
      projectId: string;
      taskId: string;
      claimantMemberId: string | null;
    }
  | {
      type: "team.task.create.request";
      requestId: string;
      projectId: string;
      title: string;
      body?: string;
      assigneeMemberId?: string;
      dependsOn?: string[];
    };

interface TeamResponsePayload {
  error?: string | null;
}

interface PrivateDaemonClient {
  sendRequest<T>(params: {
    requestId: string;
    message: TeamTaskClientRequest;
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

async function sendTeamTaskRequest<TPayload>(input: {
  client: DaemonClient;
  requestId: string;
  message: TeamTaskClientRequest;
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

export async function createTeamTask(input: {
  client: DaemonClient;
  projectId: string;
  title: string;
  body?: string;
  assigneeMemberId?: string;
}): Promise<TeamTask | null> {
  const requestId = createRequestId("team-task-create");
  const payload = await sendTeamTaskRequest<TeamTaskCreateResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.task.create.request",
      requestId,
      projectId: input.projectId,
      title: input.title,
      ...(input.body ? { body: input.body } : {}),
      ...(input.assigneeMemberId ? { assigneeMemberId: input.assigneeMemberId } : {}),
    },
    responseType: "team.task.create.response",
  });
  throwTeamError(payload);
  return payload.task;
}

export async function listTeamTasks(input: {
  client: DaemonClient;
  projectId: string;
  status?: TeamTask["status"];
  assigneeMemberId?: string;
  creatorMemberId?: string;
}): Promise<TeamTask[]> {
  const requestId = createRequestId("team-task-list");
  const payload = await sendTeamTaskRequest<TeamTaskListResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.task.list.request",
      requestId,
      projectId: input.projectId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.assigneeMemberId ? { assigneeMemberId: input.assigneeMemberId } : {}),
      ...(input.creatorMemberId ? { creatorMemberId: input.creatorMemberId } : {}),
    },
    responseType: "team.task.list.response",
  });
  throwTeamError(payload);
  return payload.tasks;
}

export async function getTeamTask(input: {
  client: DaemonClient;
  projectId: string;
  taskId: string;
}): Promise<TeamTask | null> {
  const requestId = createRequestId("team-task-get");
  const payload = await sendTeamTaskRequest<TeamTaskGetResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.task.get.request",
      requestId,
      projectId: input.projectId,
      taskId: input.taskId,
    },
    responseType: "team.task.get.response",
  });
  throwTeamError(payload);
  return payload.task;
}

export async function updateTeamTask(input: {
  client: DaemonClient;
  projectId: string;
  taskId: string;
  title?: string;
  body?: string | null;
  status?: TeamTask["status"];
  assigneeMemberId?: string | null;
  dependsOn?: string[];
  acceptanceCriteria?: TeamTask["acceptanceCriteria"];
}): Promise<TeamTask | null> {
  const requestId = createRequestId("team-task-update");
  const payload = await sendTeamTaskRequest<TeamTaskUpdateResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.task.update.request",
      requestId,
      projectId: input.projectId,
      taskId: input.taskId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assigneeMemberId !== undefined ? { assigneeMemberId: input.assigneeMemberId } : {}),
      ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
      ...(input.acceptanceCriteria !== undefined
        ? { acceptanceCriteria: input.acceptanceCriteria }
        : {}),
    },
    responseType: "team.task.update.response",
  });
  throwTeamError(payload);
  return payload.task;
}

export async function setTeamTaskClaim(input: {
  client: DaemonClient;
  projectId: string;
  taskId: string;
  claimantMemberId: string | null;
}): Promise<TeamTask | null> {
  const requestId = createRequestId("team-task-claim");
  const payload = await sendTeamTaskRequest<TeamTaskSetClaimResponse["payload"]>({
    client: input.client,
    requestId,
    message: {
      type: "team.task.set_claim.request",
      requestId,
      projectId: input.projectId,
      taskId: input.taskId,
      claimantMemberId: input.claimantMemberId,
    },
    responseType: "team.task.set_claim.response",
  });
  throwTeamError(payload);
  return payload.task;
}
