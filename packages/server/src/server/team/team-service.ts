import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  TeamChannel,
  TeamHomeFileEntry,
  TeamMember,
  TeamMessage,
  TeamRoleTemplate,
} from "@getpaseo/protocol/team/types";
import {
  composeMemberSystemPrompt,
  ensureMemberHome,
  listMemberHomeFiles,
  readMemberHomeFile,
} from "./member-home.js";
import { listBuiltInRoleTemplates } from "./role-templates.js";
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
  modeId?: string | null;
  rolePrompt?: string;
  templateId?: string | null;
}

export interface TeamServiceOptions {
  paseoHome: string;
  now?: () => Date;
  createId?: () => string;
}

export interface CreateTeamChannelInput {
  projectId: string;
  name: string;
  purpose?: string;
}

export interface UpdateTeamChannelInput {
  projectId: string;
  channelId: string;
  name?: string;
  purpose?: string | null;
}

export interface PostTeamMessageInput {
  projectId: string;
  channelId: string;
  authorMemberId: string;
  body: string;
  replyToMessageId?: string;
  autoStarted?: boolean;
}

export interface ListTeamMessagesInput {
  projectId: string;
  channelId: string;
  before?: string;
  limit?: number;
}

export interface TeamMessagePage {
  messages: TeamMessage[];
  nextCursor: string | null;
}

export interface TeamMemberAssignment {
  memberId: string;
  homeWorkspaceId: string | null;
  joinedAt: string;
}

export interface UpdateTeamMemberInput {
  memberId: string;
  name?: string;
  description?: string | null;
  provider?: string;
  model?: string | null;
  modeId?: string | null;
  rolePrompt?: string;
  templateId?: string | null;
}

export interface AssignTeamMemberInput {
  projectId: string;
  memberId: string;
  homeWorkspaceId: string;
}

export interface TeamMemberHomeListing {
  memberId: string;
  path: string;
  entries: TeamHomeFileEntry[];
}

export interface TeamMemberHomeFile {
  memberId: string;
  path: string;
  content: string;
}

interface TeamMessagePostedEvent {
  type: "team.message.posted";
  projectId: string;
  message: TeamMessage;
}

export class TeamService {
  private readonly dbManager;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly listeners = new Set<(event: TeamMessagePostedEvent) => void>();
  private readonly paseoHome: string;

