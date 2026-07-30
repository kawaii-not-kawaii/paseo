/* eslint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop */
import { useCallback, useMemo } from "react";
import { GripVertical, Lock, MoreVertical, TriangleAlert } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import type { DraggableRenderItemInfo } from "@/components/draggable-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { memberHandle } from "@/screens/team/member-status";
import { teamColors } from "@/screens/team/team-colors";
import {
  TEAM_LINE_HEIGHT,
  TEAM_SPACE,
  TEAM_STATUS_DOT_SIZE,
  TEAM_TASK_COLUMN_WIDTH,
} from "@/screens/team/team-layout";
import { TEAM_TASK_STATUS_VALUES, sortTasksBySeq, type TeamTaskStatusValue } from "./task-status";
import { TaskBoardDragSurface } from "./task-board-drag-surface";
import type { TaskBoardColumn } from "./task-board-drag-surface.types";

export function TaskBoard({
  tasks,
  members,
  handbackLimit,
  onOpenTask,
  onMoveTask,
  onResumeTask,
}: {
  tasks: TeamTask[];
  members: TeamMember[];
  handbackLimit: number | null;
  onOpenTask: (taskId: string) => void;
  onMoveTask: (taskId: string, status: TeamTaskStatusValue) => void;
  onResumeTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const groupedTasks = useMemo(() => {
    const next = new Map<TeamTaskStatusValue, TeamTask[]>();
    for (const status of TEAM_TASK_STATUS_VALUES) {
      next.set(status, tasks.filter((task) => task.status === status).sort(sortTasksBySeq));
    }
    return next;
  }, [tasks]);

  const columns: TaskBoardColumn[] = TEAM_TASK_STATUS_VALUES.map((status) => ({
    status,
    title: t(`team.tasks.status.${status}`),
    tasks: groupedTasks.get(status) ?? [],
  }));

  return (
    <ScrollView
      horizontal={!isCompact}
      showsHorizontalScrollIndicator={false}
      style={styles.board}
      contentContainerStyle={styles.boardContent}
    >
      <TaskBoardDragSurface
        columns={columns}
        onMoveTask={onMoveTask}
        renderColumn={(column, list) => (
          <View style={styles.column}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>{column.title}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{column.tasks.length}</Text>
              </View>
            </View>
            <View style={styles.columnList}>{list}</View>
          </View>
        )}
        renderItem={(info, status) => (
          <TaskBoardCard
            info={info}
            members={members}
            handbackLimit={handbackLimit}
            isDone={status === "done"}
            onOpenTask={onOpenTask}
            onMoveTask={onMoveTask}
            onResumeTask={onResumeTask}
          />
        )}
        renderDropTarget={() => (
          <View style={styles.dropTarget}>
            <Text style={styles.dropTargetText}>{t("team.tasks.dropTarget")}</Text>
          </View>
        )}
      />
    </ScrollView>
  );
}

function TaskBoardCard({
  info,
  members,
  handbackLimit,
  isDone,
  onOpenTask,
  onMoveTask,
  onResumeTask,
}: {
  info: DraggableRenderItemInfo<TeamTask>;
  members: TeamMember[];
  handbackLimit: number | null;
  isDone: boolean;
  onOpenTask: (taskId: string) => void;
  onMoveTask: (taskId: string, status: TeamTaskStatusValue) => void;
  onResumeTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const task = info.item;
  const assigneeHandle = getMemberHandle(members, task.assigneeMemberId);
  const claimantHandle = getMemberHandle(members, task.claimantMemberId);
  const creatorHandle = getMemberHandle(members, task.creatorMemberId);
  const isEscalated = task.escalatedAt !== null;
  const isBlocked = (task.dependsOnTaskIds?.length ?? 0) > 0;

  const handleOpen = useCallback(() => onOpenTask(task.id), [onOpenTask, task.id]);
  const handleDrag = useCallback(() => info.drag(), [info]);
  const handleResume = useCallback(() => onResumeTask(task.id), [onResumeTask, task.id]);

  return (
    <Pressable
      onPress={handleOpen}
      style={({ hovered }) => [
        styles.card,
        isEscalated && styles.cardEscalated,
        (info.isActive || Boolean(hovered)) && styles.cardHovered,
      ]}
      testID={`team-task-card-${task.id}`}
    >
      <View style={styles.cardHeader}>
        <Text style={isDone ? styles.cardTitleDone : styles.cardTitle}>
          {`#${task.seq} ${task.title}`}
        </Text>
        <TaskCardHandle
          task={task}
          info={info}
          isDone={isDone}
          onMoveTask={onMoveTask}
          onDrag={handleDrag}
        />
      </View>

      <TaskCardMeta
        isDone={isDone}
        creatorHandle={creatorHandle}
        assigneeHandle={assigneeHandle}
        isClaimed={task.claimantMemberId !== null}
      />

      {claimantHandle ? (
        <View style={styles.metaRow}>
          <View style={styles.claimDot} />
          <Text style={styles.claimText}>
            {t("team.tasks.claimedBy", { member: claimantHandle })}
          </Text>
        </View>
      ) : null}

      {isBlocked ? (
        <View style={styles.metaRow}>
          <Lock size={12} color={iconStyles.warning.color} />
          <Text style={styles.blockedText}>
            {t("team.tasks.blockedBy", { refs: task.dependsOnTaskIds?.length ?? 0 })}
          </Text>
        </View>
      ) : null}

      {isEscalated ? (
        <>
          <View style={styles.metaRow}>
            <TriangleAlert size={12} color={iconStyles.danger.color} />
            <Text style={styles.escalatedText}>
              {t("team.tasks.handedBack", {
                count: task.handbackCount,
                limit: handbackLimit ?? task.handbackCount,
              })}
            </Text>
          </View>
          <View style={styles.escalationActions}>
            <Button variant="outline" size="xs" onPress={handleOpen}>
              {t("team.escalation.readAttempts")}
            </Button>
            <Button variant="default" size="xs" onPress={handleResume}>
              {t("team.escalation.resume")}
            </Button>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

/**
 * A claimed card is the one the design marks as draggable, so it gets the grip;
 * an unclaimed one gets the overflow menu. A done card gets neither.
 */
function TaskCardHandle({
  task,
  info,
  isDone,
  onMoveTask,
  onDrag,
}: {
  task: TeamTask;
  info: DraggableRenderItemInfo<TeamTask>;
  isDone: boolean;
  onMoveTask: (taskId: string, status: TeamTaskStatusValue) => void;
  onDrag: () => void;
}) {
  const { t } = useTranslation();

  if (isDone) {
    return null;
  }

  if (task.claimantMemberId && isWeb) {
    return (
      <Pressable
        onLongPress={onDrag}
        style={styles.handle}
        accessibilityRole="button"
        accessibilityLabel={t("team.tasks.drag")}
        {...(info.dragHandleProps?.attributes ?? {})}
        {...(info.dragHandleProps?.listeners ?? {})}
        ref={info.dragHandleProps?.setActivatorNodeRef as never}
      >
        <GripVertical size={14} color={iconStyles.faint.color} />
      </Pressable>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger style={styles.handle}>
        <MoreVertical size={14} color={iconStyles.faint.color} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" width={220}>
        {TEAM_TASK_STATUS_VALUES.filter((status) => status !== task.status).map((status) => (
          <DropdownMenuItem key={status} onSelect={() => onMoveTask(task.id, status)}>
            {t("team.tasks.moveTo", { status: t(`team.tasks.status.${status}`) })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Done cards credit their creator; live cards name the assignee and claim state. */
function TaskCardMeta({
  isDone,
  creatorHandle,
  assigneeHandle,
  isClaimed,
}: {
  isDone: boolean;
  creatorHandle: string | null;
  assigneeHandle: string | null;
  isClaimed: boolean;
}) {
  const { t } = useTranslation();

  if (isDone) {
    if (!creatorHandle) {
      return null;
    }
    return (
      <Text style={styles.metaFaint}>{t("team.tasks.byMember", { member: creatorHandle })}</Text>
    );
  }

  const target = assigneeHandle
    ? t("team.tasks.forMember", { member: assigneeHandle })
    : t("team.tasks.claim.unassigned");

  return (
    <Text style={styles.meta}>
      {isClaimed ? target : `${target} · ${t("team.tasks.unclaimed")}`}
    </Text>
  );
}

function getMemberHandle(members: TeamMember[], memberId: string | null): string | null {
  const member = members.find((entry) => entry.id === memberId);
  return member ? memberHandle(member) : null;
}

const styles = StyleSheet.create((theme) => ({
  board: {
    flex: 1,
  },
  boardContent: {
    gap: theme.spacing[4],
    padding: theme.spacing[4],
  },
  column: {
    width: {
      xs: "100%",
      sm: "100%",
      md: TEAM_TASK_COLUMN_WIDTH,
    },
    gap: TEAM_SPACE.snug,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
  },
  columnTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  countBadge: {
    height: 18,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  countBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  columnList: {
    gap: TEAM_SPACE.snug,
  },
  dropTarget: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.borderAccent,
    padding: 18,
    alignItems: "center",
  },
  dropTargetText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
  },
  card: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  cardEscalated: {
    borderColor: teamColors.dangerBorder,
  },
  cardHovered: {
    backgroundColor: theme.colors.surface2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  cardTitle: {
    color: theme.colors.foreground,
    flex: 1,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * TEAM_LINE_HEIGHT.cardTitle,
  },
  cardTitleDone: {
    color: theme.colors.foregroundMuted,
    flex: 1,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * TEAM_LINE_HEIGHT.cardTitle,
  },
  handle: {
    flexShrink: 0,
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  metaFaint: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  claimDot: {
    width: TEAM_STATUS_DOT_SIZE,
    height: TEAM_STATUS_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  claimText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.accentBright,
  },
  blockedText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.statusWarning,
  },
  escalatedText: {
    fontSize: theme.fontSize.xs,
    color: teamColors.dangerText,
  },
  escalationActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
    marginTop: 2,
  },
}));

const iconStyles = StyleSheet.create((theme) => ({
  faint: {
    color: theme.colors.foregroundExtraMuted,
  },
  warning: {
    color: theme.colors.statusWarning,
  },
  danger: {
    color: theme.colors.destructive,
  },
}));
