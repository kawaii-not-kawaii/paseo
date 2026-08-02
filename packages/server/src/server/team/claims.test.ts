import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import {
  createWorkspaceRegistryStub,
  FakeAgentManager as ReapableAgentManager,
} from "./test-support/team-test-fakes.js";

describe("team claims", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("two concurrent claims on one task let exactly one member win and tell the loser who holds it", async () => {
    const paseoHome = await createPaseoHome();
    const clock = createMutableClock("2026-07-27T12:00:00.000Z");
    const setup = new TeamService({
      paseoHome,
      now: clock.now,
      createId: sequenceIds("member-human", "member-reviewer", "member-qa", "task-contended"),
    });
    const reviewer = setup.createMember({
      projectId: "project-1",
      name: "Reviewer",
      provider: "codex",
      homeWorkspaceId: "workspace-reviewer",
    });
    const qa = setup.createMember({
      projectId: "project-1",
      name: "QA",
      provider: "codex",
      homeWorkspaceId: "workspace-qa",
    });
    const task = setup.createTask({
      projectId: "project-1",
      title: "Contended",
      creatorMemberId: reviewer.id,
    });
    setup.close();

    const left = new TeamService({ paseoHome, now: clock.now });
    const right = new TeamService({ paseoHome, now: clock.now });

    const results = await Promise.allSettled([
      Promise.resolve().then(() => left.claimTask("project-1", task.id, reviewer.id)),
      Promise.resolve().then(() => right.claimTask("project-1", task.id, qa.id)),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<ReturnType<TeamService["claimTask"]>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner = fulfilled[0]!.value;
    const loserMessage = String(rejected[0]!.reason);
    const holderName = winner.claimantMemberId === reviewer.id ? "Reviewer" : "QA";
    expect(loserMessage).toContain(`currently claimed by ${holderName}`);

    const finalTask = left.getTask("project-1", task.id);
    expect(finalTask?.claimantMemberId).toBe(winner.claimantMemberId);

    left.close();
    right.close();
  });

  test("a claim survives the idle reaper window and remains unexpired", async () => {
    const paseoHome = await createPaseoHome();
    const clock = createMutableClock("2026-07-27T12:00:00.000Z");
    const service = new TeamService({
      paseoHome,
      now: clock.now,
      createId: sequenceIds("member-human", "member-reviewer", "task-1"),
    });
    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      provider: "codex",
      homeWorkspaceId: "workspace-reviewer",
    });
    const task = service.createTask({
      projectId: "project-1",
      title: "Claim stays leased",
      creatorMemberId: reviewer.id,
    });

    service.claimTask("project-1", task.id, reviewer.id);

    clock.set("2026-07-27T12:03:00.000Z");

    const afterReaperWindow = service.getTask("project-1", task.id);
    expect(afterReaperWindow?.claimantMemberId).toBe(reviewer.id);
    expect(Date.parse(afterReaperWindow?.claimExpiresAt ?? "")).toBeGreaterThan(
      Date.parse("2026-07-27T12:03:00.000Z"),
    );

    service.close();
  });

  // The other half of research R1: it is not enough that time passes. The runtime must actually
  // be collected — that is what the idle reaper does — and the claim must still hold afterwards.
  // Without this, someone could later wire claim release into agent stop and the clock-only test
  // above would still pass, while members silently stole each other's in-progress work.
  test("a claim survives its holder's runtime being collected, and no other member can take it", async () => {
    const paseoHome = await createPaseoHome();
    const clock = createMutableClock("2026-07-27T12:00:00.000Z");
    const service = new TeamService({
      paseoHome,
      now: clock.now,
      createId: sequenceIds("member-human", "member-reviewer", "member-qa", "task-1"),
    });
    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      provider: "codex",
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
      title: "Claim outlives the runtime",
      creatorMemberId: reviewer.id,
    });

    const agentManager = new ReapableAgentManager();
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

    await lifecycle.deliverMention({
      projectId: "project-1",
      memberId: reviewer.id,
      prompt: "Take this task",
    });
    service.claimTask("project-1", task.id, reviewer.id);
    expect(agentManager.listAgents()).toHaveLength(1);

    // The idle reaper collects the runtime after IDLE_AGENT_RUNTIME_TTL_MS.
    agentManager.reapIdleRuntimes();
    clock.set("2026-07-27T12:03:00.000Z");

    expect(agentManager.listAgents()).toHaveLength(0);

    const afterReap = service.getTask("project-1", task.id);
    expect(afterReap?.claimantMemberId).toBe(reviewer.id);
    expect(Date.parse(afterReap?.claimExpiresAt ?? "")).toBeGreaterThan(
      Date.parse("2026-07-27T12:03:00.000Z"),
    );

    // The work is in progress, not abandoned: nobody else may take it.
    expect(() => service.claimTask("project-1", task.id, qa.id)).toThrow(/Reviewer/);

    service.close();
  });

  test("unmet dependencies block claims and name the blockers", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "task-1", "task-2"),
    });
    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      provider: "codex",
      homeWorkspaceId: "workspace-reviewer",
    });
    const blocker = service.createTask({
      projectId: "project-1",
      title: "Blocker",
      creatorMemberId: reviewer.id,
    });
    const blocked = service.createTask({
      projectId: "project-1",
      title: "Blocked",
      creatorMemberId: reviewer.id,
      dependsOnTaskIds: [blocker.id],
    });

    await expect(() => service.claimTask("project-1", blocked.id, reviewer.id)).toThrowError(
      `Task #${blocked.seq} is blocked by #${blocker.seq}. Finish those dependencies before claiming it.`,
    );

    service.close();
  });

  test("only the claimant may mutate a task, and the user can override the claim", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "member-qa", "task-1", "note-1"),
    });
    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      provider: "codex",
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
      title: "Guarded",
      creatorMemberId: reviewer.id,
    });

    service.claimTask("project-1", task.id, reviewer.id);

    await expect(() =>
      service.updateTask({
        projectId: "project-1",
        taskId: task.id,
        title: "QA edit",
        actorMemberId: qa.id,
      }),
    ).toThrowError(`Task #${task.seq} is claimed by Reviewer.`);

    await expect(() =>
      service.addTaskNote("project-1", task.id, qa.id, "I should not be able to write this."),
    ).toThrowError(`Task #${task.seq} is claimed by Reviewer.`);

    const userOverride = service.overrideTaskClaim("project-1", task.id, qa.id);
    expect(userOverride.claimantMemberId).toBe(qa.id);

    const updated = service.updateTask({
      projectId: "project-1",
      taskId: task.id,
      title: "QA edit",
      actorMemberId: qa.id,
    });
    expect(updated.title).toBe("QA edit");

    service.close();
  });

  test("claims release when the holder is removed or loses its home workspace", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds(
        "member-human",
        "member-reviewer",
        "member-qa",
        "task-remove",
        "task-workspace",
      ),
    });
    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      provider: "codex",
      homeWorkspaceId: "workspace-reviewer",
    });
    const qa = service.createMember({
      projectId: "project-1",
      name: "QA",
      provider: "codex",
      homeWorkspaceId: "workspace-qa",
    });
    const removeTask = service.createTask({
      projectId: "project-1",
      title: "Released on remove",
      creatorMemberId: qa.id,
    });
    const workspaceTask = service.createTask({
      projectId: "project-1",
      title: "Released on workspace loss",
      creatorMemberId: qa.id,
    });

    service.claimTask("project-1", removeTask.id, reviewer.id);
    service.claimTask("project-1", workspaceTask.id, reviewer.id);

    service.removeMember("project-1", reviewer.id);
    expect(service.getTask("project-1", removeTask.id)?.claimantMemberId).toBeNull();

    const reassignedReviewer = service.createMember({
      projectId: "project-1",
      name: "ReviewerTwo",
      provider: "codex",
      homeWorkspaceId: "workspace-reviewer-two",
    });
    const anotherTask = service.createTask({
      projectId: "project-1",
      title: "Released on workspace loss again",
      creatorMemberId: qa.id,
    });
    service.claimTask("project-1", anotherTask.id, reassignedReviewer.id);
    service.markMemberHomeWorkspaceUnavailable({
      projectId: "project-1",
      memberId: reassignedReviewer.id,
      homeWorkspaceId: "workspace-reviewer-two",
    });
    expect(service.getTask("project-1", anotherTask.id)?.claimantMemberId).toBeNull();
    expect(service.getTask("project-1", workspaceTask.id)?.claimantMemberId).toBeNull();

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-claims-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function createMutableClock(initial: string): { now: () => Date; set: (next: string) => void } {
  let current = initial;
  return {
    now: () => new Date(current),
    set: (next) => {
      current = next;
    },
  };
}
