import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { TeamService } from "./team-service.js";

describe("TeamService", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("member survives a service restart with configuration intact", async () => {
    const paseoHome = await createPaseoHome();
    const projectId = "project-1";

    const firstService = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-agent", "member-human"),
    });

    const created = firstService.createMember({
      projectId,
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-1",
    });

    firstService.close();

    const restartedService = new TeamService({ paseoHome });
    const members = restartedService.listMembers(projectId);
    restartedService.close();

    expect(members).toEqual([
      {
        ...created,
        status: "idle",
      },
    ]);
  });

  test("lists built-in role templates as data", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({ paseoHome });

    expect(service.listRoleTemplates()).toEqual([
      expect.objectContaining({ id: "lead", name: "Lead Engineer" }),
      expect.objectContaining({ id: "ui", name: "UI Engineer" }),
      expect.objectContaining({ id: "qa", name: "QA Engineer" }),
      expect.objectContaining({ id: "release", name: "Release Engineer" }),
      expect.objectContaining({ id: "docs", name: "Docs Engineer" }),
    ]);

    service.close();
  });

  test("surfaces the home workspace uniqueness conflict as a usable error", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer", "member-qa"),
    });
    const reviewer = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-shared",
      rolePrompt: "Review carefully before approving.",
    });
    const qa = service.createMember({
      projectId: "project-1",
      name: "QA",
      description: "Breaks things",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-qa",
      rolePrompt: "Test behavior thoroughly.",
    });

    await expect(() =>
      service.assignMember({
        projectId: "project-1",
        memberId: qa.id,
        homeWorkspaceId: reviewer.homeWorkspaceId ?? "workspace-shared",
      }),
    ).toThrowError("Home workspace workspace-shared is already assigned to Reviewer.");

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "team-service-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
