/* eslint-disable react/jsx-max-depth, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop, max-nested-callbacks, no-shadow */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { TeamMember, TeamRoleTemplate } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { useIsCompactFormFactor } from "@/constants/layout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { createControlGeometry, type FieldControlSize } from "@/components/ui/control-geometry";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  SelectFieldTrigger,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useProjects } from "@/hooks/use-projects";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { settingsStyles } from "@/styles/settings";
import {
  assignTeamMember,
  createTeamMember,
  listTeamMemberTemplates,
  listTeamMembers,
  removeTeamMember,
  updateTeamMember,
} from "@/screens/team/team-client";
import { type MemberFormSnapshot, type MemberProjectAssignmentState } from "./member-form-model";
import type {
  MemberAssignmentRecord,
  MemberProjectOption,
  TeamMemberProposal,
} from "./member-types";
import { useMemberFormModel } from "./use-member-form-model";

interface MemberFormProps {
  visible: boolean;
  mode: "create" | "edit";
  client: DaemonClient | null;
  serverId: string | null;
  currentProjectId: string;
  member?: TeamMember | null;
  proposal?: TeamMemberProposal | null;
  onClose: () => void;
  onSaved?: (member: TeamMember | null) => void;
}

interface AssignmentCatalogState {
  status: "loading" | "loaded" | "error";
  assignments: MemberAssignmentRecord[];
  error: string | null;
}

function buildOpenKey(props: MemberFormProps): string {
  const proposalKey = props.proposal?.templateId ?? props.proposal?.name ?? "";
  return `${props.mode}:${props.member?.id ?? "new"}:${proposalKey}:${props.currentProjectId}`;
}

function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProjectOptions(
  serverId: string,
  currentProjectId: string,
  projects: ReturnType<typeof useProjects>["projects"],
): MemberProjectOption[] {
  return projects
    .map((project): MemberProjectOption | null => {
      const host = project.hosts.find((entry) => entry.serverId === serverId);
      if (!host) {
        return null;
      }
      return {
        projectId: project.projectKey,
        projectName: project.projectName,
        required: project.projectKey === currentProjectId,
        workspaceOptions: host.workspaces.map((workspace) => ({
          id: workspace.id,
          label: workspace.title ?? workspace.name,
          description: workspace.currentBranch ?? undefined,
        })),
      };
    })
    .filter((project) => project !== null);
}

function buildSnapshot(input: {
  mode: "create" | "edit";
  currentProjectId: string;
  member?: TeamMember | null;
  proposal?: TeamMemberProposal | null;
  projects: MemberProjectOption[];
  assignments: MemberAssignmentRecord[];
  templates: TeamRoleTemplate[];
  providerEntries: NonNullable<ReturnType<typeof useProvidersSnapshot>["entries"]>;
}): MemberFormSnapshot {
  return {
    mode: input.mode,
    currentProjectId: input.currentProjectId,
    member: input.member,
    proposal: input.proposal,
    projects: input.projects,
    assignments: input.assignments,
    templates: input.templates,
    providerEntries: input.providerEntries,
  };
}

function buildAssignmentOptions(
  assignment: MemberProjectAssignmentState,
): SelectFieldOption<string>[] {
  return assignment.workspaceOptions.map((workspace) => ({
    id: workspace.id,
    value: workspace.id,
    label: workspace.label,
    description: workspace.description,
  }));
}

