import type { VoiceAssistantWebSocketServer } from "../websocket-server.js";
import type { ServerInfoStatusPayload } from "../messages.js";
import { TeamService } from "./team-service.js";
import { configureTeamRuntime } from "./team-session.js";

export function createTeamServiceForDaemon(paseoHome: string): TeamService {
  const service = new TeamService({ paseoHome });
  configureTeamRuntime(service);
  return service;
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
