import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTeamDatabaseManager } from "./storage/database.js";
import { createProjectStore } from "./storage/project-store.js";
import { TeamService } from "./team-service.js";

describe("team tasks and settings", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("task CRUD supports dependencies, notes, acceptance criteria, and per-project seq numbers", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: sequenceTimes(
        "2026-07-27T12:00:00.000Z",
        "2026-07-27T12:00:01.000Z",
        "2026-07-27T12:00:02.000Z",
        "2026-07-27T12:00:03.000Z",
        "2026-07-27T12:00:04.000Z",
      ),
      createId: sequenceIds("member-human", "member-impl", "task-1", "task-2", "note-1"),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const first = service.createTask({
      projectId: "project-1",
      title: "First",
      creatorMemberId: impl.id,
    });
    const second = service.createTask({
      projectId: "project-1",
      title: "Second",
      body: "Details",
      creatorMemberId: impl.id,
      assigneeMemberId: impl.id,
      dependsOnTaskIds: [first.id],
      acceptanceCriteria: [
        { position: 0, text: "criterion 0", satisfiedAt: null },
        { position: 1, text: "criterion 1", satisfiedAt: null },
      ],
    });

    service.updateTask({
      projectId: "project-1",
      taskId: first.id,
      status: "done",
      bypassClaim: true,
    });
    service.claimTask("project-1", second.id, impl.id);
    service.addTaskNote("project-1", second.id, impl.id, "working");
    service.satisfyTaskCriterion("project-1", second.id, 0, impl.id);

    const loaded = service.getTask("project-1", second.id);
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(loaded).toMatchObject({
      id: second.id,
      body: "Details",
      assigneeMemberId: impl.id,
      dependsOnTaskIds: [first.id],
      acceptanceCriteria: [
        { position: 0, text: "criterion 0", satisfiedAt: "2026-07-27T12:00:04.000Z" },
        { position: 1, text: "criterion 1", satisfiedAt: null },
      ],
    });
    expect(loaded?.notes).toEqual([
      expect.objectContaining({
        taskId: second.id,
        authorMemberId: impl.id,
        body: "working",
      }),
    ]);

    service.close();
  });

  test("writes progress events for claim, release, status change, note, and satisfied criterion", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: sequenceTimes(
        "2026-07-27T12:00:00.000Z",
        "2026-07-27T12:00:01.000Z",
        "2026-07-27T12:00:02.000Z",
        "2026-07-27T12:00:03.000Z",
        "2026-07-27T12:00:04.000Z",
        "2026-07-27T12:00:05.000Z",
      ),
      createId: sequenceIds("member-human", "member-impl", "task-1", "note-1"),
    });
    const impl = service.createMember({
      projectId: "project-1",
      name: "Impl",
      provider: "codex",
      homeWorkspaceId: "workspace-impl",
    });
    const task = service.createTask({
      projectId: "project-1",
      title: "Progressful",
      creatorMemberId: impl.id,
      acceptanceCriteria: [{ position: 0, text: "criterion", satisfiedAt: null }],
    });

    service.claimTask("project-1", task.id, impl.id);
    service.updateTask({
      projectId: "project-1",
      taskId: task.id,
      status: "in_review",
      actorMemberId: impl.id,
    });
    service.addTaskNote("project-1", task.id, impl.id, "noted");
    service.satisfyTaskCriterion("project-1", task.id, 0, impl.id);
    service.releaseTask("project-1", task.id, impl.id);

    const store = createProjectStore(
      createTeamDatabaseManager({ teamDir: join(paseoHome, "team") }).openProject("project-1"),
    );
    expect(store.listProgressEvents(task.id).map((event) => event.kind)).toEqual([
      "claimed",
      "status_changed",
      "noted",
      "criterion_satisfied",
      "released",
    ]);

    service.close();
  });

  test("project settings default to the research values and invalid updates are refused without persisting", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({ paseoHome });

    expect(service.getProjectSettings("project-1")).toEqual({
      messageRetentionCap: 50_000,
      handbackLimit: 3,
      attemptTimeoutMs: 1_800_000,
      noProgressLimit: 12,
      autoStartEnabled: true,
    });

    await expect(() =>
      service.updateProjectSettings("project-1", {
        messageRetentionCap: 0,
        handbackLimit: 3,
        attemptTimeoutMs: 1_800_000,
        noProgressLimit: 12,
        autoStartEnabled: true,
      }),
    ).toThrowError("messageRetentionCap must be at least 1.");

    await expect(() =>
      service.updateProjectSettings("project-1", {
        messageRetentionCap: 50_000,
        handbackLimit: 3,
        attemptTimeoutMs: -1,
        noProgressLimit: 12,
        autoStartEnabled: true,
      }),
    ).toThrowError("attemptTimeoutMs must be at least 1 millisecond.");

    expect(service.getProjectSettings("project-1")).toEqual({
      messageRetentionCap: 50_000,
      handbackLimit: 3,
      attemptTimeoutMs: 1_800_000,
      noProgressLimit: 12,
      autoStartEnabled: true,
    });

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-tasks-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function sequenceTimes(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[index++] ?? timestamps[timestamps.length - 1]!);
}
