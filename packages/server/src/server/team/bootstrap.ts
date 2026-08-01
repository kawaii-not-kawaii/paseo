import type { AgentManager } from "../agent/agent-manager.js";
import type { WorkspaceRegistry } from "../workspace-registry.js";
import type { VoiceAssistantWebSocketServer } from "../websocket-server.js";
import type { ServerInfoStatusPayload } from "../messages.js";
import type { Logger } from "pino";
import { MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import { configureTeamRuntime } from "./team-session.js";

let configuredTeamService: TeamService | null = null;

export function createTeamServiceForDaemon(options: {
  paseoHome: string;
  agentManager: AgentManager;
  workspaceRegistry: WorkspaceRegistry;
  logger: Logger;
}): TeamService {
  const service = new TeamService({ paseoHome: options.paseoHome });
  configuredTeamService = service;
  configureTeamRuntime(
    service,
    new MemberLifecycle({
      teamService: service,
      agentManager: options.agentManager,
      workspaceRegistry: options.workspaceRegistry,
      logger: options.logger,
    }),
  );
  return service;
}

export function getConfiguredTeamService(): TeamService {
  if (!configuredTeamService) {
    throw new Error("Team service is not configured");
  }
  return configuredTeamService;
}

export function getConfiguredTeamServiceOrNull(): TeamService | null {
  return configuredTeamService;
}

export function setConfiguredTeamServiceForTests(service: TeamService | null): void {
  configuredTeamService = service;
  if (service) {
    configureTeamRuntime(service);
  }
}

/**
 * Publishes the `team` capability, but only while members will actually receive the Paseo MCP
 * server.
 *
 * Members coordinate exclusively through the `team_*` MCP tools. When MCP injection is off those
 * tools never reach the member's runtime, so a mentioned member does its work and goes silent —
 * no error, no channel message, nothing to see. That silence is what SC-002 failed on, and it is
 * indistinguishable from a model that simply chose not to post.
 *
 * `isTeamToolInjectionEnabled` is read per request rather than captured, because
 * `mcp.injectIntoAgents` can be toggled on a live daemon.
 */
export function installTeamServerInfo(
  server: VoiceAssistantWebSocketServer,
  isTeamToolInjectionEnabled: () => boolean,
): void {
  const original = server["buildServerInfoStatusPayload"].bind(
    server,
  ) as () => ServerInfoStatusPayload;

  server["buildServerInfoStatusPayload"] = () => {
    const payload = original();
    return {
      ...payload,
      features: {
        ...payload.features,
        team: isTeamToolInjectionEnabled(),
        teamChannelReads: true,
        teamChannelMembership: true,
      },
    };
  };
}
