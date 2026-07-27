import type { TeamTask } from "@getpaseo/protocol/team/types";

export const TEAM_TASK_STATUS_VALUES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const satisfies readonly TeamTask["status"][];

export type TeamTaskStatusValue = (typeof TEAM_TASK_STATUS_VALUES)[number];

export function sortTasksBySeq(left: TeamTask, right: TeamTask): number {
  return left.seq - right.seq;
}
