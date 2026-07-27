import type { VoiceAssistantWebSocketServer } from "../websocket-server.js";
import type { ServerInfoStatusPayload } from "../messages.js";
import { TeamService } from "./team-service.js";
import { configureTeamRuntime } from "./team-session.js";

let configuredTeamService: TeamService | null = null;

export function createTeamServiceForDaemon(paseoHome: string): TeamService {
  const service = new TeamService({ paseoHome });
  configuredTeamService = service;
  configureTeamRuntime(service);
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

export function installTeamServerInfo(server: VoiceAssistantWebSocketServer): void {
  const original = server["buildServerInfoStatusPayload"].bind(
    server,
  ) as () => ServerInfoStatusPayload;

  server["buildServerInfoStatusPayload"] = () => {
    const payload = original();
    return {
      ...payload,
      features: {
        ...payload.features,
        team: true,
      },
    };
  };
}
