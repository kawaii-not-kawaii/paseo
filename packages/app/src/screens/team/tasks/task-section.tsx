/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import type { TeamMemberChanged, TeamTaskChanged } from "@getpaseo/protocol/team/rpc-schemas";
import { Plus } from "lucide-react-native";
import { listTeamMembers, resumeTeamProject } from "@/screens/team/team-client";
import { Button } from "@/components/ui/button";
import { TEAM_SUBHEADER_HEIGHT } from "@/screens/team/team-layout";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { TaskBoard } from "./task-board";
import { TaskDetailSheet } from "./task-detail";
import { TaskFilters } from "./task-filters-bar";
import { applyTaskFilters, type TaskFilterState } from "./task-filters";
import { TaskList, TaskViewToggle, type TaskViewMode } from "./task-list";
import { createTeamTask, listTeamTasks, updateTeamTask } from "./team-tasks-client";
import { type TeamTaskStatusValue } from "./task-status";

export function TeamTasksSection({
  client,
  projectId,
  handbackLimit = null,
}: {
  client: DaemonClient | null;
  projectId: string | null;
  handbackLimit?: number | null;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [filters, setFilters] = useState<TaskFilterState>({
    creatorMemberId: null,
    assigneeMemberId: null,
  });
  const [viewMode, setViewMode] = useState<TaskViewMode>("board");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client || !projectId) {
      setTasks([]);
      setMembers([]);
      return;
    }
    try {
      const [nextMembers, nextTasks] = await Promise.all([
        listTeamMembers(client, projectId),
        listTeamTasks({ client, projectId }),
      ]);
      setMembers(nextMembers);
      setTasks(nextTasks);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!client || !projectId) {
      return;
    }
    const unsubTask = client.on("team.task.changed", (event: TeamTaskChanged) => {
      if (event.payload.projectId !== projectId) {
        return;
      }
      setTasks((current) => upsertTask(current, event.payload.task));
    });
    const unsubMember = client.on("team.member.changed", (event: TeamMemberChanged) => {
      if (event.payload.projectId !== projectId) {
        return;
      }
      setMembers((current) => upsertMember(current, event.payload.member));
    });
    return () => {
      unsubTask();
      unsubMember();
    };
  }, [client, projectId]);

  const filteredTasks = useMemo(() => {
    const normalizedFilters = {
      ...filters,
      assigneeMemberId:
        filters.assigneeMemberId === "__unassigned__" ? null : filters.assigneeMemberId,
    };
    return applyTaskFilters(
      tasks.filter((task) =>
        filters.assigneeMemberId === "__unassigned__" ? task.assigneeMemberId === null : true,
      ),
      normalizedFilters,
    );
  }, [filters, tasks]);

  const handleMoveTask = useCallback(
    async (taskId: string, status: TeamTaskStatusValue) => {
      if (!client || !projectId) {
        return;
      }
      try {
        const updated = await updateTeamTask({ client, projectId, taskId, status });
        if (updated) {
          setTasks((current) => upsertTask(current, updated));
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    },
    [client, projectId],
  );

  /**
   * "New task" creates the task and immediately opens it in the detail sheet.
   *
   * ponytail: no separate create form — the detail sheet already edits title,
   * body, assignee, status and acceptance criteria, so a second form would
   * duplicate all of it. The cost is that abandoning the sheet leaves an
   * untitled task on the board. Add a real create form if that shows up in use.
   */
  const handleCreateTask = useCallback(async () => {
    if (!client || !projectId) {
      return;
    }
    try {
      const created = await createTeamTask({
        client,
        projectId,
        title: t("team.tasks.untitled"),
      });
      if (created) {
        setTasks((current) => upsertTask(current, created));
        setSelectedTaskId(created.id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId, t]);

  const handleResumeTask = useCallback(
    async (taskId: string) => {
      if (!client || !projectId) {
        return;
      }
      try {
        await resumeTeamProject({ client, projectId, taskId });
        await refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    },
    [client, projectId, refresh],
  );

  return (
    <View style={styles.container}>
      {/* 36px toolbar: view switcher, filters, count, then the primary action. */}
      <View style={styles.toolbar}>
        <TaskViewToggle value={viewMode} onChange={setViewMode} />
        <TaskFilters filters={filters} members={members} onChange={setFilters} />
        <Text style={styles.count}>{t("team.tasks.count", { count: filteredTasks.length })}</Text>
        <View style={styles.toolbarSpacer} />
        <Button
          variant="default"
          size="xs"
          leftIcon={Plus}
          onPress={handleCreateTask}
          disabled={!client || !projectId}
          testID="team-task-create-button"
        >
          {t("team.tasks.newTask")}
        </Button>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {viewMode === "board" ? (
        <TaskBoard
          tasks={filteredTasks}
          members={members}
          handbackLimit={handbackLimit}
          onOpenTask={setSelectedTaskId}
          onMoveTask={handleMoveTask}
          onResumeTask={handleResumeTask}
        />
      ) : (
        <TaskList
          tasks={filteredTasks}
          members={members}
          allTasks={tasks}
          onOpenTask={setSelectedTaskId}
        />
      )}
      <TaskDetailSheet
        visible={selectedTaskId !== null}
        client={client}
        projectId={projectId}
        taskId={selectedTaskId}
        tasks={tasks}
        members={members}
        onClose={() => setSelectedTaskId(null)}
        onTaskChange={(task) => {
          setTasks((current) => upsertTask(current, task));
        }}
      />
      {/*
        Board mode says "empty" with a drop target in every column, so the
        message would be a second, stranded copy of the same fact. Only the list
        needs it.
      */}
      {viewMode === "list" && filteredTasks.length === 0 && !error ? (
        <Text style={styles.empty}>{t("team.tasks.empty")}</Text>
      ) : null}
    </View>
  );
}

function upsertTask(current: TeamTask[], task: TeamTask): TeamTask[] {
  const next = new Map(current.map((entry) => [entry.id, entry] as const));
  next.set(task.id, task);
  return Array.from(next.values()).sort((left, right) => left.seq - right.seq);
}

function upsertMember(current: TeamMember[], member: TeamMember): TeamMember[] {
  const next = new Map(current.map((entry) => [entry.id, entry] as const));
  next.set(member.id, member);
  return Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  toolbar: {
    height: TEAM_SUBHEADER_HEIGHT,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  toolbarSpacer: {
    flex: 1,
  },
  count: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
  },
}));
