import { z } from "zod";
import type { TeamDatabaseHandle } from "./database.js";

const memberRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  provider: z.string(),
  model: z.string().nullable(),
  mode_id: z.string().nullable(),
  role_prompt: z.string().nullable(),
  template_id: z.string().nullable(),
  kind: z.string(),
  created_at: z.string(),
  archived_at: z.string().nullable(),
});

type MemberRow = z.infer<typeof memberRowSchema>;

export interface RosterMember {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string | null;
  modeId: string | null;
  rolePrompt: string | null;
  templateId: string | null;
  kind: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface CreateRosterMemberInput {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string | null;
  modeId: string | null;
  rolePrompt: string | null;
  templateId: string | null;
  kind: string;
  createdAt: string;
  archivedAt: string | null;
}

export function createRosterStore(db: TeamDatabaseHandle) {
  function createMember(input: CreateRosterMemberInput): void {
    db.prepare(
      `INSERT INTO members (
        id,
        name,
        description,
        provider,
        model,
        mode_id,
        role_prompt,
        template_id,
        kind,
        created_at,
        archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.name,
      input.description,
      input.provider,
      input.model,
      input.modeId,
      input.rolePrompt,
      input.templateId,
      input.kind,
      input.createdAt,
      input.archivedAt,
    );
  }

  function getMember(id: string): RosterMember | null {
    const row = db
      .prepare(
        `SELECT id, name, description, provider, model, mode_id, role_prompt, template_id, kind, created_at, archived_at
         FROM members
        WHERE id = ?`,
      )
      .get(id) as unknown;
    return row ? mapMemberRow(memberRowSchema.parse(row)) : null;
  }

  function listMembers(): RosterMember[] {
    const rows = memberRowSchema.array().parse(
      db
        .prepare(
          `SELECT id, name, description, provider, model, mode_id, role_prompt, template_id, kind, created_at, archived_at
           FROM members
          ORDER BY created_at ASC, id ASC`,
        )
        .all() as unknown[],
    );
    return rows.map(mapMemberRow);
  }

  function archiveMember(id: string, archivedAt: string): void {
    db.prepare("UPDATE members SET archived_at = ? WHERE id = ? AND archived_at IS NULL").run(
      archivedAt,
      id,
    );
  }

  return {
    createMember,
    getMember,
    listMembers,
    archiveMember,
  };
}

function mapMemberRow(row: MemberRow): RosterMember {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    modeId: row.mode_id,
    rolePrompt: row.role_prompt,
    templateId: row.template_id,
    kind: row.kind,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}
