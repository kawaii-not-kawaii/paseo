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
