import { mkdirSync, readdirSync, rmSync } from "node:fs";
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

/**
 * Project ids reach this module straight off the wire — every team RPC carries `projectId` as an
 * unconstrained `z.string()`, and it is used as a path component. Without this, an authenticated
 * client sending `../../../tmp/x` gets a SQLite file created wherever the daemon can write.
 *
 * Real ids are `prj_<hex>` (see `projects.json`); tests use names like `project-1`. Anything with a
 * path separator, a drive letter, or a leading dot is not an id we ever issue.
 */
const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeProjectId(projectId: string): void {
  if (!SAFE_PROJECT_ID.test(projectId) || projectId.includes("..")) {
    throw new Error(`Invalid project id: ${JSON.stringify(projectId)}`);
  }
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

    assertSafeProjectId(projectId);
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

  function getProjectPath(projectId: string): string {
    return join(options.teamDir, `${projectId}.db`);
  }

  function getRosterPath(): string {
    return join(options.teamDir, "roster.db");
  }

  function listProjectIds(): string[] {
    return readdirSync(options.teamDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".db") && entry.name !== "roster.db")
      .map((entry) => entry.name.slice(0, -3))
      .sort();
  }

  function deleteProjectData(projectId: string): void {
    const handle = projectHandles.get(projectId);
    handle?.close();
    projectHandles.delete(projectId);
    rmSync(getProjectPath(projectId), { force: true });
  }

  return {
    closeAll,
    deleteProjectData,
    getProjectPath,
    getRosterPath,
    listProjectIds,
    openProject,
    openRoster,
  };
}

function openDatabase(location: string, kind: "project" | "roster"): TeamDatabaseHandle {
  const db = new DatabaseSync(location);
  try {
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(`PRAGMA busy_timeout=${TEAM_DATABASE_BUSY_TIMEOUT_MS}`);
    migrateDatabase(db, kind);
    return db;
  } catch (error) {
    // A corrupt or unreadable file throws here, after the handle already exists. Leaving it open
    // holds the file — invisible on POSIX, but on Windows it blocks the restore-from-snapshot
    // that FR-042 offers for exactly this database. Close before rethrowing.
    db.close();
    throw error;
  }
}
