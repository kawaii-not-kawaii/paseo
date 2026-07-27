export type TeamDatabaseKind = "project" | "roster";

interface TeamDatabaseConnection {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(): unknown;
  };
}

interface Migration {
  version: number;
  up: (db: TeamDatabaseConnection, kind: TeamDatabaseKind) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (db, kind) => {
      if (kind === "project") {
        createProjectSchema(db);
        return;
      }
      createRosterSchema(db);
    },
  },
];

export const LATEST_TEAM_DATABASE_VERSION = migrations.at(-1)?.version ?? 0;

export function migrateDatabase(db: TeamDatabaseConnection, kind: TeamDatabaseKind): void {
  const currentVersion = readUserVersion(db);
  if (currentVersion > LATEST_TEAM_DATABASE_VERSION) {
    throw new Error(
      `Refusing to open newer team ${kind} database version ${currentVersion}; ` +
        `this code supports up to ${LATEST_TEAM_DATABASE_VERSION}.`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    db.exec("BEGIN");
    try {
      migration.up(db, kind);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function readUserVersion(db: TeamDatabaseConnection): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function createProjectSchema(db: TeamDatabaseConnection): void {
  db.exec(`
    CREATE TABLE project_members (
      member_id TEXT PRIMARY KEY,
      home_workspace_id TEXT,
      joined_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX project_members_home_workspace_id_unique
      ON project_members(home_workspace_id)
      WHERE home_workspace_id IS NOT NULL;

    CREATE TABLE channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      purpose TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_member_id TEXT NOT NULL,
      body TEXT NOT NULL,
      reply_to_message_id TEXT,
      created_at TEXT NOT NULL,
      auto_started INTEGER NOT NULL
    );

    CREATE INDEX messages_channel_created_id_desc
      ON messages(channel_id, created_at DESC, id DESC);

    CREATE TABLE message_mentions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      PRIMARY KEY (message_id, member_id)
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL,
      creator_member_id TEXT NOT NULL,
      assignee_member_id TEXT,
      claimant_member_id TEXT,
      claim_expires_at TEXT,
      handback_count INTEGER NOT NULL DEFAULT 0,
      attempt_started_at TEXT,
      escalated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE task_dependencies (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on_task_id)
    );

    CREATE TABLE task_notes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_member_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE task_acceptance_criteria (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      text TEXT NOT NULL,
      satisfied_at TEXT,
      PRIMARY KEY (task_id, position)
    );

    CREATE TABLE progress_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE project_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      message_retention_cap INTEGER NOT NULL,
      handback_limit INTEGER NOT NULL,
      attempt_timeout_ms INTEGER NOT NULL,
      no_progress_limit INTEGER NOT NULL,
      auto_start_enabled INTEGER NOT NULL
    );

    INSERT INTO project_settings (
      id,
      message_retention_cap,
      handback_limit,
      attempt_timeout_ms,
      no_progress_limit,
      auto_start_enabled
    ) VALUES (1, 50000, 3, 1800000, 12, 1);
  `);
}

function createRosterSchema(db: TeamDatabaseConnection): void {
  db.exec(`
    CREATE TABLE members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      provider TEXT NOT NULL,
      model TEXT,
      mode_id TEXT,
      role_prompt TEXT,
      template_id TEXT,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived_at TEXT
    );
  `);
}
