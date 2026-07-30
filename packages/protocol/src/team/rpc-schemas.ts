import { z } from "zod";
import { AgentProviderSchema } from "../provider-manifest.js";
import { TeamServerFeaturesSchema } from "./capabilities.js";
import {
  TeamChannelSchema,
  TeamHomeFileEntrySchema,
  TeamMemberSchema,
  TeamMessageSchema,
  TeamProjectMaintenanceSchema,
  TeamProjectSettingsSchema,
  TeamRoleTemplateSchema,
  TeamTaskAcceptanceCriterionSchema,
  TeamTaskSchema,
  TeamTaskStatusSchema,
} from "./types.js";

const TeamResponseEnvelopeSchema = z.object({
  requestId: z.string(),
  error: z.string().nullable(),
});

const TeamMessageListCursorSchema = z.string();

const TeamTaskUpdatePatchSchema = z.object({
  title: z.string().optional(),
  body: z.string().nullable().optional(),
  status: TeamTaskStatusSchema.optional(),
  assigneeMemberId: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(TeamTaskAcceptanceCriterionSchema).optional(),
});

const TeamProjectStopReasonSchema = z.string();
const TeamLegacyChatAdoptionStateSchema = z.object({
  status: z.enum(["none", "pending", "adopted"]),
  roomCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  projectId: z.string().nullable(),
});

