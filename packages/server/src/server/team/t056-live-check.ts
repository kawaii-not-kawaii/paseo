/* eslint-disable unicorn/require-post-message-target-origin */
/**
 * T056 / SC-002 live check — the MVP thesis, run against real models.
 *
 *   Two members. One human message. A multi-turn agent-to-agent exchange happens in the channel,
 *   and work gets done, without the human relaying anything.
 *
 * Everything else in the team test suite stops at a service boundary or a fake provider. This is
 * the only thing that answers "will two real models actually talk to each other", and it answers it
 * as a boolean rather than a chat log somebody reads and feels good about.
 *
 * It spends real tokens. It runs on an isolated in-process daemon with its own PASEO_HOME and an
 * OS-assigned port, so it never touches ~/.paseo or the daemon on 6767.
 *
 *   npx tsx packages/server/src/server/team/t056-live-check.ts
 *
 * Environment:
 *   T056_IMPL_PROVIDER   default codex/gpt-5.3-codex-spark
 *   T056_QA_PROVIDER     default claude/sonnet
 *   T056_TIMEOUT_MS      default 600000 (10 minutes)
 *   T056_KEEP            set to keep the temp dirs for inspection
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { createPaseoDaemon } from "../bootstrap.js";
import { FileBackedWorkspaceRegistry } from "../workspace-registry.js";
import { getConfiguredTeamService } from "./bootstrap.js";
import { MemberLifecycle } from "./member-lifecycle.js";
import type { TeamMessage } from "@getpaseo/protocol/team/types";

const PROJECT_ID = "prj_t056";
const CHANNEL_NAME = "build";
// `project_members.home_workspace_id` is UNIQUE — a workspace belongs to exactly one member. Two
// ids pointing at the same directory is what lets both members see the same code, which SC-002
// needs: qa cannot verify a change it cannot read.
const IMPL_WORKSPACE_ID = "wks_t056_impl";
const QA_WORKSPACE_ID = "wks_t056_qa";
const TIMEOUT_MS = Number(process.env.T056_TIMEOUT_MS ?? 600_000);
const POLL_MS = 5_000;

const IMPL_PROVIDER = process.env.T056_IMPL_PROVIDER ?? "codex/gpt-5.3-codex-spark";
const QA_PROVIDER = process.env.T056_QA_PROVIDER ?? "claude/sonnet";

// Mentions ONLY @impl. If the human names @qa too, the daemon starts both from that one message and
// impl's handoff never has to start anything — the human did the routing, which is the thing SC-002
// says should not be necessary. impl learns to involve qa from its role prompt, not from the human.
const HUMAN_MESSAGE = "@impl please add a subtract(a, b) function to calc.js.";

async function main(): Promise<void> {
  const logger = pino({ level: "warn" });
  const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), "t056-home-"));
  const paseoHome = path.join(paseoHomeRoot, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  const staticDir = await mkdtemp(path.join(os.tmpdir(), "t056-static-"));
  const repo = await createRepo();

  console.log(`repo:      ${repo}`);
  console.log(`paseoHome: ${paseoHome}`);
  console.log(`impl:      ${IMPL_PROVIDER}`);
  console.log(`qa:        ${QA_PROVIDER}\n`);

  // `agentClients` is deliberately omitted: it only *adds* clients, so leaving it out means the
  // real Claude and Codex runtimes. mcpInjectIntoAgents is left unset — bootstrap treats undefined
  // as on, which is what a member needs to see team_* at all.
  // Seed the daemon's own workspace registry rather than stubbing one. A stub only reaches the
  // lifecycle this script constructs; when a member calls team_post, mcp-tools.ts builds its own
  // lifecycle from the daemon's real registry. If the two disagree, the mention is delivered to a
  // member whose home workspace "does not exist", which clears home_workspace_id and reports the
  // teammate as unmentionable — a harness artifact that looks exactly like a product failure.
  const registry = new FileBackedWorkspaceRegistry(
    path.join(paseoHome, "projects", "workspaces.json"),
    logger,
  );
  await mkdir(path.join(paseoHome, "projects"), { recursive: true });
  const stamp = new Date().toISOString();
  for (const workspaceId of [IMPL_WORKSPACE_ID, QA_WORKSPACE_ID]) {
    await registry.upsert({
      workspaceId,
      projectId: PROJECT_ID,
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

  let failure: string | null = null;
  try {
    const teamService = getConfiguredTeamService();
    const channel = teamService.createChannel({ projectId: PROJECT_ID, name: CHANNEL_NAME });

    const impl = teamService.createMember({
      projectId: PROJECT_ID,
      name: "impl",
      description: "Implements changes",
      provider: providerOf(IMPL_PROVIDER),
      model: modelOf(IMPL_PROVIDER),
      homeWorkspaceId: IMPL_WORKSPACE_ID,
      modeId: unattendedModeFor(IMPL_PROVIDER),
      rolePrompt:
        "You are impl. You implement code changes in this repository. When your change is done, hand it to @qa in the channel for verification. Do not verify your own work.",
    });
    const qa = teamService.createMember({
      projectId: PROJECT_ID,
      name: "qa",
      description: "Verifies changes",
      provider: providerOf(QA_PROVIDER),
      model: modelOf(QA_PROVIDER),
      homeWorkspaceId: QA_WORKSPACE_ID,
      modeId: unattendedModeFor(QA_PROVIDER),
      rolePrompt:
        "You are qa. You verify changes that @impl makes, by reading and running them. Post the verdict in the channel. Do not implement the change yourself.",
    });
    const human = teamService.getHumanMember();

    const lifecycle = new MemberLifecycle({
      teamService,
      agentManager: daemon.agentManager,
      workspaceRegistry: registry,
      logger,
    });

    // This is exactly what TeamSession.handleMessagePost does: persist, then deliver mentions.
    const posted = teamService.postMessage({
      projectId: PROJECT_ID,
      channelId: channel.id,
      authorMemberId: human.id,
      body: HUMAN_MESSAGE,
    });
    console.log(
      `posted one human message mentioning ${posted.mentionMemberIds?.length ?? 0} member(s)\n`,
    );
    await lifecycle.deliverMentions({ projectId: PROJECT_ID, message: posted });

    const deadline = Date.now() + TIMEOUT_MS;
    const seen = new Set<string>();
    let verdict = evaluate([], { humanId: human.id, implId: impl.id, qaId: qa.id });

    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const messages = teamService.listMessages({
        projectId: PROJECT_ID,
        channelId: channel.id,
        limit: 200,
      }).messages;

      // listMessages returns newest-first; print oldest-first and track ids, because slicing by
      // count against a descending list reprints the oldest message forever.
      for (const message of messages.toReversed()) {
        if (seen.has(message.id)) {
          continue;
        }
        seen.add(message.id);
        console.log(`  [${nameFor(teamService, message.authorMemberId)}] ${oneLine(message.body)}`);
      }

      verdict = evaluate(messages, { humanId: human.id, implId: impl.id, qaId: qa.id });
      if (verdict.pass) {
        break;
      }
    }

    console.log(`\n${"=".repeat(72)}`);
    for (const line of verdict.report) {
      console.log(line);
    }
    console.log(`${"=".repeat(72)}`);
    console.log(verdict.pass ? "T056: PASS" : "T056: FAIL");
    if (!verdict.pass) {
      failure = "SC-002 not satisfied";
    }
  } finally {
    await daemon.stop().catch(() => undefined);
    if (process.env.T056_KEEP) {
      console.log(`\nkept: ${paseoHomeRoot} ${repo}`);
    } else {
      await rm(paseoHomeRoot, { recursive: true, force: true });
      await rm(staticDir, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  }

  if (failure) {
    process.exitCode = 1;
  }
}

/**
 * SC-002 as a boolean. Deliberately mechanical — "the channel looks lively" is what let this ship
 * unvalidated the first time.
 */
