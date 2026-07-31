import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  TeamChannel,
  TeamHomeFileEntry,
  TeamMember,
  TeamMessage,
  TeamProjectMaintenance,
  TeamProjectSettings,
  TeamRoleTemplate,
  TeamTask,
  TeamTaskAcceptanceCriterion,
  TeamTaskNote,
} from "@getpaseo/protocol/team/types";
import { Claims } from "./claims.js";
import {
  composeMemberSystemPrompt,
  ensureMemberHome,
  listMemberHomeFiles,
  readMemberHomeFile,
} from "./member-home.js";
import {
  adoptLegacyChatIntoProject,
  getLegacyChatAdoptionState,
  type LegacyChatAdoptionState,
} from "./adoption.js";
import { applyTeamMessageRetention } from "./retention.js";
import { ReviewCycle } from "./review-cycle.js";
import { listBuiltInRoleTemplates } from "./role-templates.js";
import { createTeamBackupManager, TEAM_BACKUP_INTERVAL_MS } from "./storage/backup.js";
import {
  createProjectStore,
  type ProjectSettings,
  type ProjectRetentionStatus,
  type ProjectTask,
} from "./storage/project-store.js";
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

export interface CreateTeamTaskInput {
  projectId: string;
  title: string;
  body?: string | null;
  creatorMemberId: string;
  assigneeMemberId?: string | null;
  dependsOnTaskIds?: string[];
  acceptanceCriteria?: TeamTaskAcceptanceCriterion[];
}

export interface UpdateTeamTaskInput {
  projectId: string;
  taskId: string;
  title?: string;
  body?: string | null;
  status?: TeamTask["status"];
  assigneeMemberId?: string | null;
  dependsOnTaskIds?: string[];
  acceptanceCriteria?: TeamTaskAcceptanceCriterion[];
  actorMemberId?: string;
  bypassClaim?: boolean;
}

export interface ListTeamTasksInput {
  projectId: string;
  status?: TeamTask["status"];
  assigneeMemberId?: string;
  creatorMemberId?: string;
  claimantMemberId?: string;
  claimable?: boolean;
}

export type TeamServiceEvent =
  | { type: "team.message.posted"; projectId: string; message: TeamMessage }
  | { type: "team.task.changed"; projectId: string; task: TeamTask }
  | { type: "team.member.changed"; projectId: string; member: TeamMember }
  | { type: "team.project.stopped"; projectId: string; task: TeamTask | null; reason: string };

export class TeamService {
  private readonly dbManager;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly listeners = new Set<(event: TeamServiceEvent) => void>();
  private readonly paseoHome: string;
  private readonly claims: Claims;
  private readonly reviewCycle: ReviewCycle;
  private readonly backupManager;
  private readonly projectOpenFailures = new Map<string, string>();
  private backupTimer: NodeJS.Timeout | null = null;

  constructor(options: TeamServiceOptions) {
    const teamDir = join(options.paseoHome, "team");
    mkdirSync(teamDir, { recursive: true });
    this.dbManager = createTeamDatabaseManager({ teamDir });
    this.paseoHome = options.paseoHome;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.backupManager = createTeamBackupManager({ teamDir, now: this.now });
    this.claims = new Claims({
      now: this.now,
      openProject: (projectId) => this.dbManager.openProject(projectId),
      openRoster: () => this.dbManager.openRoster(),
      onProgress: ({ projectId, taskId, memberId, kind }) => {
        createProjectStore(this.dbManager.openProject(projectId)).addProgressEvent({
          taskId,
          memberId,
          kind,
          createdAt: this.now().toISOString(),
        });
        this.reviewCycle.recordProgress(projectId);
      },
    });
    this.reviewCycle = new ReviewCycle({
      now: this.now,
      openProject: (projectId) => this.dbManager.openProject(projectId),
      onProjectStopped: ({ projectId, task, reason }) => {
        this.emit({
          type: "team.project.stopped",
          projectId,
          task: task ? toTeamTask(task) : null,
          reason,
        });
        if (task) {
          this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
        }
      },
    });
    this.ensureHumanMemberSafe();
    this.runStartupMaintenance();
  }

