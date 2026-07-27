import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TeamMember } from "@getpaseo/protocol/team/types";
import { createProjectStore } from "./storage/project-store.js";
import { createRosterStore, type RosterMember } from "./storage/roster-store.js";
import { createTeamDatabaseManager } from "./storage/database.js";

export interface CreateTeamMemberInput {
  projectId: string;
  name: string;
  description?: string;
  provider: string;
  model?: string;
  homeWorkspaceId: string;
}

export interface TeamServiceOptions {
  paseoHome: string;
  now?: () => Date;
  createId?: () => string;
}

export class TeamService {
  private readonly dbManager;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: TeamServiceOptions) {
    const teamDir = join(options.paseoHome, "team");
    mkdirSync(teamDir, { recursive: true });
    this.dbManager = createTeamDatabaseManager({ teamDir });
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.ensureHumanMember();
  }

  public close(): void {
    this.dbManager.closeAll();
  }

  public listMembers(projectId: string): TeamMember[] {
    const assignments = new Map(
      createProjectStore(this.dbManager.openProject(projectId))
        .listProjectMembers()
        .map((assignment) => [assignment.memberId, assignment]),
    );

    return createRosterStore(this.dbManager.openRoster())
      .listMembers()
      .filter((member) => member.archivedAt === null && assignments.has(member.id))
      .map((member) => toTeamMember(member, assignments.get(member.id)?.homeWorkspaceId ?? null));
  }

  public createMember(input: CreateTeamMemberInput): TeamMember {
    const memberId = this.createId();
    const createdAt = this.now().toISOString();
    const rosterStore = createRosterStore(this.dbManager.openRoster());

    rosterStore.createMember({
      id: memberId,
      name: input.name,
      description: input.description ?? null,
      provider: input.provider,
      model: input.model ?? null,
      modeId: null,
      rolePrompt: null,
      templateId: null,
      kind: "agent",
      createdAt,
      archivedAt: null,
    });

    createProjectStore(this.dbManager.openProject(input.projectId)).addProjectMember({
      memberId,
      homeWorkspaceId: input.homeWorkspaceId,
      joinedAt: createdAt,
    });

    const created = createRosterStore(this.dbManager.openRoster()).getMember(memberId);
    if (!created) {
      throw new Error(`Created member ${memberId} was not persisted`);
    }

    return toTeamMember(created, input.homeWorkspaceId);
  }

  public removeMember(projectId: string, memberId: string): string | null {
    const archivedAt = this.now().toISOString();
    const rosterStore = createRosterStore(this.dbManager.openRoster());
    rosterStore.archiveMember(memberId, archivedAt);
    createProjectStore(this.dbManager.openProject(projectId)).removeProjectMember(memberId);

    return rosterStore.getMember(memberId)?.archivedAt ? memberId : null;
  }

  private ensureHumanMember(): void {
    const rosterStore = createRosterStore(this.dbManager.openRoster());
    const hasHuman = rosterStore
      .listMembers()
      .some((member) => member.kind === "human" && member.archivedAt === null);
    if (hasHuman) {
      return;
    }

    rosterStore.createMember({
      id: this.createId(),
      name: "Human",
      description: "Escalation target",
      provider: "human",
      model: null,
      modeId: null,
      rolePrompt: null,
      templateId: null,
      kind: "human",
      createdAt: this.now().toISOString(),
      archivedAt: null,
    });
  }
}

function toTeamMember(member: RosterMember, homeWorkspaceId: string | null): TeamMember {
  return {
    id: member.id,
    name: member.name,
    description: member.description,
    provider: member.provider,
    model: member.model,
    modeId: member.modeId,
    ...(member.rolePrompt ? { rolePrompt: member.rolePrompt } : {}),
    templateId: member.templateId,
    kind: member.kind === "human" ? "human" : "agent",
    status: "idle",
    homeWorkspaceId,
    createdAt: member.createdAt,
    archivedAt: member.archivedAt,
  };
}
