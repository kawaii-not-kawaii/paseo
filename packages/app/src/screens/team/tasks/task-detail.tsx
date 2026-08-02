/* eslint-disable react/jsx-max-depth, react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  TeamMember,
  TeamTask,
  TeamTaskAcceptanceCriterion,
} from "@getpaseo/protocol/team/types";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { getTeamTask, setTeamTaskClaim, updateTeamTask } from "./team-tasks-client";
import { TEAM_TASK_STATUS_VALUES, type TeamTaskStatusValue } from "./task-status";

interface DraftTask {
  title: string;
  body: string;
  status: TeamTaskStatusValue;
  assigneeMemberId: string | null;
  claimantMemberId: string | null;
  dependencyIds: string[];
  acceptanceCriteriaText: string;
}

export function TaskDetailSheet({
  visible,
  client,
  projectId,
  taskId,
  tasks,
  members,
  onClose,
  onTaskChange,
}: {
  visible: boolean;
  client: DaemonClient | null;
  projectId: string | null;
  taskId: string | null;
  tasks: TeamTask[];
  members: TeamMember[];
  onClose: () => void;
  onTaskChange: (task: TeamTask) => void;
}) {
  const { t } = useTranslation();
  const [task, setTask] = useState<TeamTask | null>(null);
  const [draft, setDraft] = useState<DraftTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const tasksById = useMemo(
    () => new Map(tasks.map((entry) => [entry.id, entry] as const)),
    [tasks],
  );

  const loadTask = useCallback(async () => {
    if (!visible || !client || !projectId || !taskId) {
      setTask(null);
      setDraft(null);
      return;
    }
    try {
      const nextTask = await getTeamTask({ client, projectId, taskId });
      setTask(nextTask);
      setDraft(nextTask ? createDraft(nextTask) : null);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId, taskId, visible]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  const saveTask = useCallback(async () => {
    if (!client || !projectId || !taskId || !task || !draft) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateTeamTask({
        client,
        projectId,
        taskId,
        title: draft.title.trim(),
        body: draft.body.trim().length > 0 ? draft.body : null,
        status: draft.status,
        assigneeMemberId: draft.assigneeMemberId,
        dependsOn: draft.dependencyIds,
        acceptanceCriteria: parseAcceptanceCriteria(
          draft.acceptanceCriteriaText,
          task.acceptanceCriteria,
        ),
      });
      const claimed =
        draft.claimantMemberId !== task.claimantMemberId
          ? await setTeamTaskClaim({
              client,
              projectId,
              taskId,
              claimantMemberId: draft.claimantMemberId,
            })
          : updated;
      const finalTask = claimed ?? updated;
      if (finalTask) {
        setTask(finalTask);
        setDraft(createDraft(finalTask));
        onTaskChange(finalTask);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsSaving(false);
    }
  }, [client, draft, onTaskChange, projectId, task, taskId]);

  const setDraftField = useCallback(<K extends keyof DraftTask>(key: K, value: DraftTask[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const toggleDependency = useCallback((dependencyId: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return current.dependencyIds.includes(dependencyId)
        ? { ...current, dependencyIds: current.dependencyIds.filter((id) => id !== dependencyId) }
        : { ...current, dependencyIds: [...current.dependencyIds, dependencyId] };
    });
  }, []);

  const availableDependencies = useMemo(
    () =>
      tasks
        .filter((candidate) => candidate.id !== taskId)
        .sort((left, right) => left.seq - right.seq),
    [taskId, tasks],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={{
        title: task ? `#${task.seq} ${task.title}` : t("team.tasks.detail.title"),
      }}
      footer={
        <View style={styles.footer}>
          <Button variant="ghost" onPress={onClose}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            onPress={() => {
              void saveTask();
            }}
            disabled={!draft || !client || !projectId || !taskId}
            loading={isSaving}
          >
            {isSaving ? t("common.states.saving") : t("common.actions.save")}
          </Button>
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
        {task && draft ? (
          <>
            <Field label={t("team.tasks.detail.titleLabel")}>
              <FormTextInput
                initialValue={draft.title}
                resetKey={`${taskId}:title`}
                onChangeText={(value) => setDraftField("title", value)}
              />
            </Field>
            <Field label={t("team.tasks.detail.description")}>
              <FormTextInput
                initialValue={draft.body}
                resetKey={`${taskId}:body`}
                onChangeText={(value) => setDraftField("body", value)}
                multiline
                style={styles.multilineInput}
              />
            </Field>
            <Field label={t("team.tasks.detail.status")}>
              <SegmentedControl
                options={TEAM_TASK_STATUS_VALUES.map((status) => ({
                  value: status,
                  label: t(`team.tasks.status.${status}`),
                }))}
                value={draft.status}
                onValueChange={(value) => setDraftField("status", value as TeamTaskStatusValue)}
                size="sm"
              />
            </Field>
            <View style={styles.twoUp}>
              <Field label={t("team.tasks.detail.assignee")}>
                <MemberPicker
                  value={draft.assigneeMemberId}
                  members={members}
                  noneLabel={t("team.tasks.claim.unassigned")}
                  onSelect={(value) => setDraftField("assigneeMemberId", value)}
                />
              </Field>
              <Field label={t("team.tasks.detail.claimant")}>
                <MemberPicker
                  value={draft.claimantMemberId}
                  members={members}
                  noneLabel={t("team.tasks.claim.none")}
                  onSelect={(value) => setDraftField("claimantMemberId", value)}
                />
              </Field>
            </View>
            <View style={styles.metaRow}>
              <StatusBadge
                label={t("team.tasks.handbacks", { count: task.handbackCount })}
                variant={task.handbackCount > 0 ? "error" : "muted"}
              />
              {task.claimantMemberId && task.claimantMemberId !== task.assigneeMemberId ? (
                <StatusBadge label={t("team.tasks.claim.distinct")} variant="muted" />
              ) : null}
            </View>
            <Field label={t("team.tasks.detail.acceptanceCriteria")}>
              <FormTextInput
                initialValue={draft.acceptanceCriteriaText}
                resetKey={`${taskId}:acceptance`}
                onChangeText={(value) => setDraftField("acceptanceCriteriaText", value)}
                multiline
                style={styles.multilineInput}
              />
            </Field>
            <Field label={t("team.tasks.detail.dependencies")}>
              <View style={styles.dependencyList}>
                {draft.dependencyIds.length === 0 ? (
                  <Text style={styles.mutedText}>{t("team.tasks.dependencies.none")}</Text>
                ) : (
                  draft.dependencyIds.map((dependencyId) => {
                    const dependency = tasksById.get(dependencyId);
                    return (
                      <View key={dependencyId} style={styles.dependencyChip}>
                        <Text style={styles.dependencyText}>
                          {dependency ? `#${dependency.seq} ${dependency.title}` : dependencyId}
                        </Text>
                        <Pressable
                          onPress={() => toggleDependency(dependencyId)}
                          style={styles.removeDependency}
                        >
                          <X size={14} color={stylesTheme.icon.color} />
                        </Pressable>
                      </View>
                    );
                  })
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger style={styles.dependencyTrigger}>
                    <Text style={styles.dependencyTriggerText}>
                      {t("team.tasks.dependencies.add")}
                    </Text>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start" width={260}>
                    {availableDependencies.map((dependency) => (
                      <DropdownMenuItem
                        key={dependency.id}
                        selected={draft.dependencyIds.includes(dependency.id)}
                        onSelect={() => toggleDependency(dependency.id)}
                      >
                        {`#${dependency.seq} ${dependency.title}`}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </View>
            </Field>
            <Field label={t("team.tasks.detail.notes")}>
              <View style={styles.notesList}>
                {(task.notes ?? []).length === 0 ? (
                  <Text style={styles.mutedText}>{t("team.tasks.notes.empty")}</Text>
                ) : (
                  [...(task.notes ?? [])]
                    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
                    .map((note) => (
                      <View key={note.id} style={styles.noteCard}>
                        <Text style={styles.noteMeta}>
                          {getMemberName(members, note.authorMemberId) ?? note.authorMemberId}
                          {" · "}
                          {new Date(note.createdAt).toLocaleString()}
                        </Text>
                        <Text style={styles.noteBody}>{note.body}</Text>
                      </View>
                    ))
                )}
              </View>
            </Field>
          </>
        ) : (
          <Text style={styles.mutedText}>{t("common.states.loading")}</Text>
        )}
      </ScrollView>
    </AdaptiveModalSheet>
  );
}

function MemberPicker({
  value,
  members,
  noneLabel,
  onSelect,
}: {
  value: string | null;
  members: TeamMember[];
  noneLabel: string;
  onSelect: (memberId: string | null) => void;
}) {
  const selectedName = getMemberName(members, value) ?? noneLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger style={styles.memberTrigger}>
        <Text style={styles.memberTriggerText}>{selectedName}</Text>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={240}>
        <DropdownMenuItem onSelect={() => onSelect(null)}>{noneLabel}</DropdownMenuItem>
        {members.map((member) => (
          <DropdownMenuItem
            key={member.id}
            selected={member.id === value}
            onSelect={() => onSelect(member.id)}
          >
            {member.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function createDraft(task: TeamTask): DraftTask {
  return {
    title: task.title,
    body: task.body ?? "",
    status: task.status,
    assigneeMemberId: task.assigneeMemberId,
    claimantMemberId: task.claimantMemberId,
    dependencyIds: [...(task.dependsOnTaskIds ?? [])],
    acceptanceCriteriaText: (task.acceptanceCriteria ?? [])
      .map((criterion) => criterion.text)
      .join("\n"),
  };
}

function parseAcceptanceCriteria(
  text: string,
  existing?: TeamTaskAcceptanceCriterion[],
): TeamTaskAcceptanceCriterion[] {
  const existingCriteria = existing ?? [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      position: index,
      text: line,
      satisfiedAt:
        existingCriteria[index]?.text === line
          ? (existingCriteria[index]?.satisfiedAt ?? null)
          : null,
    }));
}

function getMemberName(members: TeamMember[], memberId: string | null): string | null {
  return members.find((member) => member.id === memberId)?.name ?? null;
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  twoUp: {
    flexDirection: {
      xs: "column",
      md: "row",
    },
    gap: theme.spacing[3],
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  memberTrigger: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  memberTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  dependencyList: {
    gap: theme.spacing[2],
  },
  dependencyChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  dependencyText: {
    color: theme.colors.foreground,
    flex: 1,
    fontSize: theme.fontSize.sm,
  },
  removeDependency: {
    padding: theme.spacing[1],
  },
  dependencyTrigger: {
    alignSelf: "flex-start",
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  dependencyTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  notesList: {
    gap: theme.spacing[2],
  },
  noteCard: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  noteMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  noteBody: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));

const stylesTheme = StyleSheet.create((theme) => ({
  icon: {
    color: theme.colors.foregroundMuted,
  },
}));
