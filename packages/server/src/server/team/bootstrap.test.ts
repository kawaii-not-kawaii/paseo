import { describe, expect, test } from "vitest";
import type { ServerInfoStatusPayload } from "../messages.js";
import type { VoiceAssistantWebSocketServer } from "../websocket-server.js";
import { installTeamServerInfo } from "./bootstrap.js";

/**
 * The Team capability is a promise that members can coordinate. Members coordinate only through the
 * `team_*` MCP tools, so publishing `team: true` while MCP injection is off promises something the
 * daemon cannot deliver: mentioned members start, do the work, and never post. Nothing errors.
 */
describe("installTeamServerInfo", () => {
  function createServerStub(): {
    server: VoiceAssistantWebSocketServer;
    readFeatures: () => Record<string, unknown>;
  } {
    const stub = {
      buildServerInfoStatusPayload: (): ServerInfoStatusPayload =>
        ({ features: {} }) as ServerInfoStatusPayload,
    };
    const server = stub as unknown as VoiceAssistantWebSocketServer;
    return {
      server,
      readFeatures: () =>
        (
          server["buildServerInfoStatusPayload"]() as unknown as {
            features: Record<string, unknown>;
          }
        ).features,
    };
  }

  test("publishes team when members will receive the Paseo MCP server", () => {
    const { server, readFeatures } = createServerStub();
    installTeamServerInfo(server, () => true);
    expect(readFeatures().team).toBe(true);
  });

  test("withholds team when MCP injection is off, rather than shipping mute members", () => {
    const { server, readFeatures } = createServerStub();
    installTeamServerInfo(server, () => false);
    expect(readFeatures().team).toBe(false);
  });

  test("computes the capability per request rather than capturing it at install time", () => {
    const { server, readFeatures } = createServerStub();
    let injecting = false;
    installTeamServerInfo(server, () => injecting);

    expect(readFeatures().team).toBe(false);
    injecting = true;
    expect(readFeatures().team).toBe(true);

    // Note what this does NOT buy: `server_info` is delivered at hello and re-broadcast only on
    // speech-readiness changes, so toggling `mcp.injectIntoAgents` does not reach an already
    // connected client. Per-request evaluation only means the next connection gets the truth.
    // `MemberLifecycle.assertTeamToolsReachable` is what protects the stale-client case.
  });
});
