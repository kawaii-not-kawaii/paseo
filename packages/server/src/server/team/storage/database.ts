import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { migrateDatabase } from "./migrations.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => TeamDatabaseHandle;
};

export const TEAM_DATABASE_BUSY_TIMEOUT_MS = 5_000;

export interface TeamDatabaseHandle {
  close(): void;
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

interface TeamDatabaseManagerOptions {
  teamDir: string;
}

export function createTeamDatabaseManager(options: TeamDatabaseManagerOptions) {
  mkdirSync(options.teamDir, { recursive: true });

  const projectHandles = new Map<string, TeamDatabaseHandle>();
  let rosterHandle: TeamDatabaseHandle | null = null;

  function openProject(projectId: string): TeamDatabaseHandle {
    const cached = projectHandles.get(projectId);
    if (cached) {
      return cached;
    }

    const db = openDatabase(join(options.teamDir, `${projectId}.db`), "project");
    projectHandles.set(projectId, db);
    return db;
  }

  function openRoster(): TeamDatabaseHandle {
    if (rosterHandle) {
      return rosterHandle;
    }

    rosterHandle = openDatabase(join(options.teamDir, "roster.db"), "roster");
    return rosterHandle;
  }

  function closeAll(): void {
    for (const db of projectHandles.values()) {
      db.close();
    }
    projectHandles.clear();
    rosterHandle?.close();
    rosterHandle = null;
  }

  return {
    closeAll,
    openProject,
    openRoster,
  };
}

function openDatabase(location: string, kind: "project" | "roster"): TeamDatabaseHandle {
  const db = new DatabaseSync(location);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA synchronous=NORMAL");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`PRAGMA busy_timeout=${TEAM_DATABASE_BUSY_TIMEOUT_MS}`);
  migrateDatabase(db, kind);
  return db;
}
