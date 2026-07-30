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

const taskRowSchema = z.object({
  id: z.string(),
  seq: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  status: z.enum(["todo", "in_progress", "in_review", "done"]),
  creator_member_id: z.string(),
  assignee_member_id: z.string().nullable(),
  claimant_member_id: z.string().nullable(),
  claim_expires_at: z.string().nullable(),
  handback_count: z.number().int().nonnegative(),
  attempt_started_at: z.string().nullable(),
  escalated_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const taskDependencyRowSchema = z.object({
  task_id: z.string(),
  depends_on_task_id: z.string(),
});

const taskNoteRowSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  author_member_id: z.string(),
  body: z.string(),
  created_at: z.string(),
});

const taskAcceptanceCriterionRowSchema = z.object({
  task_id: z.string(),
  position: z.number().int().nonnegative(),
  text: z.string(),
  satisfied_at: z.string().nullable(),
});

const progressEventRowSchema = z.object({
  id: z.number().int().positive(),
  task_id: z.string().nullable(),
  member_id: z.string(),
  kind: z.string(),
  created_at: z.string(),
});

const projectSettingsRowSchema = z.object({
  id: z.number().int(),
  message_retention_cap: z.number().int(),
  handback_limit: z.number().int(),
  attempt_timeout_ms: z.number().int(),
  no_progress_limit: z.number().int(),
  auto_start_enabled: z.union([z.literal(0), z.literal(1)]),
});

const retentionStatusRowSchema = z.object({
  last_retention_pruned_message_count: z.number().int().nonnegative(),
  last_retention_pruned_at: z.string().nullable(),
});

const channelUnreadRowSchema = z.object({
  channel_id: z.string(),
  unread_count: z.number().int().nonnegative(),
});

type MessageRow = z.infer<typeof messageRowSchema>;
type ChannelRow = z.infer<typeof channelRowSchema>;
type MessageMentionRow = z.infer<typeof messageMentionRowSchema>;
type ProjectMemberRow = z.infer<typeof projectMemberRowSchema>;
type TaskRow = z.infer<typeof taskRowSchema>;
type TaskNoteRow = z.infer<typeof taskNoteRowSchema>;
type TaskAcceptanceCriterionRow = z.infer<typeof taskAcceptanceCriterionRowSchema>;
type ProgressEventRow = z.infer<typeof progressEventRowSchema>;
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

export interface ProjectTaskAcceptanceCriterion {
  position: number;
  text: string;
  satisfiedAt: string | null;
}

export interface ProjectTaskNote {
  id: string;
  taskId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
}