export const TeamChannelListRequestSchema = z.object({
  type: z.literal("team.channel.list.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const TeamChannelCreateRequestSchema = z.object({
  type: z.literal("team.channel.create.request"),
  requestId: z.string(),
  projectId: z.string(),
  name: z.string(),
  purpose: z.string().optional(),
});

export const TeamChannelUpdateRequestSchema = z.object({
  type: z.literal("team.channel.update.request"),
  requestId: z.string(),
  projectId: z.string(),
  channelId: z.string(),
  name: z.string().optional(),
  purpose: z.string().nullable().optional(),
});

export const TeamChannelDeleteRequestSchema = z.object({
  type: z.literal("team.channel.delete.request"),
  requestId: z.string(),
  projectId: z.string(),
  channelId: z.string(),
});

export const TeamChannelMarkReadRequestSchema = z.object({
  type: z.literal("team.channel.mark_read.request"),
  requestId: z.string(),
  projectId: z.string(),
  channelId: z.string(),
});

export const TeamMessageListRequestSchema = z.object({
  type: z.literal("team.message.list.request"),
  requestId: z.string(),
  projectId: z.string(),
  channelId: z.string(),
  before: TeamMessageListCursorSchema.optional(),
  limit: z.number().int().positive().optional(),
});

export const TeamMessagePostRequestSchema = z.object({
  type: z.literal("team.message.post.request"),
  requestId: z.string(),
  projectId: z.string(),
  channelId: z.string(),
  body: z.string(),
  replyToMessageId: z.string().optional(),
});

export const TeamTaskListRequestSchema = z.object({
  type: z.literal("team.task.list.request"),
  requestId: z.string(),
  projectId: z.string(),
  status: TeamTaskStatusSchema.optional(),
  assigneeMemberId: z.string().optional(),
  creatorMemberId: z.string().optional(),
});

export const TeamTaskGetRequestSchema = z.object({
  type: z.literal("team.task.get.request"),
  requestId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
});

export const TeamTaskCreateRequestSchema = z.object({
  type: z.literal("team.task.create.request"),
  requestId: z.string(),
  projectId: z.string(),
  title: z.string(),
  body: z.string().optional(),
  assigneeMemberId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
});

export const TeamTaskUpdateRequestSchema = z.object({
  type: z.literal("team.task.update.request"),
  requestId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
  ...TeamTaskUpdatePatchSchema.shape,
});

export const TeamTaskSetClaimRequestSchema = z.object({
  type: z.literal("team.task.set_claim.request"),
  requestId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
  claimantMemberId: z.string().nullable(),
});

export const TeamTaskDeleteRequestSchema = z.object({
  type: z.literal("team.task.delete.request"),
  requestId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
});

export const TeamMemberListRequestSchema = z.object({
  type: z.literal("team.member.list.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const TeamMemberCreateRequestSchema = z.object({
  type: z.literal("team.member.create.request"),
  requestId: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  provider: AgentProviderSchema,
  model: z.string().optional(),
  homeWorkspaceId: z.string(),
  // A member created without these has no role prompt until a follow-up update lands. A mention
  // arriving in that window starts it unconfigured, which FR-014a forbids: the role prompt applies
  // to every session the member runs, including its first.
  modeId: z.string().nullable().optional(),
  rolePrompt: z.string().optional(),
  templateId: z.string().nullable().optional(),
});

export const TeamMemberUpdateRequestSchema = z.object({
  type: z.literal("team.member.update.request"),
  requestId: z.string(),
  memberId: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  provider: AgentProviderSchema.optional(),
  model: z.string().nullable().optional(),
  modeId: z.string().nullable().optional(),
  rolePrompt: z.string().optional(),
  templateId: z.string().nullable().optional(),
});

export const TeamMemberAssignRequestSchema = z.object({
  type: z.literal("team.member.assign.request"),
  requestId: z.string(),
  projectId: z.string(),
  memberId: z.string(),
  homeWorkspaceId: z.string(),
});

export const TeamMemberRemoveRequestSchema = z.object({
  type: z.literal("team.member.remove.request"),
  requestId: z.string(),
  projectId: z.string(),
  memberId: z.string(),
});

export const TeamMemberStartRequestSchema = z.object({
  type: z.literal("team.member.start.request"),
  requestId: z.string(),
  projectId: z.string(),
  memberId: z.string(),
});

export const TeamMemberStopRequestSchema = z.object({
  type: z.literal("team.member.stop.request"),
  requestId: z.string(),
  projectId: z.string(),
  memberId: z.string(),
});

export const TeamMemberListTemplatesRequestSchema = z.object({
  type: z.literal("team.member.list_templates.request"),
  requestId: z.string(),
});

export const TeamMemberListHomeFilesRequestSchema = z.object({
  type: z.literal("team.member.list_home_files.request"),
  requestId: z.string(),
  memberId: z.string(),
  path: z.string().optional(),
});

export const TeamMemberReadHomeFileRequestSchema = z.object({
  type: z.literal("team.member.read_home_file.request"),
  requestId: z.string(),
  memberId: z.string(),
  path: z.string(),
});

export const TeamProjectGetSettingsRequestSchema = z.object({
  type: z.literal("team.project.get_settings.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const TeamProjectUpdateSettingsRequestSchema = z.object({
  type: z.literal("team.project.update_settings.request"),
  requestId: z.string(),
  projectId: z.string(),
  settings: TeamProjectSettingsSchema,
});

export const TeamProjectStopAllRequestSchema = z.object({
  type: z.literal("team.project.stop_all.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const TeamProjectResumeRequestSchema = z.object({
  type: z.literal("team.project.resume.request"),
  requestId: z.string(),
  projectId: z.string(),
  taskId: z.string().optional(),
});

export const TeamProjectAdoptLegacyChatRequestSchema = z.object({
  type: z.literal("team.project.adopt_legacy_chat.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const TeamProjectRestoreSnapshotRequestSchema = z.object({
  type: z.literal("team.project.restore_snapshot.request"),
  requestId: z.string(),
  projectId: z.string(),
});

export const TeamChannelListResponseSchema = z.object({
  type: z.literal("team.channel.list.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    channels: z.array(TeamChannelSchema),
  }),
});

export const TeamChannelCreateResponseSchema = z.object({
  type: z.literal("team.channel.create.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    channel: TeamChannelSchema.nullable(),
  }),
});

export const TeamChannelUpdateResponseSchema = z.object({
  type: z.literal("team.channel.update.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    channel: TeamChannelSchema.nullable(),
  }),
});

export const TeamChannelDeleteResponseSchema = z.object({
  type: z.literal("team.channel.delete.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    channelId: z.string().nullable(),
  }),
});

export const TeamChannelMarkReadResponseSchema = z.object({
  type: z.literal("team.channel.mark_read.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    channelId: z.string().nullable(),
  }),
});

