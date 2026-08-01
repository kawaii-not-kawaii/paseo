import { z } from "zod";
import { AgentProviderSchema } from "../provider-manifest.js";

export const TEAM_MEMBER_KINDS = ["agent", "human"] as const;
export const TEAM_MEMBER_STATUSES = ["idle", "running", "stopped", "unavailable"] as const;
export const TEAM_TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const TEAM_HOME_FILE_KINDS = ["file", "directory"] as const;

export const TeamMemberKindSchema = z.enum(TEAM_MEMBER_KINDS);
export const TeamMemberStatusSchema = z.enum(TEAM_MEMBER_STATUSES);
export const TeamTaskStatusSchema = z.enum(TEAM_TASK_STATUSES);
export const TeamHomeFileKindSchema = z.enum(TEAM_HOME_FILE_KINDS);

export const TeamTaskAcceptanceCriterionSchema = z.object({
  position: z.number().int().nonnegative(),
  text: z.string(),
  satisfiedAt: z.string().nullable(),
});

export type TeamTaskAcceptanceCriterion = z.infer<typeof TeamTaskAcceptanceCriterionSchema>;

export const TeamTaskNoteSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  authorMemberId: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

export type TeamTaskNote = z.infer<typeof TeamTaskNoteSchema>;

export const TeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  provider: AgentProviderSchema,
  model: z.string().nullable(),
  modeId: z.string().nullable().optional(),
  rolePrompt: z.string().optional(),
  templateId: z.string().nullable().optional(),
  kind: TeamMemberKindSchema,
  status: TeamMemberStatusSchema.optional(),
  homeWorkspaceId: z.string().nullable().optional(),
  currentAgentId: z.string().nullable().optional(),
  channelIds: z.array(z.string()).optional(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string().nullable(),
  memberIds: z.array(z.string()).optional(),
  unreadCount: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type TeamChannel = z.infer<typeof TeamChannelSchema>;

export const TeamMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  authorMemberId: z.string(),
  body: z.string(),
  replyToMessageId: z.string().nullable(),
  mentionMemberIds: z.array(z.string()).optional(),
  createdAt: z.string(),
  autoStarted: z.boolean().optional(),
});

export type TeamMessage = z.infer<typeof TeamMessageSchema>;

export const TeamTaskSchema = z.object({
  id: z.string(),
  seq: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  status: TeamTaskStatusSchema,
  creatorMemberId: z.string(),
  assigneeMemberId: z.string().nullable(),
  claimantMemberId: z.string().nullable(),
  claimExpiresAt: z.string().nullable(),
  handbackCount: z.number().int().nonnegative(),
  attemptStartedAt: z.string().nullable(),
  escalatedAt: z.string().nullable(),
  dependsOnTaskIds: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(TeamTaskAcceptanceCriterionSchema).optional(),
  notes: z.array(TeamTaskNoteSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TeamTask = z.infer<typeof TeamTaskSchema>;

export const TeamProjectSettingsSchema = z.object({
  messageRetentionCap: z.number().int().positive(),
  handbackLimit: z.number().int().nonnegative(),
  attemptTimeoutMs: z.number().int().positive(),
  noProgressLimit: z.number().int().nonnegative(),
  autoStartEnabled: z.boolean(),
});

export type TeamProjectSettings = z.infer<typeof TeamProjectSettingsSchema>;

export const TeamProjectRetentionStatusSchema = z.object({
  lastPrunedMessageCount: z.number().int().nonnegative(),
  lastPrunedAt: z.string().nullable(),
});

export type TeamProjectRetentionStatus = z.infer<typeof TeamProjectRetentionStatusSchema>;

export const TeamProjectRecoverySchema = z.object({
  error: z.string().nullable(),
  latestSnapshotAt: z.string().nullable(),
  canRestore: z.boolean(),
  isCorrupt: z.boolean(),
});

export type TeamProjectRecovery = z.infer<typeof TeamProjectRecoverySchema>;

export const TeamProjectMaintenanceSchema = z.object({
  retention: TeamProjectRetentionStatusSchema.optional(),
  recovery: TeamProjectRecoverySchema.optional(),
});

export type TeamProjectMaintenance = z.infer<typeof TeamProjectMaintenanceSchema>;

export const TeamRoleTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rolePrompt: z.string(),
});

export type TeamRoleTemplate = z.infer<typeof TeamRoleTemplateSchema>;

export const TeamHomeFileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: TeamHomeFileKindSchema,
});

export type TeamHomeFileEntry = z.infer<typeof TeamHomeFileEntrySchema>;
