import { useCallback } from "react";
import type { TeamTask } from "@getpaseo/protocol/team/types";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import type { TaskBoardColumn, TaskBoardDragSurfaceProps } from "./task-board-drag-surface.types";

const taskKey = (task: TeamTask) => task.id;
const ignoreReorder = () => undefined;

export function TaskBoardDragSurface({
  columns,
  renderColumn,
  renderItem,
  renderDropTarget,
}: TaskBoardDragSurfaceProps) {
  return columns.map((column) => (
    <NativeTaskColumn
      key={column.status}
      column={column}
      renderColumn={renderColumn}
      renderItem={renderItem}
      renderDropTarget={renderDropTarget}
    />
  ));
}

function NativeTaskColumn({
  column,
  renderColumn,
  renderItem,
  renderDropTarget,
}: Pick<TaskBoardDragSurfaceProps, "renderColumn" | "renderItem" | "renderDropTarget"> & {
  column: TaskBoardColumn;
}) {
  const handleRenderItem = useCallback(
    (info: DraggableRenderItemInfo<TeamTask>) => renderItem(info, column.status),
    [column.status, renderItem],
  );

  return renderColumn(
    column,
    <DraggableList
      data={column.tasks}
      keyExtractor={taskKey}
      renderItem={handleRenderItem}
      onDragEnd={ignoreReorder}
      scrollEnabled={false}
      useDragHandle
      nestable
      ListFooterComponent={renderDropTarget(column.status)}
    />,
  );
}