export const TeamMessageListResponseSchema = z.object({
  type: z.literal("team.message.list.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    messages: z.array(TeamMessageSchema),
    nextCursor: TeamMessageListCursorSchema.nullable(),
  }),
});

export const TeamMessagePostResponseSchema = z.object({
  type: z.literal("team.message.post.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    message: TeamMessageSchema.nullable(),
  }),
});

export const TeamTaskListResponseSchema = z.object({
  type: z.literal("team.task.list.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    tasks: z.array(TeamTaskSchema),
  }),
});

export const TeamTaskGetResponseSchema = z.object({
  type: z.literal("team.task.get.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    task: TeamTaskSchema.nullable(),
  }),
});

export const TeamTaskCreateResponseSchema = z.object({
  type: z.literal("team.task.create.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    task: TeamTaskSchema.nullable(),
  }),
});

export const TeamTaskUpdateResponseSchema = z.object({
  type: z.literal("team.task.update.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    task: TeamTaskSchema.nullable(),
  }),
});

export const TeamTaskSetClaimResponseSchema = z.object({
  type: z.literal("team.task.set_claim.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    task: TeamTaskSchema.nullable(),
  }),
});

export const TeamTaskDeleteResponseSchema = z.object({
  type: z.literal("team.task.delete.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    taskId: z.string().nullable(),
  }),
});

export const TeamMemberListResponseSchema = z.object({
  type: z.literal("team.member.list.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    members: z.array(TeamMemberSchema),
  }),
});

export const TeamMemberCreateResponseSchema = z.object({
  type: z.literal("team.member.create.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    member: TeamMemberSchema.nullable(),
  }),
});

export const TeamMemberUpdateResponseSchema = z.object({
  type: z.literal("team.member.update.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    member: TeamMemberSchema.nullable(),
  }),
});

export const TeamMemberAssignResponseSchema = z.object({
  type: z.literal("team.member.assign.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    member: TeamMemberSchema.nullable(),
  }),
});

export const TeamMemberRemoveResponseSchema = z.object({
  type: z.literal("team.member.remove.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    memberId: z.string().nullable(),
  }),
});

export const TeamMemberStartResponseSchema = z.object({
  type: z.literal("team.member.start.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    member: TeamMemberSchema.nullable(),
  }),
});

export const TeamMemberStopResponseSchema = z.object({
  type: z.literal("team.member.stop.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    member: TeamMemberSchema.nullable(),
  }),
});

export const TeamMemberListTemplatesResponseSchema = z.object({
  type: z.literal("team.member.list_templates.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    templates: z.array(TeamRoleTemplateSchema),
  }),
});

export const TeamMemberListHomeFilesResponseSchema = z.object({
  type: z.literal("team.member.list_home_files.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    memberId: z.string(),
    path: z.string(),
    entries: z.array(TeamHomeFileEntrySchema),
  }),
});

export const TeamMemberReadHomeFileResponseSchema = z.object({
  type: z.literal("team.member.read_home_file.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    memberId: z.string(),
    path: z.string(),
    content: z.string().nullable(),
  }),
});

export const TeamProjectGetSettingsResponseSchema = z.object({
  type: z.literal("team.project.get_settings.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    settings: TeamProjectSettingsSchema.nullable(),
    legacyChatAdoption: TeamLegacyChatAdoptionStateSchema.optional(),
    maintenance: TeamProjectMaintenanceSchema.optional(),
  }),
});

export const TeamProjectUpdateSettingsResponseSchema = z.object({
  type: z.literal("team.project.update_settings.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    settings: TeamProjectSettingsSchema.nullable(),
  }),
});

