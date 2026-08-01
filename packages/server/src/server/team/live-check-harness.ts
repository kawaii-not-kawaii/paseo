/* eslint-disable unicorn/require-post-message-target-origin */
/**
 * Shared rig for the live validation checks (`t056-live-check.ts`, `t101-live-check.ts`).
 *
 * These run real member runtimes against real models, which is the only way to catch the class of
 * defect that shipped this branch: sixty service-level tests were green while members were starting
 * with no `team_*` tools at all. Everything here exists to make that class of run reproducible and
 * to keep the two harness traps that produced convincing false results from being rediscovered.
 *
 * Isolation: an in-process daemon with its own PASEO_HOME on an OS-assigned port. Never touches
 * ~/.paseo or the daemon on 6767.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import type { Logger } from "pino";
import type { TeamChannel, TeamMember, TeamMessage } from "@getpaseo/protocol/team/types";
import { createPaseoDaemon } from "../bootstrap.js";
import { FileBackedWorkspaceRegistry } from "../workspace-registry.js";
import { getConfiguredTeamService } from "./bootstrap.js";
import type { TeamService } from "./team-service.js";
import { MemberLifecycle } from "./member-lifecycle.js";

export interface LiveMemberSpec {
  /** Mention handle. Keep it short: members address each other as `@name`. */
  name: string;
  description: string;
  /** `provider/model`, e.g. `codex/gpt-5.3-codex-spark`. */
  spec: string;
  rolePrompt: string;
}

export interface LiveCheck {
  label: string;
  ok: boolean;
}

export interface LiveVerdict {
  pass: boolean;
  checks: LiveCheck[];
  detail?: string;
}

export interface LiveTeam {
  teamService: TeamService;
  projectId: string;
  channel: TeamChannel;
  human: TeamMember;
  /** Keyed by `LiveMemberSpec.name`. */
  members: Record<string, TeamMember>;
  repo: string;
  /** Posts as the human and delivers mentions, exactly as `TeamSession.handleMessagePost` does. */
  post(body: string): Promise<TeamMessage>;
  /** Polls until `evaluate` passes or the deadline expires, streaming new messages to stdout. */
  watch(evaluate: () => LiveVerdict, timeoutMs: number): Promise<LiveVerdict>;
  stop(): Promise<void>;
}

const POLL_MS = 5_000;

