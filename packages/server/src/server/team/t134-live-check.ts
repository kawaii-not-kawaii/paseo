/**
 * T134 / FR-007c / FR-012a live check against the checkout's dev daemon on port 6768.
 *
 * Run `seed` while the daemon is stopped, start `npm run dev`, then run `check`. The seed step
 * writes the real workspace registry before daemon startup because member-authored team tools
 * construct their lifecycle from that registry.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { type RawData, WebSocket } from "ws";
import { FileBackedWorkspaceRegistry } from "../workspace-registry.js";
import { TeamService } from "./team-service.js";

interface LiveState {
  projectId: string;
  channelId: string;
  memberIds: [string, string];
  memberNames: [string, string];
  replyTokens: [string, string];
}

interface SessionMessage {
  type: string;
  payload?: Record<string, unknown>;
}

const paseoHome = path.resolve(process.env.PASEO_HOME ?? ".dev/paseo-home");
const liveRoot = path.resolve(".dev/team-auto-wake-live");
const statePath = path.join(liveRoot, "state.json");
const timeoutMs = Number(process.env.T134_TIMEOUT_MS ?? 480_000);

async function seed(): Promise<void> {
  const suffix = Date.now().toString(36);
  const projectId = `prj_t134_${suffix}`;
  const memberNames: [string, string] = [`alpha${suffix}`, `beta${suffix}`];
  const replyTokens: [string, string] = [`ALPHA_CAUGHT_UP_${suffix}`, `BETA_CAUGHT_UP_${suffix}`];
  await mkdir(path.join(paseoHome, "projects"), { recursive: true });
  await mkdir(liveRoot, { recursive: true });

  const registry = new FileBackedWorkspaceRegistry(
    path.join(paseoHome, "projects", "workspaces.json"),
    pino({ level: "warn" }),
  );
  const stamp = new Date().toISOString();
  const workspaceIds = memberNames.map((name) => `wks_t134_${name}`) as [string, string];
  for (const [index, workspaceId] of workspaceIds.entries()) {
    const cwd = path.join(liveRoot, workspaceId);
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(cwd, "README.md"),
      `# ${memberNames[index]}\n\nT134 live-check workspace.\n`,
      "utf8",
    );
    if (!existsSync(path.join(cwd, ".git"))) {
      execFileSync("git", ["init", "-q"], { cwd });
      execFileSync("git", ["add", "."], { cwd });
      execFileSync(
        "git",
        ["-c", "user.email=t134@local", "-c", "user.name=T134", "commit", "-qm", "seed live check"],
        { cwd },
      );
    }
    await registry.upsert({
      workspaceId,
      projectId,
      cwd,
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

  const service = new TeamService({ paseoHome });
  const channel = service.createChannel({ projectId, name: "live" });
  const model = process.env.T134_MODEL ?? "gpt-5.3-codex-spark";
  const members = memberNames.map((name, index) =>
    service.createMember({
      projectId,
      name,
      description: "Exercises deferred Team catch-up",
      provider: "codex",
      model,
      modeId: "full-access",
      homeWorkspaceId: workspaceIds[index],
      rolePrompt: [
        `You are ${name}, a deterministic live-check member.`,
        "When a channel message contains STAY_BUSY, run `sleep 20` in the shell.",
        "During that STAY_BUSY run, do not call team_post and do not mention another member.",
        `For any later catch-up notification, call team_read for channel "live", then call team_post once in "live" with exactly: ${replyTokens[index]}`,
        "Never mention another member in that reply.",
      ].join(" "),
    }),
  );
  const state: LiveState = {
    projectId,
    channelId: channel.id,
    memberIds: [members[0]!.id, members[1]!.id],
    memberNames,
    replyTokens,
  };
  service.close();
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ seeded: true, paseoHome, ...state }, null, 2));
}

async function check(): Promise<void> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as LiveState;
  const socket = new WebSocket("ws://127.0.0.1:6768/ws");
  const statusEvents: Array<{ memberId: string; status: string; at: number }> = [];
  const postedBodies: Array<{ authorMemberId: string; body: string; at: number }> = [];
  const pending = new Map<string, (message: SessionMessage) => void>();

  socket.on("message", (data: RawData) => {
    const outer = JSON.parse(data.toString()) as { type: string; message?: SessionMessage };
    const message = outer.type === "session" ? outer.message : undefined;
    if (!message) {
      return;
    }
    const requestId = message.payload?.requestId;
    if (typeof requestId === "string") {
      pending.get(requestId)?.(message);
    }
    if (message.type === "team.member.changed") {
      const member = message.payload?.member as
        | { id?: string; name?: string; status?: string }
        | undefined;
      if (member?.id && member.status) {
        statusEvents.push({ memberId: member.id, status: member.status, at: Date.now() });
        console.log(`status ${member.name ?? member.id}: ${member.status}`);
      }
    }
    if (message.type === "team.message.posted") {
      const posted = message.payload?.message as
        | { authorMemberId?: string; body?: string }
        | undefined;
      if (posted?.authorMemberId && posted.body) {
        postedBodies.push({
          authorMemberId: posted.authorMemberId,
          body: posted.body,
          at: Date.now(),
        });
        console.log(`message ${posted.authorMemberId}: ${posted.body}`);
      }
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(
      JSON.stringify({
        type: "hello",
        clientId: `t134-${Date.now()}`,
        clientType: "browser",
        protocolVersion: 1,
      }),
    );
    await waitForSocketMessage(
      socket,
      (outer) =>
        outer.type === "session" &&
        outer.message?.type === "status" &&
        outer.message.payload?.status === "server_info",
      30_000,
    );

    for (const memberId of state.memberIds) {
      const stopped = await request(socket, pending, {
        type: "team.member.stop.request",
        projectId: state.projectId,
        memberId,
      });
      assertResponse(stopped, "team.member.stop.response");
      const started = await request(socket, pending, {
        type: "team.member.start.request",
        projectId: state.projectId,
        memberId,
      });
      assertResponse(started, "team.member.start.response");
    }
    await waitUntil(
      "manually started member runtimes to become idle",
      () => state.memberIds.every((id) => latestStatus(statusEvents, id) === "idle"),
      120_000,
    );
    statusEvents.length = 0;
    postedBodies.length = 0;
    for (const memberName of state.memberNames) {
      const sent = await request(socket, pending, {
        type: "send_agent_message_request",
        agentId: memberName,
        text: "STAY_BUSY private runtime check. Run `sleep 20` in the shell, do not call any team_* tool, then answer only READY in this private run.",
      });
      assertResponse(sent, "send_agent_message_response");
      if (sent.payload?.accepted !== true) {
        throw new Error(`Private busy run was rejected for ${memberName}`);
      }
    }
    await waitUntil(
      "both members running",
      () => state.memberIds.every((id) => latestStatus(statusEvents, id) === "running"),
      60_000,
    );

    const catchUpBody = `CATCH_UP_TOKEN_${Date.now()}: read this after the run you are already doing, then reply once.`;
    const catchUpPostedAt = Date.now();
    const posted = await request(socket, pending, {
      type: "team.message.post.request",
      projectId: state.projectId,
      channelId: state.channelId,
      body: catchUpBody,
    });
    assertResponse(posted, "team.message.post.response");
    const postedMessage = posted.payload?.message as { mentionMemberIds?: string[] } | undefined;
    if ((postedMessage?.mentionMemberIds ?? []).length !== 0) {
      throw new Error("The catch-up message unexpectedly contained a mention");
    }

    await waitUntil(
      "both members post their catch-up replies",
      () =>
        state.replyTokens.every((token) =>
          postedBodies.some((message) => message.body.includes(token)),
        ),
      timeoutMs,
    );
    const firstAgentPostAt = Math.min(
      ...postedBodies
        .filter((message) => state.memberIds.includes(message.authorMemberId))
        .map((message) => message.at),
    );
    if (firstAgentPostAt - catchUpPostedAt < 8_000) {
      throw new Error("A busy member appears to have been interrupted by the ambient message");
    }
    await waitUntil(
      "both catch-up runs to publish their final idle status",
      () =>
        state.memberIds.every((memberId) =>
          containsInOrder(
            statusEvents
              .filter((event) => event.memberId === memberId)
              .map((event) => event.status),
            ["running", "idle", "running", "idle"],
          ),
        ),
      60_000,
    );
    for (const memberId of state.memberIds) {
      const statuses = statusEvents
        .filter((event) => event.memberId === memberId)
        .map((event) => event.status);
      if (!containsInOrder(statuses, ["running", "idle", "running", "idle"])) {
        throw new Error(`Missing pushed run/catch-up transitions for ${memberId}: ${statuses}`);
      }
    }

    await waitForQuiescence(
      () => ({
        activity: statusEvents.length + postedBodies.length,
        idle: state.memberIds.every((id) => latestStatus(statusEvents, id) === "idle"),
      }),
      20_000,
      120_000,
    );
    const listed = await request(socket, pending, {
      type: "team.message.list.request",
      projectId: state.projectId,
      channelId: state.channelId,
      limit: 100,
    });
    assertResponse(listed, "team.message.list.response");
    const messages = (listed.payload?.messages ?? []) as Array<{
      authorMemberId: string;
      body: string;
    }>;
    const checks = {
      oneUnmentionedHumanTrigger:
        messages.filter((message) => message.body === catchUpBody).length === 1,
      bothMembersReplied: state.replyTokens.every((token) =>
        postedBodies.some((message) => message.body.includes(token)),
      ),
      pushedRunningAndIdle: state.memberIds.every((memberId) =>
        containsInOrder(
          statusEvents.filter((event) => event.memberId === memberId).map((event) => event.status),
          ["running", "idle", "running", "idle"],
        ),
      ),
      restedFor20Seconds: state.memberIds.every(
        (memberId) => latestStatus(statusEvents, memberId) === "idle",
      ),
    };
    console.log(JSON.stringify({ pass: Object.values(checks).every(Boolean), checks }, null, 2));
    if (!Object.values(checks).every(Boolean)) {
      process.exitCode = 1;
    }
  } finally {
    socket.close();
  }
}

function request(
  socket: WebSocket,
  pending: Map<string, (message: SessionMessage) => void>,
  message: Record<string, unknown>,
): Promise<SessionMessage> {
  const requestId = `t134-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timed out waiting for ${String(message.type)}`));
    }, timeoutMs);
    pending.set(requestId, (response) => {
      clearTimeout(timeout);
      pending.delete(requestId);
      resolve(response);
    });
    socket.send(JSON.stringify({ type: "session", message: { ...message, requestId } }));
  });
}

function assertResponse(message: SessionMessage, expectedType: string): void {
  if (message.type !== expectedType || message.payload?.error) {
    throw new Error(
      `Expected ${expectedType}, received ${message.type}: ${String(message.payload?.error ?? "")}`,
    );
  }
}

function waitForSocketMessage(
  socket: WebSocket,
  matches: (message: {
    type: string;
    message?: { type: string; payload?: Record<string, unknown> };
  }) => boolean,
  waitMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message"));
    }, waitMs);
    const onMessage = (data: RawData) => {
      if (!matches(JSON.parse(data.toString()))) {
        return;
      }
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
    };
    socket.on("message", onMessage);
  });
}

async function waitUntil(label: string, predicate: () => boolean, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForQuiescence(
  snapshot: () => { activity: number; idle: boolean },
  quietMs: number,
  waitMs: number,
): Promise<void> {
  const deadline = Date.now() + waitMs;
  let last = snapshot();
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(500);
    const current = snapshot();
    if (current.activity !== last.activity || !current.idle) {
      last = current;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) {
      return;
    }
  }
  throw new Error("The member exchange did not come to rest");
}

function latestStatus(
  events: Array<{ memberId: string; status: string }>,
  memberId: string,
): string | undefined {
  return events.findLast((event) => event.memberId === memberId)?.status;
}

function containsInOrder(values: string[], expected: string[]): boolean {
  let index = 0;
  for (const value of values) {
    if (value === expected[index]) {
      index += 1;
    }
  }
  return index === expected.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mode = process.argv[2];
if (mode === "seed") {
  await seed();
} else if (mode === "check") {
  await check();
} else {
  throw new Error("Usage: t134-live-check.ts seed|check");
}