  constructor(options: TeamServiceOptions) {
    const teamDir = join(options.paseoHome, "team");
    mkdirSync(teamDir, { recursive: true });
    this.dbManager = createTeamDatabaseManager({ teamDir });
    this.paseoHome = options.paseoHome;
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
      .map((member) => {
        const assignment = assignments.get(member.id) ?? null;
        return toTeamMember(member, assignment?.homeWorkspaceId ?? null);
      });
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
      modeId: input.modeId ?? null,
      rolePrompt: input.rolePrompt ?? null,
      templateId: input.templateId ?? null,
      kind: "agent",
      createdAt,
      archivedAt: null,
    });
    ensureMemberHome(this.paseoHome, memberId);

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

  public updateMember(input: UpdateTeamMemberInput): TeamMember | null {
    const rosterStore = createRosterStore(this.dbManager.openRoster());
    rosterStore.updateMember({
      id: input.memberId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      modeId: input.modeId,
      rolePrompt: input.rolePrompt,
      templateId: input.templateId,
    });

    const updated = rosterStore.getMember(input.memberId);
    return updated ? toTeamMember(updated, null) : null;
  }

  public assignMember(input: AssignTeamMemberInput): TeamMember {
    const member = createRosterStore(this.dbManager.openRoster()).getMember(input.memberId);
    if (!member || member.archivedAt !== null) {
      throw new Error(`Member ${input.memberId} was not found.`);
    }

    this.assertHomeWorkspaceAvailable(input.projectId, input.memberId, input.homeWorkspaceId);

    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    const existing = projectStore.getProjectMember(input.memberId);
    projectStore.upsertProjectMember({
      memberId: input.memberId,
      homeWorkspaceId: input.homeWorkspaceId,
      joinedAt: existing?.joinedAt ?? this.now().toISOString(),
    });

    return toTeamMember(member, input.homeWorkspaceId);
  }

  public removeMember(projectId: string, memberId: string): string | null {
    const archivedAt = this.now().toISOString();
    const rosterStore = createRosterStore(this.dbManager.openRoster());
    rosterStore.archiveMember(memberId, archivedAt);
    createProjectStore(this.dbManager.openProject(projectId)).removeProjectMember(memberId);

    return rosterStore.getMember(memberId)?.archivedAt ? memberId : null;
  }

  public getHumanMember(): TeamMember {
    const human = createRosterStore(this.dbManager.openRoster())
      .listMembers()
      .find((member) => member.kind === "human" && member.archivedAt === null);
    if (!human) {
      throw new Error("Human member not found");
    }
    return toTeamMember(human, null);
  }

  public getMember(memberId: string): TeamMember | null {
    const member = createRosterStore(this.dbManager.openRoster()).getMember(memberId);
    if (!member || member.archivedAt !== null) {
      return null;
    }
    return toTeamMember(member, null);
  }

  public getProjectMemberAssignment(
    projectId: string,
    memberId: string,
  ): TeamMemberAssignment | null {
    const assignment = createProjectStore(this.dbManager.openProject(projectId)).getProjectMember(
      memberId,
    );
    return assignment
      ? {
          memberId: assignment.memberId,
          homeWorkspaceId: assignment.homeWorkspaceId,
          joinedAt: assignment.joinedAt,
        }
      : null;
  }

  public markMemberHomeWorkspaceUnavailable(input: {
    projectId: string;
    memberId: string;
    homeWorkspaceId: string;
  }): void {
    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    const existing = projectStore.getProjectMember(input.memberId);
    if (!existing || existing.homeWorkspaceId !== input.homeWorkspaceId) {
      return;
    }
    projectStore.upsertProjectMember({
      memberId: existing.memberId,
      homeWorkspaceId: null,
      joinedAt: existing.joinedAt,
    });
  }

  public getChannel(projectId: string, channelId: string): TeamChannel | null {
    const channel = createProjectStore(this.dbManager.openProject(projectId)).getChannel(channelId);
    return channel ? toTeamChannel(channel) : null;
  }

  public findChannel(projectId: string, identifier: string): TeamChannel | null {
    const projectStore = createProjectStore(this.dbManager.openProject(projectId));
    const channel =
      projectStore.getChannel(identifier) ?? projectStore.getChannelByName(identifier) ?? null;
    return channel ? toTeamChannel(channel) : null;
  }

  public getMemberDisplayName(memberId: string): string | null {
    const member = createRosterStore(this.dbManager.openRoster()).getMember(memberId);
    return member?.name ?? null;
  }

  public listRoleTemplates(): TeamRoleTemplate[] {
    return listBuiltInRoleTemplates();
  }

  public listMemberHomeFiles(memberId: string, path?: string): TeamMemberHomeListing {
    return listMemberHomeFiles(this.paseoHome, memberId, path);
  }

  public readMemberHomeFile(memberId: string, path: string): TeamMemberHomeFile {
    return readMemberHomeFile(this.paseoHome, memberId, path);
  }

  public getMemberSessionSystemPrompt(memberId: string): string {
    const member = createRosterStore(this.dbManager.openRoster()).getMember(memberId);
    if (!member || member.archivedAt !== null) {
      throw new Error(`Member ${memberId} not found`);
    }
    return composeMemberSystemPrompt(member.rolePrompt, this.getMemberHomeDir(memberId));
  }

  public getMemberHomeDir(memberId: string): string {
    return ensureMemberHome(this.paseoHome, memberId);
  }

  public proposeMembers(projectId: string): Array<{
    name: string;
    description: string;
    rolePrompt: string;
    templateId: string;
  }> {
    const assignedTemplateIds = new Set(
      this.listMembers(projectId)
        .map((member) => member.templateId)
        .filter((templateId): templateId is string => typeof templateId === "string"),
    );
    return this.listRoleTemplates()
      .filter((template) => !assignedTemplateIds.has(template.id))
      .map((template) => ({
        name: template.name.replace(/ Engineer$/, ""),
        description: template.description,
        rolePrompt: template.rolePrompt,
        templateId: template.id,
      }));
  }

  public listChannels(projectId: string): TeamChannel[] {
    return createProjectStore(this.dbManager.openProject(projectId))
      .listChannels()
      .map(toTeamChannel);
  }

  public createChannel(input: CreateTeamChannelInput): TeamChannel {
    const createdAt = this.now().toISOString();
    const channelId = this.createId();
    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    projectStore.createChannel({
      id: channelId,
      name: input.name,
      purpose: input.purpose ?? null,
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
    });
    const created = projectStore.getChannel(channelId);
    if (!created) {
      throw new Error(`Created channel ${channelId} was not persisted`);
    }
    return toTeamChannel(created);
  }

  public updateChannel(input: UpdateTeamChannelInput): TeamChannel | null {
    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    projectStore.updateChannel({
      channelId: input.channelId,
      name: input.name,
      purpose: input.purpose,
      updatedAt: this.now().toISOString(),
    });
    const updated = projectStore.getChannel(input.channelId);
    return updated ? toTeamChannel(updated) : null;
  }

  public deleteChannel(projectId: string, channelId: string): string | null {
    const projectStore = createProjectStore(this.dbManager.openProject(projectId));
    projectStore.deleteChannel(channelId);
    return projectStore.getChannel(channelId) ? null : channelId;
  }

  public postMessage(input: PostTeamMessageInput): TeamMessage {
    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    const mentionMemberIds = this.resolveMentionMemberIds(input.projectId, input.body);
    const messageId = this.createId();
    const createdAt = this.now().toISOString();

    projectStore.createMessage({
      id: messageId,
      channelId: input.channelId,
      authorMemberId: input.authorMemberId,
      body: input.body,
      replyToMessageId: input.replyToMessageId ?? null,
      createdAt,
      autoStarted: input.autoStarted ?? false,
    });
    for (const memberId of mentionMemberIds) {
      projectStore.addMessageMention(messageId, memberId);
    }

    const created = projectStore.getMessage(messageId);
    if (!created) {
      throw new Error(`Created message ${messageId} was not persisted`);
    }

    const message = toTeamMessage(created, mentionMemberIds);
    this.emit({
      type: "team.message.posted",
      projectId: input.projectId,
      message,
    });
    return message;
  }

  public listMessages(input: ListTeamMessagesInput): TeamMessagePage {
    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    const page = projectStore.listMessages({
      channelId: input.channelId,
      cursor: input.before ?? null,
      limit: input.limit ?? 50,
    });
    return {
      messages: page.messages.map((message) =>
        toTeamMessage(message, projectStore.listMessageMentionMemberIds(message.id)),
      ),
      nextCursor: page.nextCursor,
    };
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

  public subscribe(listener: (event: TeamMessagePostedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TeamMessagePostedEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private resolveMentionMemberIds(projectId: string, body: string): string[] {
    const mentionedNames = parseMentionNames(body);
    if (mentionedNames.length === 0) {
      return [];
    }

    const rosterStore = createRosterStore(this.dbManager.openRoster());
    const projectStore = createProjectStore(this.dbManager.openProject(projectId));
    const memberIds: string[] = [];

    for (const name of mentionedNames) {
      const member = rosterStore.getMemberByName(name);
      if (!member || member.archivedAt !== null) {
        throw new Error(`Mentioned member @${name} does not exist.`);
      }
      if (!projectStore.getProjectMember(member.id)) {
        throw new Error(`Mentioned member @${name} is not assigned to project ${projectId}.`);
      }
      memberIds.push(member.id);
    }

    return memberIds;
  }

  private assertHomeWorkspaceAvailable(
    projectId: string,
    memberId: string,
    homeWorkspaceId: string,
  ): void {
    const conflictingAssignment = createProjectStore(
      this.dbManager.openProject(projectId),
    ).getProjectMemberByHomeWorkspaceId(homeWorkspaceId);
    if (!conflictingAssignment || conflictingAssignment.memberId === memberId) {
      return;
    }
    const conflictingMember = createRosterStore(this.dbManager.openRoster()).getMember(
      conflictingAssignment.memberId,
    );
    throw new Error(
      `Home workspace ${homeWorkspaceId} is already assigned to ${conflictingMember?.name ?? conflictingAssignment.memberId}.`,
    );
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
    status: homeWorkspaceId === null && member.kind !== "human" ? "unavailable" : "idle",
    homeWorkspaceId,
    createdAt: member.createdAt,
    archivedAt: member.archivedAt,
  };
}

function toTeamChannel(channel: {
  id: string;
  name: string;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}): TeamChannel {
  return {
    id: channel.id,
    name: channel.name,
    purpose: channel.purpose,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    archivedAt: channel.archivedAt,
  };
}

function toTeamMessage(
  message: {
    id: string;
    channelId: string;
    authorMemberId: string;
    body: string;
    replyToMessageId: string | null;
    createdAt: string;
    autoStarted: boolean;
  },
  mentionMemberIds: string[],
): TeamMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    authorMemberId: message.authorMemberId,
    body: message.body,
    replyToMessageId: message.replyToMessageId,
    mentionMemberIds,
    createdAt: message.createdAt,
    autoStarted: message.autoStarted,
  };
}

function parseMentionNames(body: string): string[] {
  const matches = body.matchAll(/(^|\s)@([A-Za-z0-9_-]+)/g);
  const names = new Set<string>();
  for (const match of matches) {
    const name = match[2]?.trim();
    if (name) {
      names.add(name);
    }
  }
  return Array.from(names);
}