function evaluate(
  messages: TeamMessage[],
  ids: { humanId: string; implId: string; qaId: string },
): { pass: boolean; report: string[] } {
  const humanMessages = messages.filter((m) => m.authorMemberId === ids.humanId);
  const agentAuthors = new Set(
    messages.filter((m) => m.authorMemberId !== ids.humanId).map((m) => m.authorMemberId),
  );
  const implHandoff = messages.some(
    (m) => m.authorMemberId === ids.implId && (m.mentionMemberIds ?? []).includes(ids.qaId),
  );
  const qaPosted = messages.some((m) => m.authorMemberId === ids.qaId);
  const qaStartedByAgent =
    implHandoff && !(humanMessages[0]?.mentionMemberIds ?? []).includes(ids.qaId);

  const checks: Array<[string, boolean]> = [
    ["exactly one human message (no relaying)", humanMessages.length === 1],
    ["at least two distinct agent authors", agentAuthors.size >= 2],
    ["impl posted a message mentioning qa", implHandoff],
    ["qa posted in the channel", qaPosted],
    // The point of the whole feature: qa was brought in by impl, not by the human.
    ["qa was started by a mention, not by the human", qaStartedByAgent],
  ];

  return {
    pass: checks.every(([, ok]) => ok),
    report: [
      `messages: ${messages.length} (human ${humanMessages.length}, agents ${agentAuthors.size})`,
      ...checks.map(([label, ok]) => `  ${ok ? "PASS" : "FAIL"}  ${label}`),
    ],
  };
}

function providerOf(spec: string): string {
  return spec.split("/")[0] ?? spec;
}

function modelOf(spec: string): string | undefined {
  const [, ...rest] = spec.split("/");
  return rest.length > 0 ? rest.join("/") : undefined;
}

/**
 * A member sitting on an unanswered permission prompt is indistinguishable from a member that chose
 * not to post, so every runtime here runs unattended. `auto-review` is Codex-only and Claude throws
 * on an unknown mode.
 */
function unattendedModeFor(spec: string): string {
  return providerOf(spec) === "claude" ? "bypassPermissions" : "full-access";
}

async function createRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "t056-repo-"));
  await writeFile(
    path.join(repo, "calc.js"),
    "function add(a, b) {\n  return a + b;\n}\n\nmodule.exports = { add };\n",
    "utf8",
  );
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync(
    "git",
    ["-c", "user.email=t056@local", "-c", "user.name=t056", "commit", "-qm", "init"],
    {
      cwd: repo,
    },
  );
  return repo;
}

function nameFor(
  teamService: ReturnType<typeof getConfiguredTeamService>,
  memberId: string,
): string {
  return teamService.getMemberDisplayName(memberId) ?? memberId.slice(0, 8);
}

function oneLine(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main().catch((error: unknown) => {
  console.error("\nT056: ERROR");
  console.error(error);
  process.exitCode = 1;
});
