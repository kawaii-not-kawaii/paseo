import { Fragment, useCallback, useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TeamTask } from "@getpaseo/protocol/team/types";
import type { DraggableRenderItemInfo } from "@/components/draggable-list";
import { getCrossColumnDropStatus, type TeamTaskStatusValue } from "./task-status";
import type { TaskBoardColumn, TaskBoardDragSurfaceProps } from "./task-board-drag-surface.types";

const NOOP_DRAG = () => undefined;

export function TaskBoardDragSurface({
  columns,
  renderColumn,
  renderItem,
  renderDropTarget,
  onMoveTask,
}: TaskBoardDragSurfaceProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const activeStatus = event.active.data.current?.status as TeamTaskStatusValue | undefined;
      const overStatus = event.over?.data.current?.status as TeamTaskStatusValue | undefined;
      const nextStatus = getCrossColumnDropStatus(activeStatus, overStatus);
      if (nextStatus) {
        onMoveTask(String(event.active.id), nextStatus);
      }
    },
    [onMoveTask],
  );
  const handleDragCancel = useCallback(() => setActiveId(null), []);
  const handleDragStart = useCallback(
    (event: DragStartEvent) => setActiveId(String(event.active.id)),
    [],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      {columns.map((column) => (
        <Fragment key={column.status}>
          {renderColumn(
            column,
            <TaskColumnDropZone
              column={column}
              activeId={activeId}
              renderItem={renderItem}
              dropTarget={renderDropTarget(column.status)}
            />,
          )}
        </Fragment>
      ))}
    </DndContext>
  );
}

function TaskColumnDropZone({
  column,
  activeId,
  renderItem,
  dropTarget,
}: {
  column: TaskBoardColumn;
  activeId: string | null;
  renderItem: TaskBoardDragSurfaceProps["renderItem"];
  dropTarget: React.ReactElement;
}) {
  const { setNodeRef } = useDroppable({
    id: `team-task-column-${column.status}`,
    data: { status: column.status },
  });
  const taskIds = useMemo(() => column.tasks.map((task) => task.id), [column.tasks]);

  return (
    <div ref={setNodeRef}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {column.tasks.map((task, index) => (
          <SortableTask
            key={task.id}
            task={task}
            index={index}
            status={column.status}
            activeId={activeId}
            renderItem={renderItem}
          />
        ))}
      </SortableContext>
      {dropTarget}
    </div>
  );
}

function SortableTask({
  task,
  index,
  status,
  activeId,
  renderItem,
}: {
  task: TeamTask;
  index: number;
  status: TeamTaskStatusValue;
  activeId: string | null;
  renderItem: TaskBoardDragSurfaceProps["renderItem"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { status },
    disabled: task.claimantMemberId === null || status === "done",
  });
  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(
        transform && isDragging ? { ...transform, scaleX: 1, scaleY: 1 } : transform,
      ),
      transition,
      opacity: isDragging ? 0.9 : 1,
      zIndex: isDragging ? 1 : undefined,
    }),
    [isDragging, transform, transition],
  );
  const info: DraggableRenderItemInfo<TeamTask> = {
    item: task,
    index,
    drag: NOOP_DRAG,
    isActive: activeId === task.id,
    dragHandleProps: {
      attributes: attributes as unknown as Record<string, unknown>,
      listeners: listeners as unknown as Record<string, unknown>,
      setActivatorNodeRef: setActivatorNodeRef as unknown as (node: unknown) => void,
    },
  };

  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(info, status)}
    </div>
  );
}
