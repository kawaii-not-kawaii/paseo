import { describe, expect, it } from "vitest";
import { selectTeamServerId } from "./team-host-selection";

const LOCAL = "local:managed";
const REMOTE = "srv_QSQ7ipm7Dh-P";

describe("selectTeamServerId", () => {
  it("skips a disabled local placeholder host that never published server_info", () => {
    const ids = [LOCAL, REMOTE];
    const team = new Map([[REMOTE, true]]);
    expect(selectTeamServerId(ids, team, undefined)).toBe(REMOTE);
  });

  it("prefers the active workspace's host when that host publishes the capability", () => {
    const ids = [REMOTE, "srv_other"];
    const team = new Map([
      [REMOTE, true],
      ["srv_other", true],
    ]);
    expect(selectTeamServerId(ids, team, "srv_other")).toBe("srv_other");
  });

  it("falls back off an active host that does not publish the capability", () => {
    const ids = [LOCAL, REMOTE];
    const team = new Map([[REMOTE, true]]);
    expect(selectTeamServerId(ids, team, LOCAL)).toBe(REMOTE);
  });

  it("returns null when no host publishes the capability", () => {
    expect(selectTeamServerId([LOCAL, REMOTE], new Map(), REMOTE)).toBeNull();
  });
});
