import type { TeamChannel } from "@getpaseo/protocol/team/types";

export interface ChannelFormState {
  name: string;
  purpose: string;
  submitError: string | null;
}

export interface ChannelFormModel {
  getState: () => ChannelFormState;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
  setName: (value: string) => void;
  setPurpose: (value: string) => void;
  setSubmitError: (value: string | null) => void;
  hasNameConflict: () => boolean;
  toCreateInput: () => { name: string; purpose?: string };
  toUpdateInput: () => { name: string; purpose: string | null };
}

export function openChannelForm(input: {
  channel?: TeamChannel | null;
  channels: TeamChannel[];
}): ChannelFormModel {
  let listeners = new Set<() => void>();
  const channel = input.channel ?? null;
  const takenNames = new Set(
    input.channels.filter((entry) => entry.id !== channel?.id).map((entry) => entry.name),
  );
  let state: ChannelFormState = {
    name: channel?.name ?? "",
    purpose: channel?.purpose ?? "",
    submitError: null,
  };
  let published = { ...state };

  const publish = () => {
    published = { ...state };
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
    setName: (value) => {
      state = { ...state, name: value, submitError: null };
      publish();
    },
    setPurpose: (value) => {
      state = { ...state, purpose: value, submitError: null };
      publish();
    },
    setSubmitError: (value) => {
      state = { ...state, submitError: value };
      publish();
    },
    hasNameConflict: () => takenNames.has(state.name),
    toCreateInput: () => {
      const purpose = state.purpose.trim();
      return {
        name: state.name,
        purpose: purpose || undefined,
      };
    },
    toUpdateInput: () => {
      const purpose = state.purpose.trim();
      return {
        name: state.name,
        purpose: purpose || null,
      };
    },
  };
}
