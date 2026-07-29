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
  toCreateInput: () => { name: string; purpose?: string };
}

export function openChannelForm(): ChannelFormModel {
  let listeners = new Set<() => void>();
  let state: ChannelFormState = {
    name: "",
    purpose: "",
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
    toCreateInput: () => {
      const purpose = state.purpose.trim();
      return {
        name: state.name,
        purpose: purpose || undefined,
      };
    },
  };
}
