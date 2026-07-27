import { z } from "zod";
import { SortablePager } from "../../pagination/sortable-pager.js";
import type { TeamDatabaseHandle } from "./database.js";

const messageRowSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  author_member_id: z.string(),
  body: z.string(),
  reply_to_message_id: z.string().nullable(),
  created_at: z.string(),
  auto_started: z.union([z.literal(0), z.literal(1)]),
});

const projectMemberRowSchema = z.object({
  member_id: z.string(),
  home_workspace_id: z.string().nullable(),
  joined_at: z.string(),
});

const projectSettingsRowSchema = z.object({
  id: z.number().int(),
  message_retention_cap: z.number().int(),
  handback_limit: z.number().int(),
  attempt_timeout_ms: z.number().int(),
  no_progress_limit: z.number().int(),
  auto_start_enabled: z.union([z.literal(0), z.literal(1)]),
});

type MessageRow = z.infer<typeof messageRowSchema>;
type ProjectMemberRow = z.infer<typeof projectMemberRowSchema>;
type ProjectSettingsRow = z.infer<typeof projectSettingsRowSchema>;

type MessageSortKey = "created_at" | "id";

const messagePager = new SortablePager<MessageRow, MessageSortKey>({
  validKeys: ["created_at", "id"],
  defaultSort: [
    { key: "created_at", direction: "desc" },
    { key: "id", direction: "desc" },
  ],
  label: "team_messages",
  getId: (message) => message.id,
  getSortValue: (message, key) => message[key],
});

export interface ProjectMessage {
  id: string;
  channelId: string;
  authorMemberId: string;
  body: string;
  replyToMessageId: string | null;
  createdAt: string;
  autoStarted: boolean;
}

export interface ProjectMemberAssignment {
  memberId: string;
  homeWorkspaceId: string | null;
  joinedAt: string;
}

export interface ProjectSettings {
  messageRetentionCap: number;
  handbackLimit: number;
  attemptTimeoutMs: number;
  noProgressLimit: number;
  autoStartEnabled: boolean;
}

export interface ListProjectMessagesInput {
  channelId: string;
  cursor?: string | null;
  limit: number;
}

export interface ProjectMessagePage {
  messages: ProjectMessage[];
  nextCursor: string | null;
}

const defaultMessageSort = messagePager.normalizeSort(undefined);

export function createProjectStore(db: TeamDatabaseHandle) {
  function listMessages(input: ListProjectMessagesInput): ProjectMessagePage {
    const limit = Math.max(1, Math.floor(input.limit));
    const cursor = input.cursor ? messagePager.decode(input.cursor, defaultMessageSort) : null;
    const rows = messageRowSchema.array().parse(
      cursor
        ? (db
            .prepare(
              `SELECT id, channel_id, author_member_id, body, reply_to_message_id, created_at, auto_started
                 FROM messages
                WHERE channel_id = ?
                  AND (
                    created_at < ?
                    OR (created_at = ? AND id < ?)
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT ?`,
            )
            .all(
              input.channelId,
              cursor.values.created_at,
              cursor.values.created_at,
              cursor.id,
              limit,
            ) as unknown[])
        : (db
            .prepare(
              `SELECT id, channel_id, author_member_id, body, reply_to_message_id, created_at, auto_started
                 FROM messages
                WHERE channel_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?`,
            )
            .all(input.channelId, limit) as unknown[]),
    );

    return {
      messages: rows.map(mapMessageRow),
      nextCursor:
        rows.length === limit
          ? messagePager.encode(rows[rows.length - 1]!, defaultMessageSort)
          : null,
    };
  }

  function listProjectMembers(): ProjectMemberAssignment[] {
    const rows = projectMemberRowSchema.array().parse(
      db
        .prepare(
          `SELECT member_id, home_workspace_id, joined_at
           FROM project_members
          ORDER BY joined_at ASC, member_id ASC`,
        )
        .all() as unknown[],
    );
    return rows.map(mapProjectMemberRow);
  }

  function getProjectSettings(): ProjectSettings {
    const row = projectSettingsRowSchema.parse(
      db
        .prepare(
          `SELECT id, message_retention_cap, handback_limit, attempt_timeout_ms, no_progress_limit, auto_start_enabled
           FROM project_settings
          WHERE id = 1`,
        )
        .get() as unknown,
    );
    return mapProjectSettingsRow(row);
  }

  function addProjectMember(input: ProjectMemberAssignment): void {
    db.prepare(
      "INSERT INTO project_members (member_id, home_workspace_id, joined_at) VALUES (?, ?, ?)",
    ).run(input.memberId, input.homeWorkspaceId, input.joinedAt);
  }

  function removeProjectMember(memberId: string): void {
    db.prepare("DELETE FROM project_members WHERE member_id = ?").run(memberId);
  }

  return {
    getProjectSettings,
    listMessages,
    listProjectMembers,
    addProjectMember,
    removeProjectMember,
  };
}

function mapMessageRow(row: MessageRow): ProjectMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorMemberId: row.author_member_id,
    body: row.body,
    replyToMessageId: row.reply_to_message_id,
    createdAt: row.created_at,
    autoStarted: row.auto_started === 1,
  };
}

function mapProjectMemberRow(row: ProjectMemberRow): ProjectMemberAssignment {
  return {
    memberId: row.member_id,
    homeWorkspaceId: row.home_workspace_id,
    joinedAt: row.joined_at,
  };
}

function mapProjectSettingsRow(row: ProjectSettingsRow): ProjectSettings {
  return {
    messageRetentionCap: row.message_retention_cap,
    handbackLimit: row.handback_limit,
    attemptTimeoutMs: row.attempt_timeout_ms,
    noProgressLimit: row.no_progress_limit,
    autoStartEnabled: row.auto_start_enabled === 1,
  };
}