export const TeamProjectStopAllResponseSchema = z.object({
  type: z.literal("team.project.stop_all.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    projectId: z.string().nullable(),
  }),
});

export const TeamProjectResumeResponseSchema = z.object({
  type: z.literal("team.project.resume.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    projectId: z.string().nullable(),
    taskId: z.string().nullable().optional(),
  }),
});

export const TeamProjectAdoptLegacyChatResponseSchema = z.object({
  type: z.literal("team.project.adopt_legacy_chat.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    projectId: z.string().nullable(),
    legacyChatAdoption: TeamLegacyChatAdoptionStateSchema.optional(),
  }),
});

export const TeamProjectRestoreSnapshotResponseSchema = z.object({
  type: z.literal("team.project.restore_snapshot.response"),
  payload: TeamResponseEnvelopeSchema.extend({
    projectId: z.string().nullable(),
    maintenance: TeamProjectMaintenanceSchema.optional(),
  }),
});

export const TeamMessagePostedSchema = z.object({
  type: z.literal("team.message.posted"),
  payload: z.object({
    projectId: z.string(),
    message: TeamMessageSchema,
  }),
});

export const TeamTaskChangedSchema = z.object({
  type: z.literal("team.task.changed"),
  payload: z.object({
    projectId: z.string(),
    task: TeamTaskSchema,
  }),
});

export const TeamMemberChangedSchema = z.object({
  type: z.literal("team.member.changed"),
  payload: z.object({
    projectId: z.string(),
    member: TeamMemberSchema,
  }),
});

export const TeamProjectStoppedSchema = z.object({
  type: z.literal("team.project.stopped"),
  payload: z.object({
    projectId: z.string(),
    reason: TeamProjectStopReasonSchema,
    task: TeamTaskSchema.nullable(),
  }),
});

export const TeamRequestSchemas = [
  TeamChannelListRequestSchema,
  TeamChannelCreateRequestSchema,
  TeamChannelUpdateRequestSchema,
  TeamChannelDeleteRequestSchema,
  TeamChannelMarkReadRequestSchema,
  TeamMessageListRequestSchema,
  TeamMessagePostRequestSchema,
  TeamTaskListRequestSchema,
  TeamTaskGetRequestSchema,
  TeamTaskCreateRequestSchema,
  TeamTaskUpdateRequestSchema,
  TeamTaskSetClaimRequestSchema,
  TeamTaskDeleteRequestSchema,
  TeamMemberListRequestSchema,
  TeamMemberCreateRequestSchema,
  TeamMemberUpdateRequestSchema,
  TeamMemberAssignRequestSchema,
  TeamMemberRemoveRequestSchema,
  TeamMemberStartRequestSchema,
  TeamMemberStopRequestSchema,
  TeamMemberListTemplatesRequestSchema,
  TeamMemberListHomeFilesRequestSchema,
  TeamMemberReadHomeFileRequestSchema,
  TeamProjectGetSettingsRequestSchema,
  TeamProjectUpdateSettingsRequestSchema,
  TeamProjectStopAllRequestSchema,
  TeamProjectResumeRequestSchema,
  TeamProjectAdoptLegacyChatRequestSchema,
  TeamProjectRestoreSnapshotRequestSchema,
] as const;

export const TeamResponseSchemas = [
  TeamChannelListResponseSchema,
  TeamChannelCreateResponseSchema,
  TeamChannelUpdateResponseSchema,
  TeamChannelDeleteResponseSchema,
  TeamChannelMarkReadResponseSchema,
  TeamMessageListResponseSchema,
  TeamMessagePostResponseSchema,
  TeamTaskListResponseSchema,
  TeamTaskGetResponseSchema,
  TeamTaskCreateResponseSchema,
  TeamTaskUpdateResponseSchema,
  TeamTaskSetClaimResponseSchema,
  TeamTaskDeleteResponseSchema,
  TeamMemberListResponseSchema,
  TeamMemberCreateResponseSchema,
  TeamMemberUpdateResponseSchema,
  TeamMemberAssignResponseSchema,
  TeamMemberRemoveResponseSchema,
  TeamMemberStartResponseSchema,
  TeamMemberStopResponseSchema,
  TeamMemberListTemplatesResponseSchema,
  TeamMemberListHomeFilesResponseSchema,
  TeamMemberReadHomeFileResponseSchema,
  TeamProjectGetSettingsResponseSchema,
  TeamProjectUpdateSettingsResponseSchema,
  TeamProjectStopAllResponseSchema,
  TeamProjectResumeResponseSchema,
  TeamProjectAdoptLegacyChatResponseSchema,
  TeamProjectRestoreSnapshotResponseSchema,
] as const;