  public close(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
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
      .filter(
        (member) =>
          member.archivedAt === null &&
          // The human is never assigned to a project — it is the single daemon-wide identity — but
          // it authors messages and is the escalation target, so every project roster includes it.
          // Without this the app resolves the author of your own messages to a raw id, and there is
          // nothing to mention when a task escalates (FR-006a, FR-035e).
          (member.kind === "human" || assignments.has(member.id)),
      )
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
    this.claims.releaseForMember(projectId, memberId);

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
    this.claims.releaseForMember(input.projectId, input.memberId);
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

  public listChannels(projectId: string, identityId?: string): TeamChannel[] {
    const store = createProjectStore(this.dbManager.openProject(projectId));
    const unreadCounts = identityId ? store.listChannelUnreadCounts(identityId) : null;
    return store
      .listChannels()
      .map((channel) => toTeamChannel(channel, unreadCounts?.get(channel.id)));
  }

  public markChannelRead(projectId: string, channelId: string, identityId: string): string {
    const store = createProjectStore(this.dbManager.openProject(projectId));
    if (!store.getChannel(channelId)) {
      throw new Error(`Channel ${channelId} was not found.`);
    }
    store.markChannelRead(channelId, identityId, this.now().toISOString());
    return channelId;
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

    if (input.authorMemberId === this.getHumanMember().id) {
      this.reviewCycle.recordUserMessage(input.projectId);
    } else if (input.autoStarted) {
      this.reviewCycle.recordAutomaticTurn(input.projectId);
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

  public getProjectSettings(projectId: string): TeamProjectSettings {
    return toTeamProjectSettings(
      createProjectStore(this.dbManager.openProject(projectId)).getProjectSettings(),
    );
  }

  public async getProjectSettingsState(projectId: string): Promise<{
    settings: TeamProjectSettings | null;
    maintenance: TeamProjectMaintenance;
  }> {
    let settings: TeamProjectSettings | null = null;
    let retention: ProjectRetentionStatus = {
      lastPrunedMessageCount: 0,
      lastPrunedAt: null,
    };

    try {
      const store = createProjectStore(this.dbManager.openProject(projectId));
      settings = toTeamProjectSettings(store.getProjectSettings());
      retention = store.getRetentionStatus();
      this.projectOpenFailures.delete(projectId);
    } catch (error) {
      this.projectOpenFailures.set(
        projectId,
        error instanceof Error ? error.message : String(error),
      );
    }

    const latestSnapshot = await this.backupManager.getLatestSnapshot(projectId);
    const failure = this.projectOpenFailures.get(projectId) ?? null;
    return {
      settings,
      maintenance: {
        retention,
        recovery: {
          error: failure,
          latestSnapshotAt: latestSnapshot?.createdAt ?? null,
          canRestore: latestSnapshot !== null,
          isCorrupt: failure !== null,
        },
      },
    };
  }

  public updateProjectSettings(
    projectId: string,
    settings: TeamProjectSettings,
  ): TeamProjectSettings {
    validateProjectSettings(settings);
    createProjectStore(this.dbManager.openProject(projectId)).updateProjectSettings(
      fromTeamProjectSettings(settings),
    );
    return this.getProjectSettings(projectId);
  }

  public getLegacyChatAdoptionState(): Promise<LegacyChatAdoptionState> {
    return getLegacyChatAdoptionState(this.paseoHome);
  }

  public adoptLegacyChat(projectId: string): Promise<LegacyChatAdoptionState> {
    return adoptLegacyChatIntoProject({ paseoHome: this.paseoHome, projectId }).then(() =>
      this.getLegacyChatAdoptionState(),
    );
  }

  public deleteProjectData(projectId: string): void {
    this.projectOpenFailures.delete(projectId);
    this.dbManager.deleteProjectData(projectId);
  }

  public async restoreProjectFromLatestSnapshot(
    projectId: string,
  ): Promise<TeamProjectMaintenance> {
    const latestSnapshot = await this.backupManager.getLatestSnapshot(projectId);
    if (!latestSnapshot) {
      throw new Error(`No team snapshot is available for project ${projectId}.`);
    }
    this.dbManager.deleteProjectData(projectId);
    await this.backupManager.restoreDatabase({
      databaseName: projectId,
      destinationPath: this.dbManager.getProjectPath(projectId),
      snapshotPath: latestSnapshot.path,
    });
    this.projectOpenFailures.delete(projectId);
    return (await this.getProjectSettingsState(projectId)).maintenance;
  }

  public listTasks(input: ListTeamTasksInput): TeamTask[] {
    const now = this.now().toISOString();
    createProjectStore(this.dbManager.openProject(input.projectId)).expireClaims(now, now);
    return createProjectStore(this.dbManager.openProject(input.projectId))
      .listTasks({
        status: input.status,
        assigneeMemberId: input.assigneeMemberId,
        creatorMemberId: input.creatorMemberId,
        claimantMemberId: input.claimantMemberId,
        claimableAt: input.claimable ? now : undefined,
      })
      .map(toTeamTask);
  }

  public getTask(projectId: string, taskId: string): TeamTask | null {
    const now = this.now().toISOString();
    createProjectStore(this.dbManager.openProject(projectId)).expireClaims(now, now);
    const task = createProjectStore(this.dbManager.openProject(projectId)).getTask(taskId);
    return task ? toTeamTask(task) : null;
  }

  public createTask(input: CreateTeamTaskInput): TeamTask {
    const created = createProjectStore(this.dbManager.openProject(input.projectId)).createTask({
      id: this.createId(),
      title: input.title,
      body: input.body ?? null,
      status: "todo",
      creatorMemberId: input.creatorMemberId,
      assigneeMemberId: input.assigneeMemberId ?? null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
      dependsOnTaskIds: input.dependsOnTaskIds ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? [],
    });
    this.emit({ type: "team.task.changed", projectId: input.projectId, task: toTeamTask(created) });
    return toTeamTask(created);
  }

  public updateTask(input: UpdateTeamTaskInput): TeamTask {
    const projectStore = createProjectStore(this.dbManager.openProject(input.projectId));
    if (!input.bypassClaim) {
      if (!input.actorMemberId) {
        throw new Error("Member task updates must identify the acting claimant.");
      }
      this.reviewCycle.assertProjectRunning(input.projectId);
      this.claims.assertCanMutate(input.projectId, input.taskId, input.actorMemberId);
    }
    const updated = projectStore.updateTask({
      taskId: input.taskId,
      title: input.title,
      body: input.body,
      status: input.status,
      assigneeMemberId: input.assigneeMemberId,
      updatedAt: this.now().toISOString(),
    });
    if (!updated) {
      throw new Error(`Task ${input.taskId} was not found.`);
    }
    if (input.dependsOnTaskIds) {
      projectStore.replaceTaskDependencies(input.taskId, input.dependsOnTaskIds);
    }
    if (input.acceptanceCriteria) {
      projectStore.replaceTaskAcceptanceCriteria(input.taskId, input.acceptanceCriteria);
    }
    const finalTask = projectStore.getTask(input.taskId);
    if (!finalTask) {
      throw new Error(`Task ${input.taskId} was not found after update.`);
    }
    if (input.actorMemberId) {
      this.recordProgress(input.projectId, input.taskId, input.actorMemberId, "status_changed");
      this.claims.renew(
        input.projectId,
        input.taskId,
        input.actorMemberId,
        this.getProjectSettings(input.projectId).attemptTimeoutMs,
      );
    }
    this.emit({
      type: "team.task.changed",
      projectId: input.projectId,
      task: toTeamTask(finalTask),
    });
    return toTeamTask(finalTask);
  }

  public deleteTask(projectId: string, taskId: string): string | null {
    return createProjectStore(this.dbManager.openProject(projectId)).deleteTask(taskId);
  }

  public claimTask(projectId: string, taskId: string, memberId: string): TeamTask {
    this.reviewCycle.assertProjectRunning(projectId);
    const task = this.claims.acquire(
      projectId,
      taskId,
      memberId,
      this.getProjectSettings(projectId).attemptTimeoutMs,
    );
    this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
    return toTeamTask(task);
  }

  public overrideTaskClaim(
    projectId: string,
    taskId: string,
    claimantMemberId: string | null,
  ): TeamTask {
    const projectStore = createProjectStore(this.dbManager.openProject(projectId));
    const updatedAt = this.now().toISOString();
    let task: ProjectTask | null;
    if (claimantMemberId === null) {
      projectStore.releaseTaskClaim({
        taskId,
        updatedAt,
        attemptStartedAt: null,
        escalatedAt: null,
      });
      task = projectStore.getTask(taskId);
    } else {
      task = projectStore.updateTask({
        taskId,
        claimantMemberId,
        claimExpiresAt: new Date(
          Date.parse(updatedAt) + this.getProjectSettings(projectId).attemptTimeoutMs,
        ).toISOString(),
        attemptStartedAt: updatedAt,
        escalatedAt: null,
        updatedAt,
      });
      this.recordProgress(projectId, taskId, claimantMemberId, "claimed");
    }
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
    return toTeamTask(task);
  }

  public releaseTask(projectId: string, taskId: string, memberId: string): TeamTask {
    const task = this.claims.release(projectId, taskId, memberId);
    this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
    return toTeamTask(task);
  }

  public addTaskNote(
    projectId: string,
    taskId: string,
    authorMemberId: string,
    body: string,
  ): TeamTaskNote {
    this.reviewCycle.assertProjectRunning(projectId);
    this.claims.assertCanMutate(projectId, taskId, authorMemberId);
    const note = createProjectStore(this.dbManager.openProject(projectId)).createTaskNote({
      id: this.createId(),
      taskId,
      authorMemberId,
      body,
      createdAt: this.now().toISOString(),
    });
    this.recordProgress(projectId, taskId, authorMemberId, "noted");
    this.claims.renew(
      projectId,
      taskId,
      authorMemberId,
      this.getProjectSettings(projectId).attemptTimeoutMs,
    );
    const task = this.getTask(projectId, taskId);
    if (task) {
      this.emit({ type: "team.task.changed", projectId, task });
    }
    return toTeamTaskNote(note);
  }

  public satisfyTaskCriterion(
    projectId: string,
    taskId: string,
    position: number,
    memberId: string,
  ): TeamTask {
    this.reviewCycle.assertProjectRunning(projectId);
    this.claims.assertCanMutate(projectId, taskId, memberId);
    createProjectStore(this.dbManager.openProject(projectId)).satisfyTaskCriterion(
      taskId,
      position,
      this.now().toISOString(),
    );
    this.recordProgress(projectId, taskId, memberId, "criterion_satisfied");
    this.claims.renew(
      projectId,
      taskId,
      memberId,
      this.getProjectSettings(projectId).attemptTimeoutMs,
    );
    const task = this.getTask(projectId, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    this.emit({ type: "team.task.changed", projectId, task });
    return task;
  }

  public handbackTask(projectId: string, taskId: string, memberId: string): TeamTask {
    this.reviewCycle.assertProjectRunning(projectId);
    this.claims.assertCanMutate(projectId, taskId, memberId);
    this.recordProgress(projectId, taskId, memberId, "status_changed");
    const task = this.reviewCycle.handleHandback(projectId, taskId);
    this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
    return toTeamTask(task);
  }

  public acceptTask(projectId: string, taskId: string, memberId: string): TeamTask {
    this.reviewCycle.assertProjectRunning(projectId);
    this.claims.assertCanMutate(projectId, taskId, memberId);
    this.recordProgress(projectId, taskId, memberId, "status_changed");
    const task = this.reviewCycle.handleAcceptance(projectId, taskId);
    this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
    return toTeamTask(task);
  }

  public checkTaskAttemptTimeouts(projectId: string): TeamTask[] {
    return this.reviewCycle.checkAttemptTimeouts(projectId).map((task) => toTeamTask(task));
  }

  public stopProject(projectId: string): string {
    return this.reviewCycle.stopProject(projectId);
  }

  public resumeProject(projectId: string, taskId?: string): { taskId: string | null } {
    this.reviewCycle.resumeProject(projectId);
    if (taskId) {
      const task = createProjectStore(this.dbManager.openProject(projectId)).updateTask({
        taskId,
        escalatedAt: null,
        updatedAt: this.now().toISOString(),
      });
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      this.emit({ type: "team.task.changed", projectId, task: toTeamTask(task) });
    }
    return { taskId: taskId ?? null };
  }

  public subscribe(listener: (event: TeamServiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TeamServiceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private recordProgress(
    projectId: string,
    taskId: string,
    memberId: string,
    kind: "claimed" | "released" | "status_changed" | "noted" | "criterion_satisfied",
  ): void {
    createProjectStore(this.dbManager.openProject(projectId)).addProgressEvent({
      taskId,
      memberId,
      kind,
      createdAt: this.now().toISOString(),
    });
    this.reviewCycle.recordProgress(projectId);
  }

  private ensureHumanMemberSafe(): void {
    try {
      this.ensureHumanMember();
    } catch {}
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

  private runStartupMaintenance(): void {
    void this.snapshotAllDatabases();
    applyTeamMessageRetention({
      listProjectIds: () => this.dbManager.listProjectIds(),
      openProject: (projectId) => this.dbManager.openProject(projectId),
      now: this.now,
      onProjectError: ({ projectId, error }) => {
        this.projectOpenFailures.set(
          projectId,
          error instanceof Error ? error.message : String(error),
        );
      },
    });
    this.backupTimer = setInterval(() => {
      void this.snapshotAllDatabases();
    }, TEAM_BACKUP_INTERVAL_MS);
  }

  private async snapshotAllDatabases(): Promise<void> {
    const snapshotJobs = [
      ...(existsSync(this.dbManager.getRosterPath())
        ? [
            this.backupManager.snapshotDatabase({
              databaseName: "roster",
              databasePath: this.dbManager.getRosterPath(),
            }),
          ]
        : []),
      ...this.dbManager.listProjectIds().map((projectId) =>
        this.backupManager.snapshotDatabase({
          databaseName: projectId,
          databasePath: this.dbManager.getProjectPath(projectId),
        }),
      ),
    ];
    await Promise.allSettled(snapshotJobs);
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

function toTeamChannel(
  channel: {
    id: string;
    name: string;
    purpose: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
  },
  unreadCount?: number,
): TeamChannel {
  return {
    id: channel.id,
    name: channel.name,
    purpose: channel.purpose,
    ...(unreadCount === undefined ? {} : { unreadCount }),
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

function toTeamTask(task: ProjectTask): TeamTask {
  return {
    id: task.id,
    seq: task.seq,
    title: task.title,
    body: task.body,
    status: task.status,
    creatorMemberId: task.creatorMemberId,
    assigneeMemberId: task.assigneeMemberId,
    claimantMemberId: task.claimantMemberId,
    claimExpiresAt: task.claimExpiresAt,
    handbackCount: task.handbackCount,
    attemptStartedAt: task.attemptStartedAt,
    escalatedAt: task.escalatedAt,
    dependsOnTaskIds: task.dependsOnTaskIds,
    acceptanceCriteria: task.acceptanceCriteria,
    notes: task.notes.map(toTeamTaskNote),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function toTeamTaskNote(note: {
  id: string;
  taskId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
}): TeamTaskNote {
  return {
    id: note.id,
    taskId: note.taskId,
    authorMemberId: note.authorMemberId,
    body: note.body,
    createdAt: note.createdAt,
  };
}

function toTeamProjectSettings(settings: ProjectSettings): TeamProjectSettings {
  return {
    messageRetentionCap: settings.messageRetentionCap,
    handbackLimit: settings.handbackLimit,
    attemptTimeoutMs: settings.attemptTimeoutMs,
    noProgressLimit: settings.noProgressLimit,
    autoStartEnabled: settings.autoStartEnabled,
  };
}

function fromTeamProjectSettings(settings: TeamProjectSettings): ProjectSettings {
  return {
    messageRetentionCap: settings.messageRetentionCap,
    handbackLimit: settings.handbackLimit,
    attemptTimeoutMs: settings.attemptTimeoutMs,
    noProgressLimit: settings.noProgressLimit,
    autoStartEnabled: settings.autoStartEnabled,
  };
}

function validateProjectSettings(settings: TeamProjectSettings): void {
  if (settings.messageRetentionCap <= 0) {
    throw new Error("messageRetentionCap must be at least 1.");
  }
  if (settings.handbackLimit < 0) {
    throw new Error("handbackLimit must be 0 or greater.");
  }
  if (settings.attemptTimeoutMs <= 0) {
    throw new Error("attemptTimeoutMs must be at least 1 millisecond.");
  }
  if (settings.noProgressLimit < 0) {
    throw new Error("noProgressLimit must be 0 or greater.");
  }
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
