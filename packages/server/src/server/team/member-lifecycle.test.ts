import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { isAutoStartedTeamAgent, MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import {
  buildWorkspaceRecord,
  buildMessage,
  createWorkspaceRegistryStub,
  FakeAgentManager,
  seedAssignedMember,
  sequenceIds,
} from "./test-support/team-test-fakes.js";

describe("MemberLifecycle", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("mentioning a member with no running session starts one and delivers the mention with the role prompt as systemPrompt", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: "/repo",
      }),
      logger: createTestLogger(),
    });

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Please review this change", ["member-reviewer"]),
    });

    expect(agentManager.createCalls).toHaveLength(1);
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      "Review carefully before approving.",
    );
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      join(paseoHome, "team", "members", "member-reviewer"),
    );
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      "Your role prompt defines who you are and what you own.",
    );
    expect(agentManager.createCalls[0]?.config.cwd).toBe("/repo");
    expect(agentManager.createCalls[0]?.options.workspaceId).toBe("workspace-reviewer");
    expect(String(agentManager.promptCalls[0]?.prompt)).toContain("Please review this change");

    service.close();
  });

  test("an unmentioned human message wakes every assigned member", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully.",
      homeWorkspaceId: "workspace-reviewer",
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-qa",
      name: "QA",
      rolePrompt: "Test carefully.",
      homeWorkspaceId: "workspace-qa",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: {
        get: async (workspaceId) =>
          buildWorkspaceRecord({
            workspaceId,
            projectId: "project-1",
            cwd: `/repo/${workspaceId}`,
          }),
      },
      logger: createTestLogger(),
    });

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Please take a look", []),
    });

    expect(agentManager.createCalls.map((call) => call.options.workspaceId).sort()).toEqual([
      "workspace-qa",
      "workspace-reviewer",
    ]);
    expect(agentManager.promptCalls).toHaveLength(2);

    service.close();
  });

  test("an unmentioned member message wakes nobody", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = createLifecycle(service, agentManager);

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: {
        ...buildMessage("Status update", []),
        authorMemberId: "member-reviewer",
      },
    });

    expect(agentManager.createCalls).toEqual([]);
    expect(agentManager.promptCalls).toEqual([]);

    service.close();
  });

  test("ambient delivery skips a running member while an explicit mention interrupts it", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = createLifecycle(service, agentManager);
    const started = await lifecycle.start({
      projectId: "project-1",
      memberId: "member-reviewer",
    });
    if (!started) {
      throw new Error("Expected a member runtime");
    }
    agentManager.setAgentLifecycle(started.id, "running");

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Ambient update", []),
    });
    expect(agentManager.promptCalls).toEqual([]);
    expect(agentManager.replaceCalls).toEqual([]);

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: {
        ...buildMessage("@Reviewer please stop and review this", ["member-reviewer"]),
        authorMemberId: "member-qa",
      },
    });
    expect(agentManager.replaceCalls).toEqual([expect.objectContaining({ agentId: started.id })]);

    service.close();
  });

  test("does not rely on a blocking wait tool or resident runtime; a reaped member is still reachable on the next mention", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: "/repo",
      }),
      logger: createTestLogger(),
    });

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("First ping", ["member-reviewer"]),
    });
    agentManager.clearLiveAgents();
    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Second ping after idle reap", ["member-reviewer"]),
    });

    expect(agentManager.createCalls).toHaveLength(2);
    expect(String(agentManager.promptCalls[1]?.prompt)).toContain("Second ping after idle reap");

    service.close();
  });

  test("records auto_started on messages written by automatically started sessions", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "channel-all", "message-1"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "all" });

    const agentManager = new FakeAgentManager();
    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: "/repo",
      }),
      logger: createTestLogger(),
    });

    const started = await lifecycle.deliverMention({
      projectId: "project-1",
      memberId: "member-reviewer",
      prompt: "Please review this change",
    });
    if (!started) {
      throw new Error("Expected an auto-started agent");
    }

    const postTeamMessage = service.postMessage.bind(service);
    const created = postTeamMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: "member-reviewer",
      body: "Reviewed it.",
      autoStarted: isAutoStartedTeamAgent(started),
    });

    expect(created.autoStarted).toBe(true);

    service.close();
  });

  test("starting a member by hand is idempotent and does not prompt it", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = createLifecycle(service, agentManager);

    await lifecycle.start({ projectId: "project-1", memberId: "member-reviewer" });
    await lifecycle.start({ projectId: "project-1", memberId: "member-reviewer" });

    expect(agentManager.createCalls).toHaveLength(1);
    expect(agentManager.promptCalls).toEqual([]);
    // The composed prompt carries the role prompt plus the FR-014e prompt-vs-memory distinction.
    expect(agentManager.createCalls[0]?.config.systemPrompt).toContain(
      "Review carefully before approving.",
    );

    service.close();
  });

  // Research R1: stopping is about the runtime and nothing else. If stopping released claims, a
  // member paused by the user would have its in-progress work taken by someone else.
  test("stopping a member ends its runtime but leaves its claim held", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-qa", "task-1"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const qa = service.createMember({
      projectId: "project-1",
      name: "QA",
      provider: "codex",
      homeWorkspaceId: "workspace-qa",
    });
    const task = service.createTask({
      projectId: "project-1",
      title: "Held across a stop",
      creatorMemberId: qa.id,
    });
    service.claimTask("project-1", task.id, "member-reviewer");

    const agentManager = new FakeAgentManager();
    const lifecycle = createLifecycle(service, agentManager);
    await lifecycle.start({ projectId: "project-1", memberId: "member-reviewer" });

    const stopped = await lifecycle.stop({ projectId: "project-1", memberId: "member-reviewer" });

    expect(stopped).toBe(true);
    expect(agentManager.listAgents()).toHaveLength(0);
    expect(service.getTask("project-1", task.id)?.claimantMemberId).toBe("member-reviewer");
    expect(() => service.claimTask("project-1", task.id, qa.id)).toThrow(/Reviewer/);

    // Nothing was running the second time, and that is not an error.
    expect(await lifecycle.stop({ projectId: "project-1", memberId: "member-reviewer" })).toBe(
      false,
    );

    service.close();
  });

  test("a mention names the channel it came from, because team_post cannot be called without one", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "build" });

    const agentManager = new FakeAgentManager();
    const lifecycle = createLifecycle(service, agentManager);

    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: {
        ...buildMessage("Please review this change", ["member-reviewer"]),
        channelId: channel.id,
      },
    });

    // Without the channel name the member has to guess: no tool lists channels, and both team_post
    // and team_read require an exact name. Guessing throws, and a throw reads as a broken tool.
    const prompt = String(agentManager.promptCalls[0]?.prompt);
    expect(prompt).toContain(`team_post with channel "build"`);
    expect(prompt).toContain("Please review this change");

    service.close();
  });

  test("a mention for a channel that cannot be resolved still delivers the body", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const agentManager = new FakeAgentManager();
    const lifecycle = createLifecycle(service, agentManager);

    // buildMessage points at "channel-1", which was never created in this project.
    await lifecycle.deliverMentions({
      projectId: "project-1",
      message: buildMessage("Please review this change", ["member-reviewer"]),
    });

    const prompt = String(agentManager.promptCalls[0]?.prompt);
    expect(prompt).toContain("Please review this change");
    // Pins the fallback branch specifically: the body alone appears on both paths, so without
    // this the test passes even if the fallback is deleted.
    expect(prompt).not.toContain("mentioned you in");
    expect(prompt).not.toContain("team_post with channel");

    service.close();
  });

  function createLifecycle(service: TeamService, agentManager: FakeAgentManager): MemberLifecycle {
    return new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: "/repo",
      }),
      logger: createTestLogger(),
    });
  }

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "member-lifecycle-test-"));
    cleanupPaths.push(path);
    return path;
  }
});