export interface ProjectTask {
  id: string;
  seq: number;
  title: string;
  body: string | null;
  status: "todo" | "in_progress" | "in_review" | "done";
  creatorMemberId: string;
  assigneeMemberId: string | null;
  claimantMemberId: string | null;
  claimExpiresAt: string | null;
  handbackCount: number;
  attemptStartedAt: string | null;
  escalatedAt: string | null;
  dependsOnTaskIds: string[];
  acceptanceCriteria: ProjectTaskAcceptanceCriterion[];
  notes: ProjectTaskNote[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectProgressEvent {
  id: number;
  taskId: string | null;
  memberId: string;
  kind: string;
  createdAt: string;
}

export interface ProjectSettings {
  messageRetentionCap: number;
  handbackLimit: number;
  attemptTimeoutMs: number;
  noProgressLimit: number;
  autoStartEnabled: boolean;
}

export interface ProjectRetentionStatus {
  lastPrunedMessageCount: number;
  lastPrunedAt: string | null;
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

export interface ListProjectTasksInput {
  status?: ProjectTask["status"];
  assigneeMemberId?: string;
  creatorMemberId?: string;
  claimantMemberId?: string;
  claimableAt?: string;
}

export interface CreateProjectTaskInput {
  id: string;
  title: string;
  body: string | null;
  status: ProjectTask["status"];
  creatorMemberId: string;
  assigneeMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  dependsOnTaskIds?: string[];
  acceptanceCriteria?: ProjectTaskAcceptanceCriterion[];
}

export interface UpdateProjectTaskInput {
  taskId: string;
  title?: string;
  body?: string | null;
  status?: ProjectTask["status"];
  assigneeMemberId?: string | null;
  claimantMemberId?: string | null;
  claimExpiresAt?: string | null;
  handbackCount?: number;
  attemptStartedAt?: string | null;
  escalatedAt?: string | null;
  updatedAt: string;
}

export interface TryAcquireTaskClaimInput {
  taskId: string;
  memberId: string;
  now: string;
  claimExpiresAt: string;
  attemptStartedAt: string;
  updatedAt: string;
}

export interface RenewTaskClaimInput {
  taskId: string;
  memberId: string;
  now: string;
  claimExpiresAt: string;
  updatedAt: string;
}

export interface ReleaseTaskClaimInput {
  taskId: string;
  memberId?: string;
  updatedAt: string;
  handbackCount?: number;
  status?: ProjectTask["status"];
  attemptStartedAt?: string | null;
  escalatedAt?: string | null;
}

export interface CreateProjectTaskNoteInput {
  id: string;
  taskId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
}

export interface CreateProgressEventInput {
  taskId: string | null;
  memberId: string;
  kind: string;
  createdAt: string;
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

  function listChannelUnreadCounts(identityId: string): Map<string, number> {
    const rows = channelUnreadRowSchema.array().parse(
      db
        .prepare(
          `SELECT c.id AS channel_id, COUNT(m.rowid) AS unread_count
             FROM channels c
             LEFT JOIN channel_read_cursors r
               ON r.channel_id = c.id AND r.identity_id = ?
             LEFT JOIN messages m
               ON m.channel_id = c.id
              AND m.rowid > COALESCE(r.last_read_message_rowid, 0)
            WHERE c.archived_at IS NULL
            GROUP BY c.id`,
        )
        .all(identityId) as unknown[],
    );
    return new Map(rows.map((row) => [row.channel_id, row.unread_count]));
  }

  function markChannelRead(channelId: string, identityId: string, updatedAt: string): void {
    db.prepare(
      `INSERT INTO channel_read_cursors (
         channel_id, identity_id, last_read_message_rowid, updated_at
       )
       SELECT ?, ?, COALESCE(MAX(rowid), 0), ?
         FROM messages
        WHERE channel_id = ?
       ON CONFLICT(channel_id, identity_id) DO UPDATE SET
         last_read_message_rowid = excluded.last_read_message_rowid,
         updated_at = excluded.updated_at`,
    ).run(channelId, identityId, updatedAt, channelId);
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

  function updateProjectSettings(settings: ProjectSettings): void {
    db.prepare(
      `UPDATE project_settings
          SET message_retention_cap = ?,
              handback_limit = ?,
              attempt_timeout_ms = ?,
              no_progress_limit = ?,
              auto_start_enabled = ?
        WHERE id = 1`,
    ).run(
      settings.messageRetentionCap,
      settings.handbackLimit,
      settings.attemptTimeoutMs,
      settings.noProgressLimit,
      settings.autoStartEnabled ? 1 : 0,
    );
  }

  function pruneMessagesBeyondRetentionCap(messageRetentionCap: number): number {
    if (messageRetentionCap < 1) {
      return 0;
    }
    const rows = messageRowSchema.array().parse(
      db
        .prepare(
          `SELECT id, channel_id, author_member_id, body, reply_to_message_id, created_at, auto_started
             FROM messages
            ORDER BY created_at DESC, id DESC
            LIMIT -1 OFFSET ?`,
        )
        .all(messageRetentionCap) as unknown[],
    );
    if (rows.length === 0) {
      return 0;
    }
    const deleteMessage = db.prepare("DELETE FROM messages WHERE id = ?");
    for (const row of rows.toReversed()) {
      deleteMessage.run(row.id);
    }
    return rows.length;
  }

  function recordRetentionPrune(lastPrunedMessageCount: number, lastPrunedAt: string): void {
    db.prepare(
      `UPDATE project_settings
          SET last_retention_pruned_message_count = ?,
              last_retention_pruned_at = ?
        WHERE id = 1`,
    ).run(lastPrunedMessageCount, lastPrunedAt);
  }

  function getRetentionStatus(): ProjectRetentionStatus {
    const row = retentionStatusRowSchema.parse(
      db
        .prepare(
          `SELECT last_retention_pruned_message_count, last_retention_pruned_at
             FROM project_settings
            WHERE id = 1`,
        )
        .get() as unknown,
    );
    return {
      lastPrunedMessageCount: row.last_retention_pruned_message_count,
      lastPrunedAt: row.last_retention_pruned_at,
    };
  }

  function listTasks(input: ListProjectTasksInput = {}): ProjectTask[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }
    if (input.assigneeMemberId) {
      clauses.push("assignee_member_id = ?");
      params.push(input.assigneeMemberId);
    }
    if (input.creatorMemberId) {
      clauses.push("creator_member_id = ?");
      params.push(input.creatorMemberId);
    }
    if (input.claimantMemberId) {
      clauses.push("claimant_member_id = ? AND claim_expires_at > ?");
      params.push(input.claimantMemberId, input.claimableAt ?? "");
    }
    if (input.claimableAt) {
      clauses.push("(claimant_member_id IS NULL OR claim_expires_at <= ?)");
      params.push(input.claimableAt);
      clauses.push(
        `NOT EXISTS (
          SELECT 1
            FROM task_dependencies d
            JOIN tasks dep ON dep.id = d.depends_on_task_id
           WHERE d.task_id = tasks.id
             AND dep.status <> 'done'
        )`,
      );
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = taskRowSchema.array().parse(
      db
        .prepare(
          `SELECT id, seq, title, body, status, creator_member_id, assignee_member_id,
                  claimant_member_id, claim_expires_at, handback_count, attempt_started_at,
                  escalated_at, created_at, updated_at
             FROM tasks
             ${whereClause}
            ORDER BY seq ASC`,
        )
        .all(...params) as unknown[],
    );
    return rows.map((row) =>
      mapTaskRow(
        row,
        listTaskDependencies(row.id),
        listTaskCriteria(row.id),
        listTaskNotes(row.id),
      ),
    );
  }

  function getTask(taskId: string): ProjectTask | null {
    const row = db
      .prepare(
        `SELECT id, seq, title, body, status, creator_member_id, assignee_member_id,
                claimant_member_id, claim_expires_at, handback_count, attempt_started_at,
                escalated_at, created_at, updated_at
           FROM tasks
          WHERE id = ?`,
      )
      .get(taskId) as unknown;
    if (!row) {
      return null;
    }
    const parsed = taskRowSchema.parse(row);
    return mapTaskRow(
      parsed,
      listTaskDependencies(taskId),
      listTaskCriteria(taskId),
      listTaskNotes(taskId),
    );
  }

  function createTask(input: CreateProjectTaskInput): ProjectTask {
    return withTransaction(() => {
      const nextSeqRow = db
        .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM tasks")
        .get() as { next_seq: number };
      const seq = z.number().int().positive().parse(nextSeqRow.next_seq);
      db.prepare(
        `INSERT INTO tasks (
          id, seq, title, body, status, creator_member_id, assignee_member_id,
          claimant_member_id, claim_expires_at, handback_count, attempt_started_at,
          escalated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, ?)`,
      ).run(
        input.id,
        seq,
        input.title,
        input.body,
        input.status,
        input.creatorMemberId,
        input.assigneeMemberId,
        input.createdAt,
        input.updatedAt,
      );
      replaceTaskDependencies(input.id, input.dependsOnTaskIds ?? []);
      replaceTaskAcceptanceCriteria(input.id, input.acceptanceCriteria ?? []);
      const created = getTask(input.id);
      if (!created) {
        throw new Error(`Created task ${input.id} was not persisted`);
      }
      return created;
    });
  }

  function updateTask(input: UpdateProjectTaskInput): ProjectTask | null {
    const existing = getTask(input.taskId);
    if (!existing) {
      return null;
    }
    db.prepare(
      `UPDATE tasks
          SET title = ?,
              body = ?,
              status = ?,
              assignee_member_id = ?,
              claimant_member_id = ?,
              claim_expires_at = ?,
              handback_count = ?,
              attempt_started_at = ?,
              escalated_at = ?,
              updated_at = ?
        WHERE id = ?`,
    ).run(
      input.title ?? existing.title,
      input.body === undefined ? existing.body : input.body,
      input.status ?? existing.status,
      input.assigneeMemberId === undefined ? existing.assigneeMemberId : input.assigneeMemberId,
      input.claimantMemberId === undefined ? existing.claimantMemberId : input.claimantMemberId,
      input.claimExpiresAt === undefined ? existing.claimExpiresAt : input.claimExpiresAt,
      input.handbackCount ?? existing.handbackCount,
      input.attemptStartedAt === undefined ? existing.attemptStartedAt : input.attemptStartedAt,
      input.escalatedAt === undefined ? existing.escalatedAt : input.escalatedAt,
      input.updatedAt,
      input.taskId,
    );
    return getTask(input.taskId);
  }

  function deleteTask(taskId: string): string | null {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    return getTask(taskId) ? null : taskId;
  }

  function replaceTaskDependencies(taskId: string, dependsOnTaskIds: string[]): void {
    db.prepare("DELETE FROM task_dependencies WHERE task_id = ?").run(taskId);
    const insert = db.prepare(
      "INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)",
    );
    for (const dependsOnTaskId of dependsOnTaskIds) {
      insert.run(taskId, dependsOnTaskId);
    }
  }

  function replaceTaskAcceptanceCriteria(
    taskId: string,
    criteria: ProjectTaskAcceptanceCriterion[],
  ): void {
    db.prepare("DELETE FROM task_acceptance_criteria WHERE task_id = ?").run(taskId);
    const insert = db.prepare(
      `INSERT INTO task_acceptance_criteria (task_id, position, text, satisfied_at)
       VALUES (?, ?, ?, ?)`,
    );
    for (const criterion of criteria) {
      insert.run(taskId, criterion.position, criterion.text, criterion.satisfiedAt);
    }
  }

  function createTaskNote(input: CreateProjectTaskNoteInput): ProjectTaskNote {
    db.prepare(
      `INSERT INTO task_notes (id, task_id, author_member_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.id, input.taskId, input.authorMemberId, input.body, input.createdAt);
    const row = db
      .prepare(
        `SELECT id, task_id, author_member_id, body, created_at
           FROM task_notes
          WHERE id = ?`,
      )
      .get(input.id) as unknown;
    return mapTaskNoteRow(taskNoteRowSchema.parse(row));
  }

  function listTaskNotes(taskId: string): ProjectTaskNote[] {
    const rows = taskNoteRowSchema.array().parse(
      db
        .prepare(
          `SELECT id, task_id, author_member_id, body, created_at
             FROM task_notes
            WHERE task_id = ?
            ORDER BY created_at ASC, id ASC`,
        )
        .all(taskId) as unknown[],
    );
    return rows.map(mapTaskNoteRow);
  }

  function listTaskDependencies(taskId: string): string[] {
    const rows = taskDependencyRowSchema.array().parse(
      db
        .prepare(
          `SELECT task_id, depends_on_task_id
             FROM task_dependencies
            WHERE task_id = ?
            ORDER BY depends_on_task_id ASC`,
        )
        .all(taskId) as unknown[],
    );
    return rows.map((row) => row.depends_on_task_id);
  }

  function listTaskCriteria(taskId: string): ProjectTaskAcceptanceCriterion[] {
    const rows = taskAcceptanceCriterionRowSchema.array().parse(
      db
        .prepare(
          `SELECT task_id, position, text, satisfied_at
             FROM task_acceptance_criteria
            WHERE task_id = ?
            ORDER BY position ASC`,
        )
        .all(taskId) as unknown[],
    );
    return rows.map(mapTaskAcceptanceCriterionRow);
  }

  function satisfyTaskCriterion(taskId: string, position: number, satisfiedAt: string): void {
    db.prepare(
      `UPDATE task_acceptance_criteria
          SET satisfied_at = ?
        WHERE task_id = ? AND position = ?`,
    ).run(satisfiedAt, taskId, position);
  }

  function listUnmetTaskDependencies(taskId: string): ProjectTask[] {
    const rows = taskRowSchema.array().parse(
      db
        .prepare(
          `SELECT t.id, t.seq, t.title, t.body, t.status, t.creator_member_id, t.assignee_member_id,
                  t.claimant_member_id, t.claim_expires_at, t.handback_count, t.attempt_started_at,
                  t.escalated_at, t.created_at, t.updated_at
             FROM task_dependencies d
             JOIN tasks t ON t.id = d.depends_on_task_id
            WHERE d.task_id = ? AND t.status <> 'done'
            ORDER BY t.seq ASC`,
        )
        .all(taskId) as unknown[],
    );
    return rows.map((row) =>
      mapTaskRow(
        row,
        listTaskDependencies(row.id),
        listTaskCriteria(row.id),
        listTaskNotes(row.id),
      ),
    );
  }

  function tryAcquireTaskClaim(input: TryAcquireTaskClaimInput): boolean {
    const result = db
      .prepare(
        `UPDATE tasks
          SET claimant_member_id = ?,
              claim_expires_at = ?,
              attempt_started_at = ?,
              updated_at = ?,
              escalated_at = NULL
        WHERE id = ?
          AND (claimant_member_id IS NULL OR claim_expires_at <= ?)
          AND NOT EXISTS (
                SELECT 1 FROM task_dependencies d
                JOIN tasks dep ON dep.id = d.depends_on_task_id
               WHERE d.task_id = ?
                 AND dep.status <> 'done'
          )`,
      )
      .run(
        input.memberId,
        input.claimExpiresAt,
        input.attemptStartedAt,
        input.updatedAt,
        input.taskId,
        input.now,
        input.taskId,
      ) as { changes?: number };
    return (result.changes ?? 0) === 1;
  }

  function renewTaskClaim(input: RenewTaskClaimInput): boolean {
    const result = db
      .prepare(
        `UPDATE tasks
          SET claim_expires_at = ?,
              updated_at = ?
        WHERE id = ?
          AND claimant_member_id = ?
          AND claim_expires_at > ?`,
      )
      .run(input.claimExpiresAt, input.updatedAt, input.taskId, input.memberId, input.now) as {
      changes?: number;
    };
    return (result.changes ?? 0) === 1;
  }

  function releaseTaskClaim(input: ReleaseTaskClaimInput): boolean {
    const params: unknown[] = [
      input.status ?? null,
      input.handbackCount ?? null,
      input.attemptStartedAt ?? null,
      input.escalatedAt ?? null,
      input.updatedAt,
      input.taskId,
    ];
    const memberClause = input.memberId ? " AND claimant_member_id = ?" : "";
    if (input.memberId) {
      params.push(input.memberId);
    }
    const result = db
      .prepare(
        `UPDATE tasks
          SET claimant_member_id = NULL,
              claim_expires_at = NULL,
              status = COALESCE(?, status),
              handback_count = COALESCE(?, handback_count),
              attempt_started_at = COALESCE(?, attempt_started_at),
              escalated_at = COALESCE(?, escalated_at),
              updated_at = ?
        WHERE id = ?${memberClause}`,
      )
      .run(...params) as { changes?: number };
    return (result.changes ?? 0) === 1;
  }

  function releaseClaimsForMember(memberId: string, updatedAt: string): string[] {
    const taskIds = taskRowSchema
      .array()
      .parse(
        db
          .prepare(
            `SELECT id, seq, title, body, status, creator_member_id, assignee_member_id,
                    claimant_member_id, claim_expires_at, handback_count, attempt_started_at,
                    escalated_at, created_at, updated_at
               FROM tasks
              WHERE claimant_member_id = ?`,
          )
          .all(memberId) as unknown[],
      )
      .map((row) => row.id);
    if (taskIds.length === 0) {
      return [];
    }
    db.prepare(
      `UPDATE tasks
          SET claimant_member_id = NULL,
              claim_expires_at = NULL,
              updated_at = ?
        WHERE claimant_member_id = ?`,
    ).run(updatedAt, memberId);
    return taskIds;
  }

  function expireClaims(now: string, updatedAt: string): string[] {
    const expiredTaskIds = taskRowSchema
      .array()
      .parse(
        db
          .prepare(
            `SELECT id, seq, title, body, status, creator_member_id, assignee_member_id,
                    claimant_member_id, claim_expires_at, handback_count, attempt_started_at,
                    escalated_at, created_at, updated_at
               FROM tasks
              WHERE claimant_member_id IS NOT NULL
                AND claim_expires_at <= ?`,
          )
          .all(now) as unknown[],
      )
      .map((row) => row.id);
    if (expiredTaskIds.length === 0) {
      return [];
    }
    db.prepare(
      `UPDATE tasks
          SET claimant_member_id = NULL,
              claim_expires_at = NULL,
              updated_at = ?
        WHERE claimant_member_id IS NOT NULL
          AND claim_expires_at <= ?`,
    ).run(updatedAt, now);
    return expiredTaskIds;
  }

  function addProgressEvent(input: CreateProgressEventInput): ProjectProgressEvent {
    db.prepare(
      `INSERT INTO progress_events (task_id, member_id, kind, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(input.taskId, input.memberId, input.kind, input.createdAt);
    const row = db
      .prepare(
        `SELECT id, task_id, member_id, kind, created_at
           FROM progress_events
          WHERE rowid = last_insert_rowid()`,
      )
      .get() as unknown;
    return mapProgressEventRow(progressEventRowSchema.parse(row));
  }

  function listProgressEvents(taskId?: string): ProjectProgressEvent[] {
    const rows = progressEventRowSchema.array().parse(
      taskId === undefined
        ? (db
            .prepare(
              `SELECT id, task_id, member_id, kind, created_at
                 FROM progress_events
                ORDER BY id ASC`,
            )
            .all() as unknown[])
        : (db
            .prepare(
              `SELECT id, task_id, member_id, kind, created_at
                 FROM progress_events
                WHERE task_id = ?
                ORDER BY id ASC`,
            )
            .all(taskId) as unknown[]),
    );
    return rows.map(mapProgressEventRow);
  }

  return {
    listChannels,
    getChannel,
    getChannelByName,
    createChannel,
    updateChannel,
    deleteChannel,
    listChannelUnreadCounts,
    markChannelRead,
    listMessages,
    createMessage,
    getMessage,
    addMessageMention,
    listMessageMentionMemberIds,
    listProjectMembers,
    addProjectMember,
    upsertProjectMember,
    removeProjectMember,
    getProjectMember,
    getProjectMemberByHomeWorkspaceId,
    getProjectSettings,
    updateProjectSettings,
    pruneMessagesBeyondRetentionCap,
    recordRetentionPrune,
    getRetentionStatus,
    listTasks,
    getTask,
    createTask,
    updateTask,
    deleteTask,
    replaceTaskDependencies,
    replaceTaskAcceptanceCriteria,
    createTaskNote,
    listTaskNotes,
    listTaskDependencies,
    listTaskCriteria,
    satisfyTaskCriterion,
    listUnmetTaskDependencies,
    tryAcquireTaskClaim,
    renewTaskClaim,
    releaseTaskClaim,
    releaseClaimsForMember,
    expireClaims,
    addProgressEvent,
    listProgressEvents,
  };
}

function withTransaction<T>(work: () => T): T {
  return work();
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

function mapTaskAcceptanceCriterionRow(
  row: TaskAcceptanceCriterionRow,
): ProjectTaskAcceptanceCriterion {
  return {
    position: row.position,
    text: row.text,
    satisfiedAt: row.satisfied_at,
  };
}

function mapTaskNoteRow(row: TaskNoteRow): ProjectTaskNote {
  return {
    id: row.id,
    taskId: row.task_id,
    authorMemberId: row.author_member_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapTaskRow(
  row: TaskRow,
  dependsOnTaskIds: string[],
  acceptanceCriteria: ProjectTaskAcceptanceCriterion[],
  notes: ProjectTaskNote[],
): ProjectTask {
  return {
    id: row.id,
    seq: row.seq,
    title: row.title,
    body: row.body,
    status: row.status,
    creatorMemberId: row.creator_member_id,
    assigneeMemberId: row.assignee_member_id,
    claimantMemberId: row.claimant_member_id,
    claimExpiresAt: row.claim_expires_at,
    handbackCount: row.handback_count,
    attemptStartedAt: row.attempt_started_at,
    escalatedAt: row.escalated_at,
    dependsOnTaskIds,
    acceptanceCriteria,
    notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProgressEventRow(row: ProgressEventRow): ProjectProgressEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    memberId: row.member_id,
    kind: row.kind,
    createdAt: row.created_at,
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