export async function startLiveTeam(options: {
  /** Used for temp dir names and the project id. */
  prefix: string;
  channelName: string;
  members: LiveMemberSpec[];
  /** Files to seed the working repo with, relative path → contents. */
  files: Record<string, string>;
  keep?: boolean;
}): Promise<LiveTeam> {
  const logger = pino({ level: "warn" });
  const projectId = `prj_${options.prefix}`;
  const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), `${options.prefix}-home-`));
  const paseoHome = path.join(paseoHomeRoot, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  const staticDir = await mkdtemp(path.join(os.tmpdir(), `${options.prefix}-static-`));
  const repo = await createRepo(options.prefix, options.files);

  // Seed the daemon's OWN workspace registry rather than passing a stub to MemberLifecycle.
  //
  // A member calling team_post does not use the lifecycle this harness builds — mcp-tools.ts
  // constructs its own from the daemon's real registry. If the two disagree, the agent-to-agent
  // mention resolves a home workspace that "does not exist", which clears home_workspace_id and
  // reports the teammate as unmentionable. That reads as a product failure and is not one.
  const registry = new FileBackedWorkspaceRegistry(
    path.join(paseoHome, "projects", "workspaces.json"),
    logger,
  );
  await mkdir(path.join(paseoHome, "projects"), { recursive: true });
  const stamp = new Date().toISOString();
  // `project_members.home_workspace_id` is UNIQUE, so members cannot share one. Distinct ids
  // pointing at the same directory is what lets a reviewer read what an implementer wrote.
  const workspaceIds = new Map(
    options.members.map((member) => [member.name, `wks_${options.prefix}_${member.name}`]),
  );
  for (const workspaceId of workspaceIds.values()) {
    await registry.upsert({
      workspaceId,
      projectId,
      cwd: repo,
      kind: "local_checkout",
      displayName: workspaceId,
      title: null,
      branch: null,
      worktreeRoot: null,
      baseBranch: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
      createdAt: stamp,
      updatedAt: stamp,
      archivedAt: null,
      pinnedAt: null,
    });
  }

  // `agentClients: {}` adds no fakes, which leaves the real Claude and Codex runtimes in place.
  // `mcpInjectIntoAgents` is left unset because bootstrap treats undefined as on — that is what a
  // member needs in order to see team_* at all.
  const daemon = await createPaseoDaemon(
    {
      listen: "127.0.0.1:0",
      paseoHome,
      corsAllowedOrigins: [],
      hostnames: true,
      mcpEnabled: true,
      staticDir,
      mcpDebug: false,
      agentStoragePath: path.join(paseoHome, "agents"),
      relayEnabled: false,
      relayEndpoint: "relay.paseo.sh:443",
      appBaseUrl: "https://app.paseo.sh",
      agentClients: {},
    },
    logger,
  );
  await daemon.start();

  const teamService = getConfiguredTeamService();
  const members: Record<string, TeamMember> = {};
  for (const spec of options.members) {
    members[spec.name] = teamService.createMember({
      projectId,
      name: spec.name,
      description: spec.description,
      provider: providerOf(spec.spec),
      model: modelOf(spec.spec),
      homeWorkspaceId: workspaceIds.get(spec.name) ?? `wks_${options.prefix}_${spec.name}`,
      modeId: unattendedModeFor(spec.spec),
      rolePrompt: spec.rolePrompt,
    });
  }
  const channel = teamService.createChannel({
    projectId,
    name: options.channelName,
    memberIds: Object.values(members).map((member) => member.id),
  });
  const human = teamService.getHumanMember();

  const lifecycle = new MemberLifecycle({
    teamService,
    agentManager: daemon.agentManager,
    workspaceRegistry: registry,
    logger,
  });

  const printed = new Set<string>();

  return {
    teamService,
    projectId,
    channel,
    human,
    members,
    repo,

    async post(body: string): Promise<TeamMessage> {
      const message = teamService.postMessage({
        projectId,
        channelId: channel.id,
        authorMemberId: human.id,
        body,
      });
      console.log(`posted 1 human message, mentioning ${message.mentionMemberIds?.length ?? 0}\n`);
      await lifecycle.deliverMentions({ projectId, message });
      return message;
    },

    async watch(evaluate: () => LiveVerdict, timeoutMs: number): Promise<LiveVerdict> {
      const deadline = Date.now() + timeoutMs;
      let verdict = evaluate();
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        drain(teamService, projectId, channel.id, printed);
        verdict = evaluate();
        if (verdict.pass) {
          break;
        }
      }
      drain(teamService, projectId, channel.id, printed);
      return verdict;
    },

    async stop(): Promise<void> {
      await daemon.stop().catch(() => undefined);
      if (options.keep) {
        console.log(`\nkept: ${paseoHomeRoot} ${repo}`);
        return;
      }
      await rm(paseoHomeRoot, { recursive: true, force: true });
      await rm(staticDir, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    },
  };
}

export function reportVerdict(name: string, verdict: LiveVerdict): boolean {
  console.log(`\n${"=".repeat(72)}`);
  if (verdict.detail) {
    console.log(verdict.detail);
  }
  for (const check of verdict.checks) {
    console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.label}`);
  }
  console.log(`${"=".repeat(72)}`);
  console.log(`${name}: ${verdict.pass ? "PASS" : "FAIL"}`);
  return verdict.pass;
}

/** `listMessages` returns newest-first; print oldest-first and dedupe by id. */
function drain(
  teamService: TeamService,
  projectId: string,
  channelId: string,
  printed: Set<string>,
): void {
  const messages = teamService.listMessages({ projectId, channelId, limit: 500 }).messages;
  for (const message of messages.toReversed()) {
    if (printed.has(message.id)) {
      continue;
    }
    printed.add(message.id);
    const name = teamService.getMemberDisplayName(message.authorMemberId) ?? "?";
    console.log(`  [${name}] ${oneLine(message.body)}`);
  }
}

export function providerOf(spec: string): string {
  return spec.split("/")[0] ?? spec;
}

export function modelOf(spec: string): string | undefined {
  const [, ...rest] = spec.split("/");
  return rest.length > 0 ? rest.join("/") : undefined;
}

/**
 * A member sitting on an unanswered permission prompt is indistinguishable from a member that chose
 * not to act, so every runtime here runs unattended. `auto-review` is Codex-only and Claude throws
 * on an unknown mode.
 */
export function unattendedModeFor(spec: string): string {
  return providerOf(spec) === "claude" ? "bypassPermissions" : "full-access";
}

async function createRepo(prefix: string, files: Record<string, string>): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), `${prefix}-repo-`));
  for (const [relativePath, contents] of Object.entries(files)) {
    await writeFile(path.join(repo, relativePath), contents, "utf8");
  }
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync(
    "git",
    ["-c", `user.email=${prefix}@local`, "-c", `user.name=${prefix}`, "commit", "-qm", "init"],
    { cwd: repo },
  );
  return repo;
}

function oneLine(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { Logger };
