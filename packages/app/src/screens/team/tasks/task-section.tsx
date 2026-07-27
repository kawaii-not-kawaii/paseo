/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import type { TeamMemberChanged, TeamTaskChanged } from "@getpaseo/protocol/team/rpc-schemas";
import { listTeamMembers } from "@/screens/team/team-client";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { TaskBoard } from "./task-board";
import { TaskDetailSheet } from "./task-detail";
import { TaskFilters } from "./task-filters-bar";
import { applyTaskFilters, type TaskFilterState } from "./task-filters";
import { TaskList, TaskViewToggle, type TaskViewMode } from "./task-list";
import { listTeamTasks, updateTeamTask } from "./team-tasks-client";
import { type TeamTaskStatusValue } from "./task-status";

export function TeamTasksSection({
  client,
  projectId,
}: {
  client: DaemonClient | null;
  projectId: string | null;
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

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <TaskViewToggle value={viewMode} onChange={setViewMode} />
        <TaskFilters filters={filters} members={members} onChange={setFilters} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {viewMode === "board" ? (
        <TaskBoard
          tasks={filteredTasks}
          members={members}
          onOpenTask={setSelectedTaskId}
          onMoveTask={handleMoveTask}
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
      {filteredTasks.length === 0 && !error ? (
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
    gap: theme.spacing[4],
  },
  controls: {
    gap: theme.spacing[3],
  },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
