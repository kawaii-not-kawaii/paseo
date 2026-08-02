import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { TEAM_DATABASE_BUSY_TIMEOUT_MS } from "./database.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => {
    close(): void;
    exec(sql: string): void;
  };
};

const TEAM_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TEAM_BACKUP_RETENTION_COUNT = 3;

export interface TeamDatabaseSnapshot {
  databaseName: string;
  path: string;
  createdAt: string;
}

export function createTeamBackupManager(input: { teamDir: string; now?: () => Date }) {
  const backupDir = join(input.teamDir, "backups");
  const now = input.now ?? (() => new Date());
  mkdirSync(backupDir, { recursive: true });

  async function snapshotDatabase(params: {
    databaseName: string;
    databasePath: string;
  }): Promise<TeamDatabaseSnapshot> {
    const createdAt = now().toISOString();
    const timestamp = formatBackupTimestamp(createdAt);
    const path = join(backupDir, `${params.databaseName}-${timestamp}.db`);
    const db = new DatabaseSync(params.databasePath);
    try {
      db.exec(`PRAGMA busy_timeout=${TEAM_DATABASE_BUSY_TIMEOUT_MS}`);
      db.exec(`VACUUM INTO ${quoteSqlString(path)}`);
    } finally {
      db.close();
    }
    await pruneSnapshots(params.databaseName);
    return {
      databaseName: params.databaseName,
      path,
      createdAt,
    };
  }

  async function listSnapshots(databaseName: string): Promise<TeamDatabaseSnapshot[]> {
    const entries = await readdir(backupDir, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.startsWith(`${databaseName}-`) && entry.name.endsWith(".db"),
      )
      .map((entry) => ({
        databaseName,
        path: join(backupDir, entry.name),
        createdAt: parseBackupTimestamp(entry.name.slice(databaseName.length + 1, -3)),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async function getLatestSnapshot(databaseName: string): Promise<TeamDatabaseSnapshot | null> {
    const snapshots = await listSnapshots(databaseName);
    return snapshots.at(-1) ?? null;
  }

  async function restoreDatabase(params: {
    databaseName: string;
    destinationPath: string;
    snapshotPath: string;
  }): Promise<void> {
    const restorePath = `${params.destinationPath}.restore-${Date.now()}`;
    await rename(params.snapshotPath, restorePath);
    try {
      await rm(params.destinationPath, { force: true });
      await rename(restorePath, params.destinationPath);
    } catch (error) {
      await rename(restorePath, params.snapshotPath).catch(() => {});
      throw error;
    }
  }

  async function pruneSnapshots(databaseName: string): Promise<void> {
    const snapshots = await listSnapshots(databaseName);
    const staleSnapshots = snapshots.slice(
      0,
      Math.max(0, snapshots.length - TEAM_BACKUP_RETENTION_COUNT),
    );
    await Promise.all(staleSnapshots.map((snapshot) => rm(snapshot.path, { force: true })));
  }

  return {
    backupDir,
    getLatestSnapshot,
    listSnapshots,
    restoreDatabase,
    snapshotDatabase,
  };
}

export { TEAM_BACKUP_INTERVAL_MS, TEAM_BACKUP_RETENTION_COUNT };

function formatBackupTimestamp(timestamp: string): string {
  return timestamp.replaceAll(/[-:]/g, "").replace(".000Z", "Z");
}

function parseBackupTimestamp(timestamp: string): string {
  const match = timestamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{3}))?Z$/);
  if (!match) {
    throw new Error(`Invalid team backup filename: ${timestamp}`);
  }
  const [, year, month, day, hour, minute, second, ms = "000"] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
