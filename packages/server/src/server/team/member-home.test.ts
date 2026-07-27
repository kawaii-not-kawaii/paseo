import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { TeamService } from "./team-service.js";

describe("member home", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("creating a member creates a seeded home directory", async () => {
    const paseoHome = await createPaseoHome();
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
      rolePrompt: "Review carefully before approving.",
    });

    const listing = await service.listMemberHomeFiles(member.id);
    expect(listing.path).toBe(".");
    expect(listing.entries).toEqual([
      { kind: "directory", name: "artifacts", path: "artifacts" },
      { kind: "file", name: "MEMORY.md", path: "MEMORY.md" },
      { kind: "directory", name: "notes", path: "notes" },
    ]);

    const memory = await service.readMemberHomeFile(member.id, "MEMORY.md");
    expect(memory.content).toContain("# MEMORY");

    service.close();
  });

  test("member home directory and MEMORY.md stay byte-identical after workspace loss and re-pointing", async () => {
    const paseoHome = await createPaseoHome();
    const oldWorkspace = await mkdtemp(join(tmpdir(), "member-home-old-workspace-"));
    const newWorkspace = await mkdtemp(join(tmpdir(), "member-home-new-workspace-"));
    cleanupPaths.push(oldWorkspace, newWorkspace);
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-old",
      rolePrompt: "Review carefully before approving.",
    });

    await writeFile(join(paseoHome, "team", "members", member.id, "MEMORY.md"), "learned\n");
    await writeFile(
      join(paseoHome, "team", "members", member.id, "notes", "carry.md"),
      "keep me\n",
    );

    const beforeMemory = await readFile(join(paseoHome, "team", "members", member.id, "MEMORY.md"));
    const beforeNote = await readFile(
      join(paseoHome, "team", "members", member.id, "notes", "carry.md"),
    );

    await rm(oldWorkspace, { recursive: true, force: true });
    service.markMemberHomeWorkspaceUnavailable({
      projectId: "project-1",
      memberId: member.id,
      homeWorkspaceId: "workspace-old",
    });
    service.assignMember({
      projectId: "project-1",
      memberId: member.id,
      homeWorkspaceId: "workspace-new",
    });

    const afterMemory = await readFile(join(paseoHome, "team", "members", member.id, "MEMORY.md"));
    const afterNote = await readFile(
      join(paseoHome, "team", "members", member.id, "notes", "carry.md"),
    );

    expect(afterMemory.equals(beforeMemory)).toBe(true);
    expect(afterNote.equals(beforeNote)).toBe(true);

    service.close();
  });

  test("list_home_files and read_home_file stay inside the member home directory", async () => {
    const paseoHome = await createPaseoHome();
    const outsideDir = await mkdtemp(join(tmpdir(), "member-home-outside-"));
    cleanupPaths.push(outsideDir);
    const service = new TeamService({
      paseoHome,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human", "member-reviewer"),
    });

    const member = service.createMember({
      projectId: "project-1",
      name: "Reviewer",
      description: "Checks diffs",
      provider: "codex",
      model: "gpt-5",
      homeWorkspaceId: "workspace-reviewer",
      rolePrompt: "Review carefully before approving.",
    });

    await writeFile(join(outsideDir, "secret.txt"), "outside\n");
    await symlink(outsideDir, join(paseoHome, "team", "members", member.id, "notes", "escape"));

    expect(() => service.readMemberHomeFile(member.id, "notes/escape/secret.txt")).toThrowError(
      "Resolved path escapes member home directory.",
    );
    expect(() => service.listMemberHomeFiles(member.id, "notes/escape")).toThrowError(
      "Resolved path escapes member home directory.",
    );

    service.close();
  });

  async function createPaseoHome(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "member-home-test-"));
    cleanupPaths.push(path);
    return path;
  }
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
