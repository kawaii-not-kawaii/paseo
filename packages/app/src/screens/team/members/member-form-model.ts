import type {
  AgentMode,
  AgentProvider,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";
import type { TeamMember, TeamRoleTemplate } from "@getpaseo/protocol/team/types";
import {
  buildSelectableProviderSelectorProviders,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import type {
  MemberAssignmentRecord,
  MemberProjectOption,
  TeamMemberProposal,
} from "./member-types";

export interface MemberFormSnapshot {
  mode: "create" | "edit";
  currentProjectId: string;
  member?: TeamMember | null;
  proposal?: TeamMemberProposal | null;
  projects: readonly MemberProjectOption[];
  assignments: readonly MemberAssignmentRecord[];
  templates: readonly TeamRoleTemplate[];
  providerEntries: readonly ProviderSnapshotEntry[];
}

export interface MemberProjectAssignmentState {
  projectId: string;
  projectName: string;
  required: boolean;
  enabled: boolean;
  homeWorkspaceId: string | null;
  workspaceLabel: string | null;
  workspaceOptions: readonly {
    id: string;
    label: string;
    description?: string;
  }[];
  error: string | null;
}

export interface MemberFormState {
  mode: "create" | "edit";
  currentProjectId: string;
  name: string;
  description: string;
  rolePrompt: string;
  selectedTemplateId: string | null;
  templateOptions: readonly TeamRoleTemplate[];
  selectedProvider: AgentProvider | null;
  selectedModel: string;
  selectedModeId: string;
  modelSelectorProviders: ProviderSelectorProvider[];
  modeOptions: readonly AgentMode[];
  assignments: readonly MemberProjectAssignmentState[];
  canSubmit: boolean;
  submitError: string | null;
}

export interface MemberFormModel {
  getState: () => MemberFormState;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
  applyProjects: (projects: readonly MemberProjectOption[]) => void;
  applyAssignments: (assignments: readonly MemberAssignmentRecord[]) => void;
  applyTemplates: (templates: readonly TeamRoleTemplate[]) => void;
  applyProviderEntries: (entries: readonly ProviderSnapshotEntry[]) => void;
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  setRolePrompt: (value: string) => void;
  setTemplateId: (templateId: string | null) => void;
  setProviderModel: (provider: AgentProvider, modelId: string) => void;
  setModeId: (modeId: string) => void;
  setProjectEnabled: (projectId: string, enabled: boolean) => void;
  setProjectWorkspace: (projectId: string, workspaceId: string) => void;
  setSubmitError: (value: string | null) => void;
  setProjectError: (projectId: string, value: string | null) => void;
}

interface MutableMemberFormState extends MemberFormState {
  templateOptions: TeamRoleTemplate[];
  modelSelectorProviders: ProviderSelectorProvider[];
  modeOptions: AgentMode[];
  assignments: MemberProjectAssignmentState[];
}

function normalizeNullableText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function findTemplate(
  templates: readonly TeamRoleTemplate[],
  templateId: string | null,
): TeamRoleTemplate | null {
  if (!templateId) {
    return null;
  }
  return templates.find((template) => template.id === templateId) ?? null;
}

function buildAssignments(input: {
  projects: readonly MemberProjectOption[];
  assignments: readonly MemberAssignmentRecord[];
  currentProjectId: string;
}): MemberProjectAssignmentState[] {
  const assignmentsByProject = new Map(
    input.assignments.map(
      (assignment) => [assignment.projectId, assignment.homeWorkspaceId] as const,
    ),
  );
  return input.projects.map((project) => {
    const existingWorkspaceId = assignmentsByProject.get(project.projectId) ?? null;
    const enabled = project.required || existingWorkspaceId !== null;
    const defaultWorkspaceId = existingWorkspaceId ?? project.workspaceOptions[0]?.id ?? null;
    const workspaceId = enabled ? defaultWorkspaceId : null;
    const workspaceLabel =
      project.workspaceOptions.find((workspace) => workspace.id === workspaceId)?.label ?? null;
    return {
      projectId: project.projectId,
      projectName: project.projectName,
      required: project.required ?? false,
      enabled,
      homeWorkspaceId: workspaceId,
      workspaceLabel,
      workspaceOptions: project.workspaceOptions,
      error: null,
    };
  });
}

function findSelectableEntry(
  entries: readonly ProviderSnapshotEntry[],
  provider: AgentProvider | null,
): ProviderSnapshotEntry | null {
  const selectable = entries.filter((entry) => entry.enabled);
  if (selectable.length === 0) {
    return null;
  }
  if (!provider) {
    return selectable[0] ?? null;
  }
  return selectable.find((entry) => entry.provider === provider) ?? selectable[0] ?? null;
}

function resolveModelId(entry: ProviderSnapshotEntry | null, currentModel: string): string {
  if (!entry) {
    return "";
  }
  const models = entry.models ?? [];
  if (currentModel && models.some((model) => model.id === currentModel)) {
    return currentModel;
  }
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "";
}

function resolveModeId(entry: ProviderSnapshotEntry | null, currentModeId: string): string {
  const modes = entry?.modes ?? [];
  if (currentModeId && modes.some((mode) => mode.id === currentModeId)) {
    return currentModeId;
  }
  return modes[0]?.id ?? "";
}

function recalculateProviderState(
  state: MutableMemberFormState,
  entries: readonly ProviderSnapshotEntry[],
): void {
  const selectedEntry = findSelectableEntry(entries, state.selectedProvider);
  state.selectedProvider = selectedEntry?.provider ?? null;
  state.selectedModel = resolveModelId(selectedEntry, state.selectedModel);
  state.selectedModeId = resolveModeId(selectedEntry, state.selectedModeId);
  state.modelSelectorProviders = buildSelectableProviderSelectorProviders([...entries]);
  state.modeOptions = selectedEntry?.modes ?? [];
}

/**
 * Which requirement is keeping the submit button disabled, as an i18n key plus
 * params — the caller does the translating so this stays testable.
 *
 * Deliberately next to `recalculateCanSubmit`: the two must agree. A
 * requirement added there with no matching reason here puts the form back to a
 * disabled button that explains nothing, which is how a project with no
 * workspaces became an unexplained dead end.
 */
export interface MemberSubmitBlocker {
  key: string;
  params?: Record<string, string>;
}

export function describeSubmitBlocker(
  state: Pick<MemberFormState, "name" | "rolePrompt" | "selectedProvider" | "assignments">,
): MemberSubmitBlocker | null {
  if (state.name.trim().length === 0) {
    return { key: "team.members.form.blockedName" };
  }
  if (state.rolePrompt.trim().length === 0) {
    return { key: "team.members.form.blockedRolePrompt" };
  }
  if (state.selectedProvider === null) {
    return { key: "team.members.form.blockedRuntime" };
  }
  // Nothing inside the form can fix a project with no workspaces, so name the
  // project and say what has to happen outside it.
  const starved = state.assignments.find(
    (assignment) => assignment.enabled && assignment.workspaceOptions.length === 0,
  );
  if (starved) {
    return {
      key: "team.members.form.blockedNoWorkspaces",
      params: { project: starved.projectName },
    };
  }
  const unset = state.assignments.find(
    (assignment) => assignment.enabled && assignment.homeWorkspaceId === null,
  );
  if (unset) {
    return { key: "team.members.form.workspaceRequired" };
  }
  return null;
}

function recalculateCanSubmit(state: MutableMemberFormState): void {
  state.canSubmit =
    state.name.trim().length > 0 &&
    state.rolePrompt.trim().length > 0 &&
    state.selectedProvider !== null &&
    state.assignments.some(
      (assignment) =>
        assignment.enabled && assignment.homeWorkspaceId !== null && assignment.error === null,
    ) &&
    state.assignments.every(
      (assignment) => !assignment.enabled || assignment.homeWorkspaceId !== null,
    );
}

function cloneState(state: MutableMemberFormState): MemberFormState {
  return {
    ...state,
    templateOptions: [...state.templateOptions],
    modelSelectorProviders: [...state.modelSelectorProviders],
    modeOptions: [...state.modeOptions],
    assignments: state.assignments.map((assignment) => ({ ...assignment })),
  };
}

// eslint-disable-next-line complexity
export function openMemberForm(snapshot: MemberFormSnapshot): MemberFormModel {
  let listeners = new Set<() => void>();
  const proposal = snapshot.proposal ?? null;
  const member = snapshot.member ?? null;
  let state: MutableMemberFormState = {
    mode: snapshot.mode,
    currentProjectId: snapshot.currentProjectId,
    name: proposal?.name ?? member?.name ?? "",
    description: proposal?.description ?? normalizeNullableText(member?.description),
    rolePrompt: proposal?.rolePrompt ?? member?.rolePrompt ?? "",
    selectedTemplateId: proposal?.templateId ?? member?.templateId ?? null,
    templateOptions: [...snapshot.templates],
    selectedProvider: member?.provider ?? null,
    selectedModel: member?.model ?? "",
    selectedModeId: member?.modeId ?? "",
    modelSelectorProviders: [],
    modeOptions: [],
    assignments: buildAssignments({
      projects: snapshot.projects,
      assignments:
        snapshot.assignments.length > 0
          ? snapshot.assignments
          : [
              {
                projectId: snapshot.currentProjectId,
                homeWorkspaceId: member?.homeWorkspaceId ?? null,
              },
            ],
      currentProjectId: snapshot.currentProjectId,
    }),
    canSubmit: false,
    submitError: null,
  };
  recalculateProviderState(state, snapshot.providerEntries);
  recalculateCanSubmit(state);
  // See the note in project-settings-form-model.ts: this is a `useSyncExternalStore` getSnapshot,
  // so it has to be reference-stable between publishes or the form loops until React throws.
  let published = cloneState(state);

  const publish = () => {
    recalculateCanSubmit(state);
    published = cloneState(state);
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getState: () => published,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      listeners = new Set();
    },
    applyProjects: (projects) => {
      state = {
        ...state,
        assignments: buildAssignments({
          projects,
          assignments: state.assignments.map((assignment) => ({
            projectId: assignment.projectId,
            homeWorkspaceId: assignment.enabled ? assignment.homeWorkspaceId : null,
          })),
          currentProjectId: state.currentProjectId,
        }),
      };
      publish();
    },
    applyAssignments: (assignments) => {
      state = {
        ...state,
        assignments: buildAssignments({
          projects: state.assignments.map((assignment) => ({
            projectId: assignment.projectId,
            projectName: assignment.projectName,
            required: assignment.required,
            workspaceOptions: assignment.workspaceOptions,
          })),
          assignments,
          currentProjectId: state.currentProjectId,
        }),
      };
      publish();
    },
    applyTemplates: (templates) => {
      state = { ...state, templateOptions: [...templates] };
      publish();
    },
    applyProviderEntries: (entries) => {
      recalculateProviderState(state, entries);
      publish();
    },
    setName: (value) => {
      state = { ...state, name: value, submitError: null };
      publish();
    },
    setDescription: (value) => {
      state = { ...state, description: value, submitError: null };
      publish();
    },
    setRolePrompt: (value) => {
      state = { ...state, rolePrompt: value, submitError: null };
      publish();
    },
    setTemplateId: (templateId) => {
      const template = findTemplate(state.templateOptions, templateId);
      state = {
        ...state,
        selectedTemplateId: templateId,
        rolePrompt: template?.rolePrompt ?? state.rolePrompt,
        submitError: null,
      };
      publish();
    },
    setProviderModel: (provider, modelId) => {
      state = {
        ...state,
        selectedProvider: provider,
        selectedModel: modelId,
        submitError: null,
      };
      publish();
    },
    setModeId: (modeId) => {
      state = { ...state, selectedModeId: modeId, submitError: null };
      publish();
    },
    setProjectEnabled: (projectId, enabled) => {
      state = {
        ...state,
        assignments: state.assignments.map((assignment) => {
          if (assignment.projectId !== projectId) {
            return assignment;
          }
          if (assignment.required) {
            return assignment;
          }
          const nextWorkspaceId = enabled
            ? (assignment.homeWorkspaceId ?? assignment.workspaceOptions[0]?.id ?? null)
            : null;
          const nextWorkspaceLabel =
            assignment.workspaceOptions.find((workspace) => workspace.id === nextWorkspaceId)
              ?.label ?? null;
          return {
            ...assignment,
            enabled,
            homeWorkspaceId: nextWorkspaceId,
            workspaceLabel: nextWorkspaceLabel,
            error: null,
          };
        }),
        submitError: null,
      };
      publish();
    },
    setProjectWorkspace: (projectId, workspaceId) => {
      state = {
        ...state,
        assignments: state.assignments.map((assignment) =>
          assignment.projectId === projectId
            ? {
                ...assignment,
                homeWorkspaceId: workspaceId,
                workspaceLabel:
                  assignment.workspaceOptions.find((workspace) => workspace.id === workspaceId)
                    ?.label ?? null,
                error: null,
              }
            : assignment,
        ),
        submitError: null,
      };
      publish();
    },
    setSubmitError: (value) => {
      state = { ...state, submitError: value };
      publish();
    },
    setProjectError: (projectId, value) => {
      const nextAssignments = [...state.assignments];
      const assignmentIndex = nextAssignments.findIndex(
        (assignment) => assignment.projectId === projectId,
      );
      if (assignmentIndex >= 0) {
        nextAssignments[assignmentIndex] = {
          ...nextAssignments[assignmentIndex],
          error: value,
        };
      }
      state = {
        ...state,
        assignments: nextAssignments,
      };
      publish();
    },
  };
}
