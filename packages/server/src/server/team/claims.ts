import type { ProjectTask } from "./storage/project-store.js";
import { createProjectStore } from "./storage/project-store.js";
import { createRosterStore } from "./storage/roster-store.js";
import type { TeamDatabaseHandle } from "./storage/database.js";

export interface ClaimsOptions {
  now: () => Date;
  openProject: (projectId: string) => TeamDatabaseHandle;
  openRoster: () => TeamDatabaseHandle;
  onProgress?: (input: {
    projectId: string;
    taskId: string;
    memberId: string;
    kind: "claimed" | "released" | "status_changed" | "noted" | "criterion_satisfied";
  }) => void;
}

export class Claims {
  private readonly now: () => Date;
  private readonly openProject: ClaimsOptions["openProject"];
  private readonly openRoster: ClaimsOptions["openRoster"];
  private readonly onProgress?: ClaimsOptions["onProgress"];

  constructor(options: ClaimsOptions) {
    this.now = options.now;
    this.openProject = options.openProject;
    this.openRoster = options.openRoster;
    this.onProgress = options.onProgress;
  }

  public acquire(projectId: string, taskId: string, memberId: string, ttlMs: number): ProjectTask {
    const projectStore = createProjectStore(this.openProject(projectId));
    const now = this.now().toISOString();
    projectStore.expireClaims(now, now);

    const acquired = projectStore.tryAcquireTaskClaim({
      taskId,
      memberId,
      now,
      claimExpiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
      attemptStartedAt: now,
      updatedAt: now,
    });
    if (!acquired) {
      const blockers = projectStore.listUnmetTaskDependencies(taskId);
      if (blockers.length > 0) {
        throw new Error(
          `Task ${formatTaskRef(projectStore.getTask(taskId))} is blocked by ${blockers
            .map(formatTaskRef)
            .join(", ")}. Finish those dependencies before claiming it.`,
        );
      }
      const task = projectStore.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found.`);
      }
      if (task.claimantMemberId) {
        throw new Error(
          `Task ${formatTaskRef(task)} is currently claimed by ${this.getMemberName(
            task.claimantMemberId,
          )}. Wait for release or ask the user to override the claim.`,
        );
      }
      throw new Error(`Task ${formatTaskRef(task)} could not be claimed. Try again.`);
    }

    const task = projectStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after claim.`);
    }
    this.onProgress?.({ projectId, taskId, memberId, kind: "claimed" });
    return task;
  }

  public renew(projectId: string, taskId: string, memberId: string, ttlMs: number): void {
    const projectStore = createProjectStore(this.openProject(projectId));
    const now = this.now().toISOString();
    const renewed = projectStore.renewTaskClaim({
      taskId,
      memberId,
      now,
      claimExpiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
      updatedAt: now,
    });
    if (!renewed) {
      throw new Error(
        `Your claim on task ${formatTaskRef(projectStore.getTask(taskId))} expired. Re-claim it before continuing.`,
      );
    }
  }

  public release(projectId: string, taskId: string, memberId: string): ProjectTask {
    const projectStore = createProjectStore(this.openProject(projectId));
    const now = this.now().toISOString();
    const released = projectStore.releaseTaskClaim({
      taskId,
      memberId,
      updatedAt: now,
      attemptStartedAt: null,
    });
    if (!released) {
      throw new Error(
        `Task ${formatTaskRef(projectStore.getTask(taskId))} is not claimed by you. Claim it first or ask the user to override it.`,
      );
    }
    const task = projectStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found after release.`);
    }
    this.onProgress?.({ projectId, taskId, memberId, kind: "released" });
    return task;
  }

  public assertCanMutate(projectId: string, taskId: string, memberId: string): ProjectTask {
    const projectStore = createProjectStore(this.openProject(projectId));
    const now = this.now().toISOString();
    projectStore.expireClaims(now, now);
    const task = projectStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (task.claimantMemberId === memberId && (!task.claimExpiresAt || task.claimExpiresAt > now)) {
      return task;
    }
    if (task.claimantMemberId) {
      throw new Error(
        `Task ${formatTaskRef(task)} is claimed by ${this.getMemberName(
          task.claimantMemberId,
        )}. Ask them to release it or ask the user to override the claim.`,
      );
    }
    throw new Error(
      `Task ${formatTaskRef(task)} is unclaimed. Claim it before changing status, editing it, or adding notes.`,
    );
  }

  public releaseForMember(projectId: string, memberId: string): string[] {
    const taskIds = createProjectStore(this.openProject(projectId)).releaseClaimsForMember(
      memberId,
      this.now().toISOString(),
    );
    for (const taskId of taskIds) {
      this.onProgress?.({ projectId, taskId, memberId, kind: "released" });
    }
    return taskIds;
  }

  private getMemberName(memberId: string): string {
    const member = createRosterStore(this.openRoster()).getMember(memberId);
    return member?.name ?? memberId;
  }
}

function formatTaskRef(task: ProjectTask | null): string {
  if (!task) {
    return "task";
  }
  return `#${task.seq}`;
}