export const TeamEventSchemas = [
  TeamMessagePostedSchema,
  TeamTaskChangedSchema,
  TeamMemberChangedSchema,
  TeamProjectStoppedSchema,
] as const;

export const TeamInboundMessageSchema = z.discriminatedUnion("type", TeamRequestSchemas);
export const TeamOutboundMessageSchema = z.discriminatedUnion("type", [
  ...TeamResponseSchemas,
  ...TeamEventSchemas,
]);

export const TeamFeatureFlagSchema = TeamServerFeaturesSchema.shape.team;

export type TeamChannelListRequest = z.infer<typeof TeamChannelListRequestSchema>;
export type TeamChannelCreateRequest = z.infer<typeof TeamChannelCreateRequestSchema>;
export type TeamChannelUpdateRequest = z.infer<typeof TeamChannelUpdateRequestSchema>;
export type TeamChannelDeleteRequest = z.infer<typeof TeamChannelDeleteRequestSchema>;
export type TeamChannelMarkReadRequest = z.infer<typeof TeamChannelMarkReadRequestSchema>;
export type TeamMessageListRequest = z.infer<typeof TeamMessageListRequestSchema>;
export type TeamMessagePostRequest = z.infer<typeof TeamMessagePostRequestSchema>;
export type TeamTaskListRequest = z.infer<typeof TeamTaskListRequestSchema>;
export type TeamTaskGetRequest = z.infer<typeof TeamTaskGetRequestSchema>;
export type TeamTaskCreateRequest = z.infer<typeof TeamTaskCreateRequestSchema>;
export type TeamTaskUpdateRequest = z.infer<typeof TeamTaskUpdateRequestSchema>;
export type TeamTaskSetClaimRequest = z.infer<typeof TeamTaskSetClaimRequestSchema>;
export type TeamTaskDeleteRequest = z.infer<typeof TeamTaskDeleteRequestSchema>;
export type TeamMemberListRequest = z.infer<typeof TeamMemberListRequestSchema>;
export type TeamMemberCreateRequest = z.infer<typeof TeamMemberCreateRequestSchema>;
export type TeamMemberUpdateRequest = z.infer<typeof TeamMemberUpdateRequestSchema>;
export type TeamMemberAssignRequest = z.infer<typeof TeamMemberAssignRequestSchema>;
export type TeamMemberRemoveRequest = z.infer<typeof TeamMemberRemoveRequestSchema>;
export type TeamMemberStartRequest = z.infer<typeof TeamMemberStartRequestSchema>;
export type TeamMemberStopRequest = z.infer<typeof TeamMemberStopRequestSchema>;
export type TeamMemberListTemplatesRequest = z.infer<typeof TeamMemberListTemplatesRequestSchema>;
export type TeamMemberListHomeFilesRequest = z.infer<typeof TeamMemberListHomeFilesRequestSchema>;
export type TeamMemberReadHomeFileRequest = z.infer<typeof TeamMemberReadHomeFileRequestSchema>;
export type TeamProjectGetSettingsRequest = z.infer<typeof TeamProjectGetSettingsRequestSchema>;
export type TeamProjectUpdateSettingsRequest = z.infer<
  typeof TeamProjectUpdateSettingsRequestSchema
