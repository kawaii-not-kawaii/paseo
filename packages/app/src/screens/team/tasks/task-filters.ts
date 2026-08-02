import type { TeamTask } from "@getpaseo/protocol/team/types";

export interface TaskFilterState {
  creatorMemberId: string | null;
  assigneeMemberId: string | null;
}

export function applyTaskFilters(tasks: TeamTask[], filters: TaskFilterState): TeamTask[] {
  return tasks.filter((task) => {
    if (filters.creatorMemberId && task.creatorMemberId !== filters.creatorMemberId) {
      return false;
    }
    if (filters.assigneeMemberId && task.assigneeMemberId !== filters.assigneeMemberId) {
      return false;
    }
    return true;
  });
}
