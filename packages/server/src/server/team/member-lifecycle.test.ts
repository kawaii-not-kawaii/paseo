import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { isAutoStartedTeamAgent, MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import {
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

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "member-lifecycle-test-"));
    cleanupPaths.push(path);
    return path;
  }
});
