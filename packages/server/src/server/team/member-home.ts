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

/**
 * How a member participates in its team.
 *
 * Members run with the full Paseo tool catalogue, which includes create_agent. Left unsaid, a
 * member asked to "hand this to QA" will spawn a throwaway agent instead of mentioning the QA
 * member — work happens, the channel stays empty, and the human is relaying again.
 */
const TEAM_COLLABORATION_PROMPT = [
  "You are a member of a persistent team working in this project.",
  "",
  "Talk to your teammates by posting in a channel with the team_post tool. Mention a member as @name to reach them; mentioning an idle member starts it, so you never need to create an agent to hand work over. Use team_read to catch up on a channel and team_roster to see who is on the team and what they own.",
  "",
  "Track work with team_tasks and team_task_update. Claim a task before you work on it, record progress as you go, and release it when you hand it on. A claim is an exclusive lock — if a claim is refused, the refusal names who holds it.",
  "",
  "Do not create ad-hoc agents to delegate work to. Mention the member who owns it. If nobody owns it, say so in the channel and mention the human.",
  "",
  "When you finish a piece of work, post the outcome in the channel. Silence reads as no progress.",
].join("\n");

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
    // Without this a member does its work and then reaches for create_agent to hand off, because
    // the generic Paseo tools are also in scope and nothing said otherwise. The result looks like
    // progress but the channel stays silent and the user is back to relaying (SC-002).
    TEAM_COLLABORATION_PROMPT,
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
