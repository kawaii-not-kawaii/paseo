import { z } from "zod";
import { SortablePager } from "../../pagination/sortable-pager.js";
import type { TeamDatabaseHandle } from "./database.js";

const channelRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

const messageRowSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  author_member_id: z.string(),
  body: z.string(),
  reply_to_message_id: z.string().nullable(),
  created_at: z.string(),
  auto_started: z.union([z.literal(0), z.literal(1)]),
});

const messageMentionRowSchema = z.object({
  message_id: z.string(),
  member_id: z.string(),
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
type ChannelRow = z.infer<typeof channelRowSchema>;
type MessageMentionRow = z.infer<typeof messageMentionRowSchema>;
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

export interface ProjectChannel {
  id: string;
  name: string;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
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

export interface CreateProjectChannelInput {
  id: string;
  name: string;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface UpdateProjectChannelInput {
  channelId: string;
  name?: string;
  purpose?: string | null;
  updatedAt: string;
}

export interface CreateProjectMessageInput {
  id: string;
  channelId: string;
  authorMemberId: string;
  body: string;
  replyToMessageId: string | null;
  createdAt: string;
  autoStarted: boolean;
}

const defaultMessageSort = messagePager.normalizeSort(undefined);

export function createProjectStore(db: TeamDatabaseHandle) {
  function listChannels(): ProjectChannel[] {
    const rows = channelRowSchema.array().parse(
      db
        .prepare(
          `SELECT id, name, purpose, created_at, updated_at, archived_at
           FROM channels
           WHERE archived_at IS NULL
           ORDER BY created_at ASC, id ASC`,
        )
        .all() as unknown[],
    );
    return rows.map(mapChannelRow);
  }

  function getChannel(channelId: string): ProjectChannel | null {
    const row = db
      .prepare(
        `SELECT id, name, purpose, created_at, updated_at, archived_at
         FROM channels
         WHERE id = ?`,
      )
      .get(channelId) as unknown;
    return row ? mapChannelRow(channelRowSchema.parse(row)) : null;
  }

  function getChannelByName(name: string): ProjectChannel | null {
    const row = db
      .prepare(
        `SELECT id, name, purpose, created_at, updated_at, archived_at
         FROM channels
         WHERE name = ?`,
      )
      .get(name) as unknown;
    return row ? mapChannelRow(channelRowSchema.parse(row)) : null;
  }

  function createChannel(input: CreateProjectChannelInput): void {
    db.prepare(
      `INSERT INTO channels (id, name, purpose, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(input.id, input.name, input.purpose, input.createdAt, input.updatedAt, input.archivedAt);
  }

  function updateChannel(input: UpdateProjectChannelInput): void {
    const existing = getChannel(input.channelId);
    if (!existing) {
      return;
    }
    db.prepare("UPDATE channels SET name = ?, purpose = ?, updated_at = ? WHERE id = ?").run(
      input.name ?? existing.name,
      input.purpose === undefined ? existing.purpose : input.purpose,
      input.updatedAt,
      input.channelId,
    );
  }

  function deleteChannel(channelId: string): void {
    db.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
  }

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

  function upsertProjectMember(input: ProjectMemberAssignment): void {
    const existing = getProjectMember(input.memberId);
    if (!existing) {
      addProjectMember(input);
      return;
    }
    db.prepare(
      `UPDATE project_members
          SET home_workspace_id = ?,
              joined_at = ?
        WHERE member_id = ?`,
    ).run(input.homeWorkspaceId, existing.joinedAt, input.memberId);
  }

  function removeProjectMember(memberId: string): void {
    db.prepare("DELETE FROM project_members WHERE member_id = ?").run(memberId);
  }

  function getProjectMember(memberId: string): ProjectMemberAssignment | null {
    const row = db
      .prepare(
        `SELECT member_id, home_workspace_id, joined_at
         FROM project_members
         WHERE member_id = ?`,
      )
      .get(memberId) as unknown;
    return row ? mapProjectMemberRow(projectMemberRowSchema.parse(row)) : null;
  }

  function getProjectMemberByHomeWorkspaceId(
    homeWorkspaceId: string,
  ): ProjectMemberAssignment | null {
    const row = db
      .prepare(
        `SELECT member_id, home_workspace_id, joined_at
         FROM project_members
         WHERE home_workspace_id = ?`,
      )
      .get(homeWorkspaceId) as unknown;
    return row ? mapProjectMemberRow(projectMemberRowSchema.parse(row)) : null;
  }

  function createMessage(input: CreateProjectMessageInput): void {
    db.prepare(
      `INSERT INTO messages (
        id,
        channel_id,
        author_member_id,
        body,
        reply_to_message_id,
        created_at,
        auto_started
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.channelId,
      input.authorMemberId,
      input.body,
      input.replyToMessageId,
      input.createdAt,
      input.autoStarted ? 1 : 0,
    );
  }

  function getMessage(messageId: string): ProjectMessage | null {
    const row = db
      .prepare(
        `SELECT id, channel_id, author_member_id, body, reply_to_message_id, created_at, auto_started
         FROM messages
         WHERE id = ?`,
      )
      .get(messageId) as unknown;
    return row ? mapMessageRow(messageRowSchema.parse(row)) : null;
  }

  function addMessageMention(messageId: string, memberId: string): void {
    db.prepare("INSERT INTO message_mentions (message_id, member_id) VALUES (?, ?)").run(
      messageId,
      memberId,
    );
  }

  function listMessageMentionMemberIds(messageId: string): string[] {
    const rows = messageMentionRowSchema.array().parse(
      db
        .prepare(
          `SELECT message_id, member_id
           FROM message_mentions
           WHERE message_id = ?
           ORDER BY member_id ASC`,
        )
        .all(messageId) as unknown[],
    );
    return rows.map((row) => mapMessageMentionRow(row).memberId);
  }

  return {
    listChannels,
    getChannel,
    getChannelByName,
    createChannel,
    updateChannel,
    deleteChannel,
    getProjectSettings,
    listMessages,
    listProjectMembers,
    addProjectMember,
    upsertProjectMember,
    removeProjectMember,
    getProjectMember,
    getProjectMemberByHomeWorkspaceId,
    createMessage,
    getMessage,
    addMessageMention,
    listMessageMentionMemberIds,
  };
}

function mapChannelRow(row: ChannelRow): ProjectChannel {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
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

function mapMessageMentionRow(row: MessageMentionRow): { messageId: string; memberId: string } {
  return {
    messageId: row.message_id,
    memberId: row.member_id,
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
