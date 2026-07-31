import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { composeMemberSystemPrompt, ensureMemberHome } from "./member-home.js";
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
  // SC-002 depends on this. Members run with the full Paseo tool catalogue, so a member told to
  // "hand this to QA" will reach for create_agent unless the prompt points it at the channel.
  // Observed for real in the T056 run: impl did the work, spawned two throwaway agents, and the
  // channel stayed empty.
  test("the member system prompt directs collaboration through the channel, not new agents", async () => {
    const paseoHome = await createPaseoHome();
    const memberHomeDir = ensureMemberHome(paseoHome, "member-1");

    const prompt = composeMemberSystemPrompt("You implement changes.", memberHomeDir);

    expect(prompt).toContain("You implement changes.");
    expect(prompt).toContain("team_post");
    expect(prompt).toContain("@name");
    expect(prompt).toMatch(/Do not create ad-hoc agents/i);
    // Runtimes namespace MCP tools differently; a member searching for the bare name may find
    // nothing and conclude the tools are missing.
    expect(prompt).toContain("mcp__paseo__team_post");
    expect(prompt).toContain("does not oblige you to reply");
    expect(prompt).toContain("do not call team_post unless");
    expect(prompt).toContain("silence is the correct outcome");
    expect(prompt).toContain("Judge each team-message wake from the newest message");
    expect(prompt).toContain("that request is exhausted");
    expect(prompt).toContain("MUST end the turn without calling team_post");
    expect(prompt).toContain("even when the message mentions you");
    expect(prompt).toContain("unless you are mentioned with a request for action");
    expect(prompt).toContain("Only the member who did the work reports its outcome");
    expect(prompt).toContain("Acknowledging, confirming, thanking");
    expect(prompt).toContain("Do not post idle narration");
    expect(prompt).toContain("do not echo it, confirm it, or close the conversation");
    expect(prompt).toContain("Silence about unreported completed work reads as no progress");
  });
});

function sequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
