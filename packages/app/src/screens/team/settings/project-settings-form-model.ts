import type { TeamProjectSettings } from "@getpaseo/protocol/team/types";

export interface ProjectSettingsFormSnapshot {
  settings: TeamProjectSettings;
}

export interface ProjectSettingsFormState {
  messageRetentionCap: string;
  handbackLimit: string;
  attemptTimeoutMinutes: string;
  noProgressLimit: string;
  showsRetentionWarning: boolean;
  canSubmit: boolean;
  submitError: string | null;
}

export interface ProjectSettingsFormModel {
  getState: () => ProjectSettingsFormState;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
  setMessageRetentionCap: (value: string) => void;
  setHandbackLimit: (value: string) => void;
  setAttemptTimeoutMinutes: (value: string) => void;
  setNoProgressLimit: (value: string) => void;
  setSubmitError: (value: string | null) => void;
  toSettings: () => TeamProjectSettings;
}

interface MutableProjectSettingsFormState extends ProjectSettingsFormState {
  initialRetentionCap: number;
  autoStartEnabled: boolean;
}

function toPositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

function toNonNegativeInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed >= 0 ? parsed : null;
}

function recalculate(state: MutableProjectSettingsFormState): void {
  const messageRetentionCap = toPositiveInt(state.messageRetentionCap);
  const handbackLimit = toNonNegativeInt(state.handbackLimit);
  const attemptTimeoutMinutes = toPositiveInt(state.attemptTimeoutMinutes);
  const noProgressLimit = toNonNegativeInt(state.noProgressLimit);

  state.showsRetentionWarning =
    messageRetentionCap !== null && messageRetentionCap < state.initialRetentionCap;
  state.canSubmit =
    messageRetentionCap !== null &&
    handbackLimit !== null &&
    attemptTimeoutMinutes !== null &&
    noProgressLimit !== null;
}

function cloneState(state: MutableProjectSettingsFormState): ProjectSettingsFormState {
  return {
    messageRetentionCap: state.messageRetentionCap,
    handbackLimit: state.handbackLimit,
    attemptTimeoutMinutes: state.attemptTimeoutMinutes,
    noProgressLimit: state.noProgressLimit,
    showsRetentionWarning: state.showsRetentionWarning,
    canSubmit: state.canSubmit,
    submitError: state.submitError,
  };
}

export function openProjectSettingsForm(
  snapshot: ProjectSettingsFormSnapshot,
): ProjectSettingsFormModel {
  let listeners = new Set<() => void>();
  let state: MutableProjectSettingsFormState = {
    messageRetentionCap: String(snapshot.settings.messageRetentionCap),
    handbackLimit: String(snapshot.settings.handbackLimit),
    attemptTimeoutMinutes: String(Math.floor(snapshot.settings.attemptTimeoutMs / 60_000)),
    noProgressLimit: String(snapshot.settings.noProgressLimit),
    showsRetentionWarning: false,
    canSubmit: false,
    submitError: null,
    initialRetentionCap: snapshot.settings.messageRetentionCap,
    autoStartEnabled: snapshot.settings.autoStartEnabled,
  };
  recalculate(state);

  function publish(): void {
    recalculate(state);
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getState: () => cloneState(state),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      listeners = new Set();
    },
    setMessageRetentionCap: (value) => {
      state.messageRetentionCap = value;
      publish();
    },
    setHandbackLimit: (value) => {
      state.handbackLimit = value;
      publish();
    },
    setAttemptTimeoutMinutes: (value) => {
      state.attemptTimeoutMinutes = value;
      publish();
    },
    setNoProgressLimit: (value) => {
      state.noProgressLimit = value;
      publish();
    },
    setSubmitError: (value) => {
      state.submitError = value;
      publish();
    },
    toSettings: () => {
      const messageRetentionCap = toPositiveInt(state.messageRetentionCap);
      const handbackLimit = toNonNegativeInt(state.handbackLimit);
      const attemptTimeoutMinutes = toPositiveInt(state.attemptTimeoutMinutes);
      const noProgressLimit = toNonNegativeInt(state.noProgressLimit);
      if (
        messageRetentionCap === null ||
        handbackLimit === null ||
        attemptTimeoutMinutes === null ||
        noProgressLimit === null
      ) {
        throw new Error("Project settings form is invalid.");
      }
      return {
        messageRetentionCap,
        handbackLimit,
        attemptTimeoutMs: attemptTimeoutMinutes * 60_000,
        noProgressLimit,
        autoStartEnabled: state.autoStartEnabled,
      };
    },
  };
}
