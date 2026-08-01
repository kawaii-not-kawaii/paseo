import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";

export interface ChannelFormState {
  name: string;
  purpose: string;
  memberIds: string[];
  submitError: string | null;
}

export interface ChannelFormModel {
  getState: () => ChannelFormState;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
  setName: (value: string) => void;
  setPurpose: (value: string) => void;
  setMemberEnabled: (memberId: string, enabled: boolean) => void;
  setSubmitError: (value: string | null) => void;
  hasNameConflict: () => boolean;
  toCreateInput: () => { name: string; purpose?: string; memberIds: string[] };
  toUpdateInput: () => { name: string; purpose: string | null; memberIds: string[] };
}

export function openChannelForm(input: {
  channel?: TeamChannel | null;
  channels: TeamChannel[];
  members: Array<Pick<TeamMember, "id" | "kind">>;
}): ChannelFormModel {
  let listeners = new Set<() => void>();
  const channel = input.channel ?? null;
  const takenNames = new Set(
    input.channels.filter((entry) => entry.id !== channel?.id).map((entry) => entry.name),
  );
  const availableMemberIds = new Set(
    input.members.filter((member) => member.kind !== "human").map((member) => member.id),
  );
  let state: ChannelFormState = {
    name: channel?.name ?? "",
    purpose: channel?.purpose ?? "",
    memberIds: (channel?.memberIds ?? []).filter((memberId) => availableMemberIds.has(memberId)),
    submitError: null,
  };
  let published = { ...state, memberIds: [...state.memberIds] };

  const publish = () => {
    published = { ...state, memberIds: [...state.memberIds] };
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
    setMemberEnabled: (memberId, enabled) => {
      if (!availableMemberIds.has(memberId)) {
        return;
      }
      state = {
        ...state,
        memberIds: enabled
          ? [...new Set([...state.memberIds, memberId])]
          : state.memberIds.filter((id) => id !== memberId),
        submitError: null,
      };
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
        memberIds: [...state.memberIds],
      };
    },
    toUpdateInput: () => {
      const purpose = state.purpose.trim();
      return {
        name: state.name,
        purpose: purpose || null,
        memberIds: [...state.memberIds],
      };
    },
  };
}
