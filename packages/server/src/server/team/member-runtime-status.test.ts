import { describe, expect, it } from "vitest";
import {
  resolveMemberRuntimeStatus,
  TEAM_MEMBER_ID_LABEL,
  TEAM_PROJECT_ID_LABEL,
} from "./member-lifecycle.js";
import type { ManagedAgent } from "../agent/agent-manager.js";

const TARGET = { projectId: "prj_1", memberId: "mem_1" };

function agent(lifecycle: string, labels: Record<string, string> = {}): ManagedAgent {
  return {
    id: "agent_1",
    lifecycle,
    labels: {
      [TEAM_PROJECT_ID_LABEL]: TARGET.projectId,
      [TEAM_MEMBER_ID_LABEL]: TARGET.memberId,
      ...labels,
    },
  } as unknown as ManagedAgent;
}

// `TeamService` hard-codes `idle`, so before this resolver existed a member read
// as idle even while it was working and every "working" affordance was dead.
describe("resolveMemberRuntimeStatus", () => {
  it("reports running while the member's agent runs", () => {
    expect(resolveMemberRuntimeStatus([agent("running")], TARGET)).toBe("running");
  });

  it("treats initializing as running, because something asked it to come up", () => {
    expect(resolveMemberRuntimeStatus([agent("initializing")], TARGET)).toBe("running");
  });

  it("reports idle for a live but unoccupied runtime", () => {
    expect(resolveMemberRuntimeStatus([agent("idle")], TARGET)).toBe("idle");
  });

  it("reports nothing when the runtime is closed or errored", () => {
    expect(resolveMemberRuntimeStatus([agent("closed")], TARGET)).toBeNull();
    expect(resolveMemberRuntimeStatus([agent("error")], TARGET)).toBeNull();
  });

  it("reports nothing when no agent belongs to the member", () => {
    expect(resolveMemberRuntimeStatus([], TARGET)).toBeNull();
    expect(
      resolveMemberRuntimeStatus(
        [agent("running", { [TEAM_MEMBER_ID_LABEL]: "someone_else" })],
        TARGET,
      ),
    ).toBeNull();
  });
});
