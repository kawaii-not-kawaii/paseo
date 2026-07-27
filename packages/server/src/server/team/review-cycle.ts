import {
  createProjectStore,
  type ProjectSettings,
  type ProjectTask,
} from "./storage/project-store.js";
import type { TeamDatabaseHandle } from "./storage/database.js";

interface ProjectRuntimeState {
  stopped: boolean;
  stopReason: string | null;
  noProgressCount: number;
}

export interface ReviewCycleOptions {
  now: () => Date;
  openProject: (projectId: string) => TeamDatabaseHandle;
  onProjectStopped?: (input: {
    projectId: string;
    task: ProjectTask | null;
    reason: string;
  }) => void;
}

export class ReviewCycle {
  private readonly now: () => Date;
  private readonly openProject: ReviewCycleOptions["openProject"];
  private readonly onProjectStopped?: ReviewCycleOptions["onProjectStopped"];
  private readonly stateByProject = new Map<string, ProjectRuntimeState>();

  constructor(options: ReviewCycleOptions) {
    this.now = options.now;
    this.openProject = options.openProject;
    this.onProjectStopped = options.onProjectStopped;
  }

  public recordProgress(projectId: string): void {
    this.ensureState(projectId).noProgressCount = 0;
  }

  public recordUserMessage(projectId: string): void {
    this.ensureState(projectId).noProgressCount = 0;
  }

  public recordAutomaticTurn(projectId: string): void {
    const state = this.ensureState(projectId);
    if (state.stopped) {
      return;
    }
    const projectStore = createProjectStore(this.openProject(projectId));
    const settings = projectStore.getProjectSettings();
    state.noProgressCount += 1;
    if (state.noProgressCount < settings.noProgressLimit) {
      return;
    }
    state.stopped = true;
    state.stopReason = `Stopped after ${settings.noProgressLimit} consecutive automatic turns without progress. Resume the project when the team has a concrete next step.`;
    this.onProjectStopped?.({
      projectId,
      task: null,
      reason: state.stopReason,
    });
  }

  public stopProject(
    projectId: string,
    reason = "Stopped by the user. Resume when you want members to continue.",
  ): string {
    const state = this.ensureState(projectId);
    state.stopped = true;
    state.stopReason = reason;
    this.onProjectStopped?.({ projectId, task: null, reason });
    return reason;
  }

  public resumeProject(projectId: string): void {
    const state = this.ensureState(projectId);
    state.stopped = false;
    state.stopReason = null;
    state.noProgressCount = 0;
  }

  public isProjectStopped(projectId: string): boolean {
    return this.ensureState(projectId).stopped;
  }

  public assertProjectRunning(projectId: string): void {
    const state = this.ensureState(projectId);
    if (state.stopped) {
      throw new Error(
        state.stopReason ?? "This project is stopped. Resume it before asking members to continue.",
      );
    }
  }

  public handleHandback(projectId: string, taskId: string): ProjectTask {
    const projectStore = createProjectStore(this.openProject(projectId));
    const task = projectStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    const settings = projectStore.getProjectSettings();
    const nextCount = task.handbackCount + 1;
    const updatedAt = this.now().toISOString();

    if (nextCount >= settings.handbackLimit && settings.handbackLimit > 0) {
      const escalatedAt = updatedAt;
      const escalated = projectStore.updateTask({
        taskId,
        status: "in_review",
        claimantMemberId: null,
        claimExpiresAt: null,
        handbackCount: nextCount,
        attemptStartedAt: null,
        escalatedAt,
        updatedAt,
      });
      if (!escalated) {
        throw new Error(`Task ${taskId} was not found after escalation.`);
      }
      this.onProjectStopped?.({
        projectId,
        task: escalated,
        reason: `Task #${escalated.seq} hit the handback limit (${settings.handbackLimit}). Ask the user to decide the next step, then resume the task.`,
      });
      return escalated;
    }

    const handedBack = projectStore.updateTask({
      taskId,
      status: "in_progress",
      claimantMemberId: null,
      claimExpiresAt: null,
      handbackCount: nextCount,
      attemptStartedAt: null,
      updatedAt,
    });
    if (!handedBack) {
      throw new Error(`Task ${taskId} was not found after handback.`);
    }
    return handedBack;
  }

  public handleAcceptance(projectId: string, taskId: string): ProjectTask {
    const updated = createProjectStore(this.openProject(projectId)).updateTask({
      taskId,
      status: "done",
      claimantMemberId: null,
      claimExpiresAt: null,
      handbackCount: 0,
      attemptStartedAt: null,
      escalatedAt: null,
      updatedAt: this.now().toISOString(),
    });
    if (!updated) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return updated;
  }

  public checkAttemptTimeouts(projectId: string): ProjectTask[] {
    const projectStore = createProjectStore(this.openProject(projectId));
    const settings = projectStore.getProjectSettings();
    const now = this.now();
    const timedOut: ProjectTask[] = [];

    for (const task of projectStore.listTasks()) {
      if (!task.claimantMemberId || !task.attemptStartedAt || task.escalatedAt) {
        continue;
      }
      if (now.getTime() - Date.parse(task.attemptStartedAt) < settings.attemptTimeoutMs) {
        continue;
      }
      const escalatedAt = now.toISOString();
      const escalated = projectStore.updateTask({
        taskId: task.id,
        claimantMemberId: null,
        claimExpiresAt: null,
        attemptStartedAt: null,
        escalatedAt,
        updatedAt: escalatedAt,
      });
      if (!escalated) {
        continue;
      }
      timedOut.push(escalated);
      this.onProjectStopped?.({
        projectId,
        task: escalated,
        reason: `Task #${escalated.seq} exceeded the ${formatDuration(settings)} attempt limit. Ask the user to inspect the stuck attempt, then resume the task.`,
      });
    }

    return timedOut;
  }

  private ensureState(projectId: string): ProjectRuntimeState {
    const existing = this.stateByProject.get(projectId);
    if (existing) {
      return existing;
    }
    const created: ProjectRuntimeState = {
      stopped: false,
      stopReason: null,
      noProgressCount: 0,
    };
    this.stateByProject.set(projectId, created);
    return created;
  }
}

function formatDuration(settings: ProjectSettings): string {
  const minutes = Math.floor(settings.attemptTimeoutMs / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
