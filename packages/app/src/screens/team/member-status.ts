import type { TeamMember } from "@getpaseo/protocol/team/types";
import type { TeamStatusTone } from "@/screens/team/ui/status-dot";

/**
 * Maps a member onto one of the design's four dot/pill tones.
 *
 * The human identity is always `you` regardless of status — it is a built-in
 * identity, not a runtime, so it never reads as running or stopped.
 * `unavailable` shares the danger tone with `stopped`: in the design that is
 * `@qa`, whose worktree was removed on merge, shown in red with a "needs a
 * workspace" pill.
 */
export function memberStatusTone(member: TeamMember): TeamStatusTone {
  if (member.kind === "human") {
    return "you";
  }
  switch (member.status) {
    case "running":
      return "working";
    case "stopped":
    case "unavailable":
      return "stopped";
    default:
      return "idle";
  }
}

export interface TeamMemberStatusLabels {
  idle: string;
  working: string;
  stopped: string;
  unavailable: string;
  you: string;
}

/** The label shown in the status pill beside a member handle. */
export function memberStatusLabel(member: TeamMember, labels: TeamMemberStatusLabels): string {
  if (member.kind === "human") {
    return labels.you;
  }
  switch (member.status) {
    case "running":
      return labels.working;
    case "stopped":
      return labels.stopped;
    case "unavailable":
      return labels.unavailable;
    default:
      return labels.idle;
  }
}

/** Members render as `@handle` throughout the Team surface. */
export function memberHandle(member: TeamMember): string {
  return member.name.startsWith("@") ? member.name : `@${member.name}`;
}