function MemberFormLoading({ label }: { label: string }) {
  return (
    <View style={styles.loadingState}>
      <LoadingSpinner size="large" color={styles.spinner.color} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

function OpenMemberForm({
  client,
  serverId,
  currentProjectId,
  visible,
  mode,
  member,
  proposal,
  onClose,
  onSaved,
}: MemberFormProps) {
  const { t } = useTranslation();
  const projectsResult = useProjects({ enabled: visible && Boolean(serverId) });
  const hostProjects = useMemo(
    () =>
      serverId ? buildProjectOptions(serverId, currentProjectId, projectsResult.projects) : [],
    [currentProjectId, projectsResult.projects, serverId],
  );
  const providerSnapshot = useProvidersSnapshot(serverId, { enabled: visible });
  const [templatesState, setTemplatesState] = useState<{
    status: "loading" | "loaded" | "error";
    templates: TeamRoleTemplate[];
    error: string | null;
  }>({ status: "loading", templates: [], error: null });
  const [assignmentsState, setAssignmentsState] = useState<AssignmentCatalogState>({
    status: "loading",
    assignments: [],
    error: null,
  });

  useEffect(() => {
    if (!visible || !client) {
      return;
    }
    let cancelled = false;
    setTemplatesState({ status: "loading", templates: [], error: null });
    void listTeamMemberTemplates(client)
      .then((templates) => {
        if (cancelled) {
          return undefined;
        }
        setTemplatesState({ status: "loaded", templates, error: null });
        return undefined;
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setTemplatesState({
          status: "error",
          templates: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, visible]);

  useEffect(() => {
    if (!visible || !client || hostProjects.length === 0) {
      return;
    }
    let cancelled = false;
    setAssignmentsState({ status: "loading", assignments: [], error: null });
    void Promise.all(
      hostProjects.map(async (project) => ({
        projectId: project.projectId,
        members: await listTeamMembers(client, project.projectId),
      })),
    )
      .then((projectMembers) => {
        if (cancelled) {
          return undefined;
        }
        if (!member) {
          setAssignmentsState({
            status: "loaded",
            assignments: [{ projectId: currentProjectId, homeWorkspaceId: null }],
            error: null,
          });
          return undefined;
        }
        const assignments = projectMembers
          .map((project) => {
            const assignedMember = project.members.find((candidate) => candidate.id === member.id);
            return assignedMember
              ? {
                  projectId: project.projectId,
                  homeWorkspaceId: assignedMember.homeWorkspaceId ?? null,
                }
              : null;
          })
          .filter((assignment): assignment is MemberAssignmentRecord => assignment !== null);
        setAssignmentsState({ status: "loaded", assignments, error: null });
        return undefined;
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setAssignmentsState({
          status: "error",
          assignments: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, currentProjectId, hostProjects, member, visible]);

  const isDataLoading =
    projectsResult.isLoading ||
    templatesState.status === "loading" ||
    assignmentsState.status === "loading" ||
    providerSnapshot.isLoading;
  const dataError =
    templatesState.error ?? assignmentsState.error ?? providerSnapshot.error ?? null;

  if (isDataLoading) {
    return (
      <AdaptiveModalSheet
        visible={visible}
        header={{
          title: t(
            mode === "create" ? "team.members.form.createTitle" : "team.members.form.editTitle",
          ),
        }}
        onClose={onClose}
        desktopMaxWidth={720}
      >
        <MemberFormLoading label={t("common.states.loading")} />
      </AdaptiveModalSheet>
    );
  }

  if (!serverId || !client || dataError) {
    return (
      <AdaptiveModalSheet
        visible={visible}
        header={{
          title: t(
            mode === "create" ? "team.members.form.createTitle" : "team.members.form.editTitle",
          ),
        }}
        onClose={onClose}
        desktopMaxWidth={720}
      >
        <Text style={styles.submitError}>{dataError ?? t("team.needsHostUpgrade")}</Text>
      </AdaptiveModalSheet>
    );
  }

  return (
    <LoadedMemberForm
      client={client}
      serverId={serverId}
      currentProjectId={currentProjectId}
      visible={visible}
      mode={mode}
      member={member}
      proposal={proposal}
      onClose={onClose}
      onSaved={onSaved}
      existingAssignments={assignmentsState.assignments}
      snapshot={buildSnapshot({
        mode,
        currentProjectId,
        member,
        proposal,
        projects: hostProjects,
        assignments: assignmentsState.assignments,
        templates: templatesState.templates,
        providerEntries: providerSnapshot.entries ?? [],
      })}
      providerSnapshot={providerSnapshot}
    />
  );
}

function LoadedMemberForm({
  client,
  serverId,
  currentProjectId,
  visible,
  mode,
  member,
  onClose,
  onSaved,
  existingAssignments: previousAssignments,
  snapshot,
  providerSnapshot,
}: MemberFormProps & {
  existingAssignments: MemberAssignmentRecord[];
  snapshot: MemberFormSnapshot;
  providerSnapshot: ReturnType<typeof useProvidersSnapshot>;
}) {
  const { t } = useTranslation();
  const controlSize: FieldControlSize = useIsCompactFormFactor() ? "md" : "sm";
  const model = useMemberFormModel(snapshot);
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const [isPending, setIsPending] = useState(false);

  const modeOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      state.modeOptions.map((modeOption) => ({
        id: modeOption.id,
        value: modeOption.id,
        label: modeOption.label,
      })),
    [state.modeOptions],
  );
  const selectedModeDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selectedMode = state.modeOptions.find(
      (modeOption) => modeOption.id === state.selectedModeId,
    );
    return selectedMode ? { label: selectedMode.label } : null;
  }, [state.modeOptions, state.selectedModeId]);
  const selectedModelLabel = useMemo(() => {
    const provider = state.modelSelectorProviders.find(
      (entry) => entry.id === state.selectedProvider,
    );
    if (!provider || provider.modelSelection.kind !== "models") {
      return t("providerSelection.selectModel");
    }
    return (
      provider.modelSelection.rows.find((row) => row.modelId === state.selectedModel)?.modelLabel ??
      provider.modelSelection.rows[0]?.modelLabel ??
      t("providerSelection.selectModel")
    );
  }, [state.modelSelectorProviders, state.selectedModel, state.selectedProvider, t]);

  const renderModelTrigger = useCallback(
    ({
      disabled,
      hovered,
      isOpen,
      pressed,
    }: {
      selectedModelLabel: string;
      onPress: () => void;
      disabled: boolean;
      isOpen: boolean;
      hovered: boolean;
      pressed: boolean;
    }): ReactNode => (
      <SelectFieldTrigger
        label={selectedModelLabel}
        placeholder={t("providerSelection.selectModel")}
        isPlaceholder={!state.selectedProvider}
        disabled={disabled}
        active={hovered || pressed || isOpen}
        size={controlSize}
        testID="team-member-model-trigger"
      />
    ),
    [controlSize, selectedModelLabel, state.selectedProvider, t],
  );

  const handleModelOpen = useCallback(() => {
    providerSnapshot.refetchIfStale(state.selectedProvider);
  }, [providerSnapshot, state.selectedProvider]);

  const handleSelectModel = useCallback(
    (provider: AgentProvider, modelId: string) => {
      model.setProviderModel(provider, modelId);
    },
    [model],
  );

  // eslint-disable-next-line complexity
  const handleSubmit = useCallback(async () => {
    if (!client || isPending || !state.canSubmit) {
      return;
    }
    setIsPending(true);
    model.setSubmitError(null);
    for (const assignment of state.assignments) {
      model.setProjectError(assignment.projectId, null);
    }

    const selectedAssignments = state.assignments.filter(
      (assignment) => assignment.enabled && assignment.homeWorkspaceId !== null,
    );
    const currentAssignment = selectedAssignments.find(
      (assignment) => assignment.projectId === currentProjectId,
    );
    if (!currentAssignment?.homeWorkspaceId || !state.selectedProvider) {
      model.setSubmitError(t("team.members.form.workspaceRequired"));
      setIsPending(false);
      return;
    }

    try {
      let savedMember = member ?? null;
      if (mode === "create") {
        savedMember = await createTeamMember({
          client,
          projectId: currentProjectId,
          name: state.name.trim(),
          description: normalizeOptionalText(state.description),
          provider: state.selectedProvider,
          model: state.selectedModel || null,
          homeWorkspaceId: currentAssignment.homeWorkspaceId,
        });
        if (!savedMember) {
          throw new Error(t("common.errors.unableToSave"));
        }
      }

      const memberId = savedMember?.id ?? member?.id;
      if (!memberId) {
        throw new Error(t("common.errors.unableToSave"));
      }

      const updatedMember = await updateTeamMember({
        client,
        memberId,
        name: state.name.trim(),
        description: normalizeNullableText(state.description),
        provider: state.selectedProvider,
        model: state.selectedModel || null,
        modeId: state.selectedModeId || null,
        rolePrompt: state.rolePrompt,
        templateId: state.selectedTemplateId,
      });

      const existingAssignments = new Map(
        previousAssignments.map(
          (assignment) => [assignment.projectId, assignment.homeWorkspaceId] as const,
        ),
      );

      for (const assignment of selectedAssignments) {
        if (!assignment.homeWorkspaceId) {
          continue;
        }
        const existingWorkspaceId = existingAssignments.get(assignment.projectId) ?? null;
        if (existingWorkspaceId === assignment.homeWorkspaceId) {
          continue;
        }
        try {
          await assignTeamMember({
            client,
            projectId: assignment.projectId,
            memberId,
            homeWorkspaceId: assignment.homeWorkspaceId,
          });
        } catch (error) {
          model.setProjectError(
            assignment.projectId,
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      }

      for (const assignment of previousAssignments) {
        if (assignment.projectId === currentProjectId) {
          continue;
        }
        if (selectedAssignments.some((selected) => selected.projectId === assignment.projectId)) {
          continue;
        }
        await removeTeamMember({ client, projectId: assignment.projectId, memberId });
      }

      onSaved?.(updatedMember ?? savedMember);
      onClose();
    } catch (error) {
      model.setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPending(false);
    }
  }, [
    client,
    currentProjectId,
    previousAssignments,
    isPending,
    member,
    mode,
    model,
    onClose,
    onSaved,
    state.assignments,
    state.canSubmit,
    state.description,
    state.name,
    state.rolePrompt,
    state.selectedModeId,
    state.selectedProvider,
    state.selectedModel,
    state.selectedTemplateId,
    t,
  ]);

  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: t(mode === "create" ? "team.members.form.createTitle" : "team.members.form.editTitle"),
    }),
    [mode, t],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      header={sheetHeader}
      onClose={onClose}
      desktopMaxWidth={720}
      testID="team-member-form"
    >
      <View style={styles.formBody}>
        <Field label={t("team.members.form.name")} testID="team-member-name-field">
          <FormTextInput
            initialValue={state.name}
            resetKey={`${mode}:${member?.id ?? "new"}:name`}
            onChangeText={model.setName}
            size={controlSize}
            editable={!isPending}
            testID="team-member-name-input"
          />
        </Field>

        <Field label={t("team.members.form.description")} testID="team-member-description-field">
          <FormTextInput
            initialValue={state.description}
            resetKey={`${mode}:${member?.id ?? "new"}:description`}
            onChangeText={model.setDescription}
            size={controlSize}
            editable={!isPending}
            multiline
            style={styles.descriptionInput}
            textAlignVertical="top"
            testID="team-member-description-input"
          />
        </Field>

        <SelectField
          label={t("team.members.form.template")}
          value={state.selectedTemplateId}
          selectedDisplay={
            state.templateOptions.find((template) => template.id === state.selectedTemplateId)
              ? {
                  label:
                    state.templateOptions.find(
                      (template) => template.id === state.selectedTemplateId,
                    )?.name ?? "",
                }
              : null
          }
          options={state.templateOptions.map((template) => ({
            id: template.id,
            value: template.id,
            label: template.name,
            description: template.description,
          }))}
          onChange={(templateId) => model.setTemplateId(templateId)}
          placeholder={t("team.members.form.templatePlaceholder")}
          emptyText={t("team.members.form.noTemplates")}
          size={controlSize}
          searchable={state.templateOptions.length > 6}
          title={t("team.members.form.template")}
          triggerTestID="team-member-template-trigger"
        />

        <Field label={t("team.members.form.runtimeAndModel")}>
          <CombinedModelSelector
            providers={state.modelSelectorProviders}
            selectedProvider={state.selectedProvider ?? ""}
            selectedModel={state.selectedModel}
            onSelect={handleSelectModel}
            isLoading={providerSnapshot.isLoading || providerSnapshot.isFetching}
            renderTrigger={renderModelTrigger}
            triggerFill
            serverId={serverId}
            onOpen={handleModelOpen}
            onRetryProvider={(provider) => void providerSnapshot.refresh([provider])}
            isRetryingProvider={providerSnapshot.isRefreshing}
            disabled={isPending}
          />
        </Field>

        <SelectField
          label={t("team.members.form.mode")}
          value={state.selectedModeId || null}
          selectedDisplay={selectedModeDisplay}
          options={modeOptions}
          onChange={(modeId) => model.setModeId(modeId)}
          placeholder={t("team.members.form.modePlaceholder")}
          emptyText={t("team.members.form.noModes")}
          size={controlSize}
          title={t("team.members.form.mode")}
          triggerTestID="team-member-mode-trigger"
          disabled={modeOptions.length === 0 || isPending}
        />

        <Field
          label={t("team.members.form.rolePrompt")}
          testID="team-member-form-role-prompt-field"
        >
          <FormTextInput
            initialValue={state.rolePrompt}
            resetKey={`${mode}:${member?.id ?? "new"}:rolePrompt`}
            onChangeText={model.setRolePrompt}
            size={controlSize}
            editable={!isPending}
            multiline
            style={styles.rolePromptInput}
            textAlignVertical="top"
            testID="team-member-form-role-prompt-input"
          />
        </Field>

        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>{t("team.members.form.assignments")}</Text>
          <View style={styles.assignmentList}>
            {state.assignments.map((assignment) => {
              const selectedWorkspaceDisplay = assignment.workspaceLabel
                ? { label: assignment.workspaceLabel }
                : null;
              return (
                <View key={assignment.projectId} style={settingsStyles.card}>
                  <View style={styles.assignmentCardBody}>
                    <View style={styles.assignmentHeader}>
                      <View style={styles.assignmentHeaderText}>
                        <Text style={settingsStyles.rowTitle}>{assignment.projectName}</Text>
                        {assignment.required ? (
                          <Text style={settingsStyles.rowHint}>
                            {t("team.members.form.currentProject")}
                          </Text>
                        ) : null}
                      </View>
                      <Switch
                        value={assignment.enabled}
                        onValueChange={(enabled) =>
                          model.setProjectEnabled(assignment.projectId, enabled)
                        }
                        disabled={assignment.required || isPending}
                        testID={`team-member-project-toggle-${assignment.projectId}`}
                      />
                    </View>
                    {assignment.enabled ? (
                      <SelectField
                        label={t("team.members.form.homeWorkspace")}
                        value={assignment.homeWorkspaceId}
                        selectedDisplay={selectedWorkspaceDisplay}
                        options={buildAssignmentOptions(assignment)}
                        onChange={(workspaceId) =>
                          model.setProjectWorkspace(assignment.projectId, workspaceId)
                        }
                        placeholder={t("team.members.form.workspacePlaceholder")}
                        emptyText={t("team.members.form.noWorkspaces")}
                        error={assignment.error}
                        size={controlSize}
                        title={t("team.members.form.homeWorkspace")}
                        triggerTestID={`team-member-project-workspace-${assignment.projectId}`}
                        disabled={assignment.workspaceOptions.length === 0 || isPending}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {state.submitError ? (
          <Text style={styles.submitError} testID="team-member-form-submit-error">
            {state.submitError}
          </Text>
        ) : null}

        <View style={styles.actionsRow}>
          <Button
            variant="secondary"
            style={styles.actionButton}
            onPress={onClose}
            disabled={isPending}
          >
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            style={styles.actionButton}
            onPress={handleSubmit}
            loading={isPending}
            disabled={!state.canSubmit || isPending}
          >
            {t(mode === "create" ? "team.members.form.create" : "common.actions.save")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

export function MemberForm(props: MemberFormProps) {
  if (!props.visible) {
    return null;
  }
  return <OpenMemberForm key={buildOpenKey(props)} {...props} />;
}

const styles = StyleSheet.create((theme) => {
  const geometry = createControlGeometry(theme);

  return {
    formBody: {
      gap: theme.spacing[4],
      paddingBottom: theme.spacing[2],
    },
    loadingState: {
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing[3],
      minHeight: 220,
    },
    loadingText: {
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.sm,
    },
    spinner: {
      color: theme.colors.foregroundMuted,
    },
    descriptionInput: {
      minHeight: 96,
    },
    rolePromptInput: {
      minHeight: 180,
    },
    assignmentList: {
      gap: theme.spacing[3],
    },
    assignmentCardBody: {
      gap: theme.spacing[3],
      padding: theme.spacing[4],
    },
    assignmentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing[3],
    },
    assignmentHeaderText: {
      flex: 1,
      gap: theme.spacing[1],
    },
    actionsRow: {
      flexDirection: "row",
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    actionButton: {
      flex: 1,
      minHeight: geometry.fieldControlMd.minHeight,
    },
    submitError: {
      color: theme.colors.statusDanger,
      fontSize: theme.fontSize.sm,
    },
  };
});