>;
export type TeamProjectStopAllRequest = z.infer<typeof TeamProjectStopAllRequestSchema>;
export type TeamProjectResumeRequest = z.infer<typeof TeamProjectResumeRequestSchema>;
export type TeamProjectAdoptLegacyChatRequest = z.infer<
  typeof TeamProjectAdoptLegacyChatRequestSchema
>;
export type TeamProjectRestoreSnapshotRequest = z.infer<
  typeof TeamProjectRestoreSnapshotRequestSchema
>;
export type TeamChannelListResponse = z.infer<typeof TeamChannelListResponseSchema>;
export type TeamChannelCreateResponse = z.infer<typeof TeamChannelCreateResponseSchema>;
export type TeamChannelUpdateResponse = z.infer<typeof TeamChannelUpdateResponseSchema>;
export type TeamChannelDeleteResponse = z.infer<typeof TeamChannelDeleteResponseSchema>;
export type TeamChannelMarkReadResponse = z.infer<typeof TeamChannelMarkReadResponseSchema>;
export type TeamMessageListResponse = z.infer<typeof TeamMessageListResponseSchema>;
export type TeamMessagePostResponse = z.infer<typeof TeamMessagePostResponseSchema>;
export type TeamTaskListResponse = z.infer<typeof TeamTaskListResponseSchema>;
export type TeamTaskGetResponse = z.infer<typeof TeamTaskGetResponseSchema>;
export type TeamTaskCreateResponse = z.infer<typeof TeamTaskCreateResponseSchema>;
export type TeamTaskUpdateResponse = z.infer<typeof TeamTaskUpdateResponseSchema>;
export type TeamTaskSetClaimResponse = z.infer<typeof TeamTaskSetClaimResponseSchema>;
export type TeamTaskDeleteResponse = z.infer<typeof TeamTaskDeleteResponseSchema>;
export type TeamMemberListResponse = z.infer<typeof TeamMemberListResponseSchema>;
export type TeamMemberCreateResponse = z.infer<typeof TeamMemberCreateResponseSchema>;
export type TeamMemberUpdateResponse = z.infer<typeof TeamMemberUpdateResponseSchema>;
export type TeamMemberAssignResponse = z.infer<typeof TeamMemberAssignResponseSchema>;
export type TeamMemberRemoveResponse = z.infer<typeof TeamMemberRemoveResponseSchema>;
export type TeamMemberStartResponse = z.infer<typeof TeamMemberStartResponseSchema>;
export type TeamMemberStopResponse = z.infer<typeof TeamMemberStopResponseSchema>;
export type TeamMemberListTemplatesResponse = z.infer<typeof TeamMemberListTemplatesResponseSchema>;
export type TeamMemberListHomeFilesResponse = z.infer<typeof TeamMemberListHomeFilesResponseSchema>;
export type TeamMemberReadHomeFileResponse = z.infer<typeof TeamMemberReadHomeFileResponseSchema>;
export type TeamProjectGetSettingsResponse = z.infer<typeof TeamProjectGetSettingsResponseSchema>;
export type TeamProjectUpdateSettingsResponse = z.infer<
  typeof TeamProjectUpdateSettingsResponseSchema
>;
export type TeamProjectStopAllResponse = z.infer<typeof TeamProjectStopAllResponseSchema>;
export type TeamProjectResumeResponse = z.infer<typeof TeamProjectResumeResponseSchema>;
export type TeamProjectAdoptLegacyChatResponse = z.infer<
  typeof TeamProjectAdoptLegacyChatResponseSchema
>;
export type TeamProjectRestoreSnapshotResponse = z.infer<
  typeof TeamProjectRestoreSnapshotResponseSchema
>;
export type TeamMessagePosted = z.infer<typeof TeamMessagePostedSchema>;
export type TeamTaskChanged = z.infer<typeof TeamTaskChangedSchema>;
export type TeamMemberChanged = z.infer<typeof TeamMemberChangedSchema>;
export type TeamProjectStopped = z.infer<typeof TeamProjectStoppedSchema>;
