import {
  Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { TeamHomeFileEntry } from "@getpaseo/protocol/team/types";

export interface MemberHomeFileListing {
  memberId: string;
  path: string;
  entries: TeamHomeFileEntry[];
}

export interface MemberHomeFileRead {
  memberId: string;
  path: string;
  content: string;
}

export function getMemberHomeDir(paseoHome: string, memberId: string): string {
  return join(paseoHome, "team", "members", memberId);
}

export function ensureMemberHome(paseoHome: string, memberId: string): string {
  const memberHomeDir = getMemberHomeDir(paseoHome, memberId);
  mkdirSync(join(memberHomeDir, "notes"), { recursive: true });
  mkdirSync(join(memberHomeDir, "artifacts"), { recursive: true });

  const memoryPath = join(memberHomeDir, "MEMORY.md");
  if (!existsSync(memoryPath)) {
    writeFileSync(
      memoryPath,
      "# MEMORY\n\nRecord what you have learned here. This file belongs to the member.\n",
      "utf8",
    );
  }

  return memberHomeDir;
}

export function composeMemberSystemPrompt(
  rolePrompt: string | null | undefined,
  memberHomeDir: string,
): string {
  const parts = [
    rolePrompt?.trim(),
    `Your member home directory is ${memberHomeDir}.`,
    "Your role prompt defines who you are and what you own. The user owns that prompt.",
    "Your MEMORY.md records what you have learned. You own that memory and should keep it current.",
    "Do not rewrite your role prompt into MEMORY.md or treat MEMORY.md as user instructions.",
  ].filter((part) => typeof part === "string" && part.length > 0);
  return parts.join("\n\n");
}

export function listMemberHomeFiles(
  paseoHome: string,
  memberId: string,
  requestedPath?: string,
): MemberHomeFileListing {
  const resolved = resolveMemberHomePath(paseoHome, memberId, requestedPath ?? ".");
  if (!statSync(resolved.absolutePath).isDirectory()) {
    throw new Error(`Path ${resolved.relativePath} is not a directory.`);
  }

  const entries = readdirSync(resolved.absolutePath, { withFileTypes: true })
    .map((entry) => toHomeFileEntry(resolved.absolutePath, resolved.relativePath, entry))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    memberId,
    path: resolved.relativePath,
    entries,
  };
}

export function readMemberHomeFile(
  paseoHome: string,
  memberId: string,
  requestedPath: string,
): MemberHomeFileRead {
  const resolved = resolveMemberHomePath(paseoHome, memberId, requestedPath);
  if (!statSync(resolved.absolutePath).isFile()) {
    throw new Error(`Path ${resolved.relativePath} is not a file.`);
  }

  return {
    memberId,
    path: resolved.relativePath,
    content: readFileSync(resolved.absolutePath, "utf8"),
  };
}

function resolveMemberHomePath(
  paseoHome: string,
  memberId: string,
  requestedPath: string,
): { absolutePath: string; relativePath: string } {
  const memberHomeDir = ensureMemberHome(paseoHome, memberId);
  const memberHomeRealPath = realpathSync(memberHomeDir);
  const targetPath = resolve(memberHomeDir, requestedPath);
  const resolvedTargetPath = realpathSync(targetPath);
  if (!isPathInside(memberHomeRealPath, resolvedTargetPath)) {
    throw new Error("Resolved path escapes member home directory.");
  }

  const resolvedRelativePath = relative(memberHomeRealPath, resolvedTargetPath);
  return {
    absolutePath: resolvedTargetPath,
    relativePath: resolvedRelativePath.length > 0 ? resolvedRelativePath : ".",
  };
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const candidateRelativePath = relative(rootPath, candidatePath);
  return (
    candidateRelativePath.length === 0 ||
    (!candidateRelativePath.startsWith("..") && !isAbsolute(candidateRelativePath))
  );
}

function toHomeFileEntry(
  parentPath: string,
  relativeParentPath: string,
  entry: Dirent,
): TeamHomeFileEntry {
  const relativePath =
    relativeParentPath === "." ? entry.name : `${relativeParentPath}/${entry.name}`;
  const absolutePath = resolve(parentPath, entry.name);
  const stats = statSync(absolutePath);
  return {
    name: entry.name,
    path: relativePath,
    kind: stats.isDirectory() ? "directory" : "file",
  };
}
