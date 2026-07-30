/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import { SegmentedShell } from "@/screens/team/ui/segmented-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { sortTasksBySeq, type TeamTaskStatusValue } from "./task-status";

export type TaskViewMode = "board" | "list";

export function TaskViewToggle({
  value,
  onChange,
}: {
  value: TaskViewMode;
  onChange: (value: TaskViewMode) => void;
}) {
  const { t } = useTranslation();
  const options = useMemo(
    () => [
      { value: "board" as TaskViewMode, label: t("team.tasks.views.board") },
      { value: "list" as TaskViewMode, label: t("team.tasks.views.list") },
    ],
    [t],
  );

  return <SegmentedShell options={options} value={value} onValueChange={onChange} size="sm" />;
}

export function TaskList({
  tasks,
  members,
  allTasks,
  onOpenTask,
}: {
  tasks: TeamTask[];
  members: TeamMember[];
  allTasks: TeamTask[];
  onOpenTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const tasksById = useMemo(
    () => new Map(allTasks.map((task) => [task.id, task] as const)),
    [allTasks],
  );
  const sortedTasks = useMemo(() => [...tasks].sort(sortTasksBySeq), [tasks]);

  if (sortedTasks.length === 0) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowHint}>{t("team.tasks.empty")}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={settingsStyles.card}>
      {sortedTasks.map((task, index) => (
        <TaskListRow
          key={task.id}
          task={task}
          bordered={index > 0}
          members={members}
          tasksById={tasksById}
          onOpenTask={onOpenTask}
        />
      ))}
    </View>
  );
}

function TaskListRow({
  task,
  bordered,
  members,
  tasksById,
  onOpenTask,
}: {
  task: TeamTask;
  bordered: boolean;
  members: TeamMember[];
  tasksById: Map<string, TeamTask>;
  onOpenTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    onOpenTask(task.id);
  }, [onOpenTask, task.id]);
  const assignee =
    getMemberName(members, task.assigneeMemberId) ?? t("team.tasks.claim.unassigned");
  const claimant = getMemberName(members, task.claimantMemberId) ?? t("team.tasks.claim.none");
  const blockers = (task.dependsOnTaskIds ?? [])
    .map((dependencyId) => tasksById.get(dependencyId))
    .filter((dependency): dependency is TeamTask =>
      Boolean(dependency && dependency.status !== "done"),
    );

  return (
    <Pressable
      onPress={handlePress}
      style={({ hovered, pressed }) => [
        settingsStyles.row,
        bordered ? settingsStyles.rowBorder : null,
        hovered ? styles.hoverRow : null,
        pressed ? styles.pressedRow : null,
      ]}
    >
      <View style={settingsStyles.rowContent}>
        <View style={styles.titleRow}>
          <Text style={settingsStyles.rowTitle}>{`#${task.seq} ${task.title}`}</Text>
          <StatusBadge
            label={t(`team.tasks.status.${task.status}`)}
            variant={getStatusVariant(task.status)}
          />
        </View>
        <Text style={settingsStyles.rowHint}>
          {t("team.tasks.detail.assignee")}: {assignee}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("team.tasks.detail.claimant")}: {claimant}
        </Text>
        {(task.dependsOnTaskIds?.length ?? 0) > 0 ? (
          <Text style={settingsStyles.rowHint}>
            {t("team.tasks.detail.dependencies")}:{" "}
            {(task.dependsOnTaskIds ?? [])
              .map((dependencyId) => tasksById.get(dependencyId))
              .filter((dependency): dependency is TeamTask => Boolean(dependency))
              .map((dependency) => `#${dependency.seq}`)
              .join(", ")}
          </Text>
        ) : null}
        {blockers.length > 0 ? (
          <Text style={styles.blockedText}>
            {t("team.tasks.blockedBy", {
              refs: blockers.map((dependency) => `#${dependency.seq}`).join(", "),
            })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function getMemberName(members: TeamMember[], memberId: string | null): string | null {
  return members.find((member) => member.id === memberId)?.name ?? null;
}

function getStatusVariant(status: TeamTaskStatusValue): "success" | "error" | "muted" {
  switch (status) {
    case "done":
      return "success";
    case "in_review":
      return "error";
    default:
      return "muted";
  }
}

const styles = StyleSheet.create((theme) => ({
  hoverRow: {
    backgroundColor: theme.colors.surface2,
  },
  pressedRow: {
    backgroundColor: theme.colors.surface3,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  blockedText: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
}));
