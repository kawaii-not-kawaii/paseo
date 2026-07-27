/* eslint-disable unicorn/require-post-message-target-origin */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { TeamService, type TeamServiceEvent } from "./team-service.js";

describe("team review cycle", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("handback increments the count, releases the claim, and acceptance resets it", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-impl", "task-1"),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const task = service.createTask({
      projectId: "project-1",
      title: "Needs review",
      creatorMemberId: impl.id,
    });

    service.claimTask("project-1", task.id, impl.id);
    const handedBack = service.handbackTask("project-1", task.id, impl.id);
    expect(handedBack.handbackCount).toBe(1);
    expect(handedBack.claimantMemberId).toBeNull();
    expect(handedBack.status).toBe("in_progress");

    service.claimTask("project-1", task.id, impl.id);
    const accepted = service.acceptTask("project-1", task.id, impl.id);
    expect(accepted.handbackCount).toBe(0);
    expect(accepted.status).toBe("done");
    expect(accepted.claimantMemberId).toBeNull();

    service.close();
  });

  test("a converging review loop is never interrupted regardless of round count while progress keeps happening", async () => {
    const paseoHome = await createPaseoHome();
    const clock = createMutableClock("2026-07-27T12:00:00.000Z");
    const service = new TeamService({
      paseoHome,
      now: clock.now,
      createId: sequenceIds("member-human", "member-impl", "task-1", "note-1", "note-2", "note-3"),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    service.updateProjectSettings("project-1", {
      ...service.getProjectSettings("project-1"),
      handbackLimit: 99,
      noProgressLimit: 99,
    });
    const events: TeamServiceEvent[] = [];
    service.subscribe((event) => events.push(event));

    const task = service.createTask({
      projectId: "project-1",
      title: "Converges slowly",
      creatorMemberId: impl.id,
    });

    for (let round = 0; round < 25; round += 1) {
      clock.set(new Date(Date.parse("2026-07-27T12:00:00.000Z") + round * 60_000).toISOString());
      service.claimTask("project-1", task.id, impl.id);
      service.addTaskNote("project-1", task.id, impl.id, `progress ${round}`);
      service.handbackTask("project-1", task.id, impl.id);
    }

    service.claimTask("project-1", task.id, impl.id);
    const accepted = service.acceptTask("project-1", task.id, impl.id);

    expect(accepted.status).toBe("done");
    expect(accepted.escalatedAt).toBeNull();
    expect(events.filter((event) => event.type === "team.project.stopped")).toEqual([]);

    service.close();
  });

  test("a non-converging task escalates after the handback limit and stops only that task", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-impl", "member-qa", "task-a", "task-b"),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const qa = service.createMember({
      projectId: "project-1",
      name: "QA",
      provider: "codex",
      homeWorkspaceId: "workspace-qa",
    });
    const failing = service.createTask({
      projectId: "project-1",
      title: "Never passes",
      creatorMemberId: impl.id,
    });
    const healthy = service.createTask({
      projectId: "project-1",
      title: "Keeps moving",
      creatorMemberId: qa.id,
    });
    const events: TeamServiceEvent[] = [];
    service.subscribe((event) => events.push(event));

    for (let round = 0; round < service.getProjectSettings("project-1").handbackLimit; round += 1) {
      service.claimTask("project-1", failing.id, impl.id);
      service.handbackTask("project-1", failing.id, impl.id);
    }

    service.claimTask("project-1", healthy.id, qa.id);
    const healthyUpdate = service.updateTask({
      projectId: "project-1",
      taskId: healthy.id,
      status: "in_review",
      actorMemberId: qa.id,
    });
    const escalated = service.getTask("project-1", failing.id);

    expect(escalated?.escalatedAt).not.toBeNull();
    expect(escalated?.claimantMemberId).toBeNull();
    expect(healthyUpdate.status).toBe("in_review");
    expect(
      events.some(
        (event) => event.type === "team.project.stopped" && event.task?.id === failing.id,
      ),
    ).toBe(true);

    service.close();
  });

  test("the per-attempt wall clock escalates a member wedged inside one attempt", async () => {
    const paseoHome = await createPaseoHome();
    const clock = createMutableClock("2026-07-27T12:00:00.000Z");
    const service = new TeamService({
      paseoHome,
      now: clock.now,
      createId: sequenceIds("member-human", "member-impl", "task-1"),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const task = service.createTask({
      projectId: "project-1",
      title: "Wedged attempt",
      creatorMemberId: impl.id,
    });

    service.claimTask("project-1", task.id, impl.id);
    clock.set("2026-07-27T12:31:00.000Z");

    const timedOut = service.checkTaskAttemptTimeouts("project-1");
    expect(timedOut).toHaveLength(1);
    expect(timedOut[0]?.id).toBe(task.id);
    expect(timedOut[0]?.escalatedAt).not.toBeNull();
    expect(timedOut[0]?.claimantMemberId).toBeNull();

    service.close();
  });

  test("the no-progress backstop stops automatic turns, and any progress event or user message resets it", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds(
        "member-human",
        "member-impl",
        "channel-build",
        "task-1",
        "message-1",
        "message-2",
        "message-3",
        "message-4",
        "message-5",
      ),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "build" });
    const task = service.createTask({
      projectId: "project-1",
      title: "Resets counter",
      creatorMemberId: impl.id,
    });
    const human = service.getHumanMember();
    service.updateProjectSettings("project-1", {
      ...service.getProjectSettings("project-1"),
      noProgressLimit: 3,
    });

    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 1",
      autoStarted: true,
    });
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 2",
      autoStarted: true,
    });
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: human.id,
      body: "human reset",
    });
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 3",
      autoStarted: true,
    });
    service.claimTask("project-1", task.id, impl.id);
    service.releaseTask("project-1", task.id, impl.id);
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 4",
      autoStarted: true,
    });
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 5",
      autoStarted: true,
    });
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 6",
      autoStarted: true,
    });

    await expect(() => service.claimTask("project-1", task.id, impl.id)).toThrowError(
      "Stopped after 3 consecutive automatic turns without progress.",
    );

    service.close();
  });

  test("escalation is delivered through the project notification path, and stop_all/resume reset counters", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds(
        "member-human",
        "member-impl",
        "channel-build",
        "task-1",
        "message-1",
        "message-2",
      ),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "build" });
    const task = service.createTask({
      projectId: "project-1",
      title: "Escalates loudly",
      creatorMemberId: impl.id,
    });
    service.updateProjectSettings("project-1", {
      ...service.getProjectSettings("project-1"),
      handbackLimit: 1,
      noProgressLimit: 2,
    });
    const events: TeamServiceEvent[] = [];
    service.subscribe((event) => events.push(event));

    service.claimTask("project-1", task.id, impl.id);
    service.handbackTask("project-1", task.id, impl.id);
    expect(
      events.some((event) => event.type === "team.project.stopped" && event.task?.id === task.id),
    ).toBe(true);

    service.stopProject("project-1");
    await expect(() =>
      service.postMessage({
        projectId: "project-1",
        channelId: channel.id,
        authorMemberId: impl.id,
        body: "auto 1",
        autoStarted: true,
      }),
    ).not.toThrow();
    await expect(() => service.claimTask("project-1", task.id, impl.id)).toThrowError(
      "Stopped by the user. Resume when you want members to continue.",
    );

    service.resumeProject("project-1", task.id);
    service.postMessage({
      projectId: "project-1",
      channelId: channel.id,
      authorMemberId: impl.id,
      body: "auto 1",
      autoStarted: true,
    });
    service.claimTask("project-1", task.id, impl.id);

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-review-cycle-test-"));
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
