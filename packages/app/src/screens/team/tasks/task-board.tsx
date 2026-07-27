/* eslint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop */
import { useCallback, useMemo } from "react";
import { GripVertical, MoreVertical } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { TEAM_TASK_STATUS_VALUES, sortTasksBySeq, type TeamTaskStatusValue } from "./task-status";

export function TaskBoard({
  tasks,
  members,
  onOpenTask,
  onMoveTask,
}: {
  tasks: TeamTask[];
  members: TeamMember[];
  onOpenTask: (taskId: string) => void;
  onMoveTask: (taskId: string, status: TeamTaskStatusValue) => void;
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

  const columns = TEAM_TASK_STATUS_VALUES.map((status) => ({
    status,
    title: t(`team.tasks.status.${status}`),
    tasks: groupedTasks.get(status) ?? [],
  }));

  return (
    <ScrollView
      horizontal={!isCompact}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.boardContent}
    >
      {columns.map((column) => (
        <View key={column.status} style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>{column.title}</Text>
            <StatusBadge label={String(column.tasks.length)} variant="muted" />
          </View>
          <DraggableList
            data={column.tasks}
            keyExtractor={(task) => task.id}
            renderItem={(info) => (
              <TaskBoardCard
                info={info}
                members={members}
                onOpenTask={onOpenTask}
                onMoveTask={onMoveTask}
              />
            )}
            onDragEnd={() => undefined}
            scrollEnabled={false}
            useDragHandle
            nestable
            containerStyle={styles.columnList}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={settingsStyles.rowHint}>{t("team.tasks.emptyColumn")}</Text>
              </View>
            }
          />
        </View>
      ))}
    </ScrollView>
  );
}

function TaskBoardCard({
  info,
  members,
  onOpenTask,
  onMoveTask,
}: {
  info: DraggableRenderItemInfo<TeamTask>;
  members: TeamMember[];
  onOpenTask: (taskId: string) => void;
  onMoveTask: (taskId: string, status: TeamTaskStatusValue) => void;
}) {
  const { t } = useTranslation();
  const task = info.item;
  const assignee =
    getMemberName(members, task.assigneeMemberId) ?? t("team.tasks.claim.unassigned");
  const claimant = getMemberName(members, task.claimantMemberId) ?? t("team.tasks.claim.none");
  const handleOpen = useCallback(() => {
    onOpenTask(task.id);
  }, [onOpenTask, task.id]);
  const handleDrag = useCallback(() => {
    info.drag();
  }, [info]);

  return (
    <Pressable
      onPress={handleOpen}
      style={({ hovered, pressed }) => [
        styles.card,
        info.isActive ? styles.activeCard : null,
        hovered ? styles.hoverCard : null,
        pressed ? styles.pressedCard : null,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{`#${task.seq} ${task.title}`}</Text>
        <View style={styles.cardActions}>
          <Pressable
            onLongPress={handleDrag}
            style={styles.dragHandle}
            accessibilityRole="button"
            accessibilityLabel={t("team.tasks.drag")}
            {...(info.dragHandleProps?.attributes ?? {})}
            {...(info.dragHandleProps?.listeners ?? {})}
            ref={info.dragHandleProps?.setActivatorNodeRef as never}
          >
            <GripVertical size={14} color={stylesTheme.icon.color} />
          </Pressable>
          <DropdownMenu>
            <DropdownMenuTrigger style={styles.menuTrigger}>
              <MoreVertical size={14} color={stylesTheme.icon.color} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" width={220}>
              {TEAM_TASK_STATUS_VALUES.filter((status) => status !== task.status).map((status) => (
                <DropdownMenuItem key={status} onSelect={() => onMoveTask(task.id, status)}>
                  {t("team.tasks.moveTo", { status: t(`team.tasks.status.${status}`) })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </View>
      <Text style={styles.metaText}>
        {t("team.tasks.detail.assignee")}: {assignee}
      </Text>
      <Text style={styles.metaText}>
        {t("team.tasks.detail.claimant")}: {claimant}
      </Text>
      {(task.dependsOnTaskIds?.length ?? 0) > 0 ? (
        <Text style={styles.metaText}>
          {t("team.tasks.detail.dependencies")}: {task.dependsOnTaskIds?.length}
        </Text>
      ) : null}
    </Pressable>
  );
}

function getMemberName(members: TeamMember[], memberId: string | null): string | null {
  return members.find((member) => member.id === memberId)?.name ?? null;
}

const styles = StyleSheet.create((theme) => ({
  boardContent: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  column: {
    width: {
      xs: "100%",
      sm: "100%",
      md: 280,
    },
    gap: theme.spacing[3],
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  columnTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  columnList: {
    gap: theme.spacing[3],
  },
  emptyCard: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
  },
  card: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  activeCard: {
    backgroundColor: theme.colors.surface2,
  },
  hoverCard: {
    backgroundColor: theme.colors.surface2,
  },
  pressedCard: {
    backgroundColor: theme.colors.surface3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  cardTitle: {
    color: theme.colors.foreground,
    flex: 1,
    fontSize: theme.fontSize.sm,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  dragHandle: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
  },
  menuTrigger: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
  },
  metaText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));

const stylesTheme = StyleSheet.create((theme) => ({
  icon: {
    color: theme.colors.foregroundMuted,
  },
}));
