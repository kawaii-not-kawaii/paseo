import type { ReactElement } from "react";
import type { TeamTask } from "@getpaseo/protocol/team/types";
import type { DraggableRenderItemInfo } from "@/components/draggable-list";
import type { TeamTaskStatusValue } from "./task-status";

export interface TaskBoardColumn {
  status: TeamTaskStatusValue;
  title: string;
  tasks: TeamTask[];
}

export interface TaskBoardDragSurfaceProps {
  columns: TaskBoardColumn[];
  renderColumn: (column: TaskBoardColumn, list: ReactElement) => ReactElement;
  renderItem: (
    info: DraggableRenderItemInfo<TeamTask>,
    status: TeamTaskStatusValue,
  ) => ReactElement;
  renderDropTarget: (status: TeamTaskStatusValue) => ReactElement;
  onMoveTask: (taskId: string, status: TeamTaskStatusValue) => void;
}
