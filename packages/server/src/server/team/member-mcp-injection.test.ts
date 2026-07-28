import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentManager } from "../agent/agent-manager.js";
import { AgentStorage } from "../agent/agent-storage.js";
import type {
  AgentClient,
  AgentLaunchContext,
  AgentPersistenceHandle,
  AgentResumeSessionOptions,
  AgentSession,
  AgentSessionConfig,
} from "../agent/agent-sdk-types.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { MemberLifecycle } from "./member-lifecycle.js";
import { TeamService } from "./team-service.js";
import {
  buildMessage,
  createWorkspaceRegistryStub,
  seedAssignedMember,
  sequenceIds,
} from "./test-support/team-test-fakes.js";

/**
 * The composition nothing covered: member config → agent manager → what the provider is launched
 * with.
 *
 * Around sixty team tests passed while members were starting with no `team_*` tools at all, because
 * every one of them stopped at `TeamService` or at the composed prompt string. Hand-verifying the
 * `/mcp/agents` endpoint over HTTP did not catch it either — `mcpEnabled` mounts the route and
 * `mcpInjectIntoAgents` hands the server to agents, and only the second one was off. The endpoint
 * was never the broken half.
 *
 * These assertions are on the *launch* config. The stored config is deliberately stripped of the
 * internal MCP server, so reading an agent's JSON on disk proves nothing here.
 */
describe("team member MCP injection", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("a mention-started member is launched with the Paseo MCP server scoped to its own agent id", async () => {
    const root = await createTempDir("member-mcp-injection-");
    const launches: AgentSessionConfig[] = [];
    const logger = createTestLogger();
    const storage = new AgentStorage(join(root, "agents"), logger);
    const agentManager = new AgentManager({
      clients: { codex: createRecordingCodexClient(launches) },
      registry: storage,
      logger,
      mcpBaseUrl: "http://127.0.0.1:6768/mcp/agents",
    });

    const service = new TeamService({
      paseoHome: root,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome: root,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });
    const channel = service.createChannel({ projectId: "project-1", name: "build" });

    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: root,
      }),
      logger,
    });

    try {
      await lifecycle.deliverMentions({
        projectId: "project-1",
        message: {
          ...buildMessage("Please review this change", ["member-reviewer"]),
          channelId: channel.id,
        },
      });

      const agentId = agentManager.listAgents()[0]?.id;
      expect(agentId).toBeTruthy();

      const launched = launches[0];
      expect(launched).toBeDefined();

      // Without this the member has no team_* tools, does the work, and never posts — SC-002 fails
      // with nothing in any log to say why.
      const paseoServer = launched?.mcpServers?.paseo;
      expect(paseoServer).toBeDefined();

      // The team tools refuse to run without a calling member runtime, so the id has to be the
      // member's own agent id, not merely present.
      expect(paseoServer && "url" in paseoServer ? paseoServer.url : "").toContain(
        `callerAgentId=${agentId}`,
      );

      expect(launched?.systemPrompt).toContain("Review carefully before approving.");
    } finally {
      service.close();
      // The storage writer keeps writing agent JSON after the assertions, which races the temp-dir
      // cleanup. Close the runtimes before flushing.
      for (const agent of agentManager.listAgents()) {
        await agentManager.closeAgent(agent.id).catch(() => undefined);
      }
      await agentManager.flush().catch(() => undefined);
    }
  });

  test("with injection off a mention is refused outright, instead of starting a member that cannot post", async () => {
    const root = await createTempDir("member-mcp-injection-off-");
    const launches: AgentSessionConfig[] = [];
    const logger = createTestLogger();
    const storage = new AgentStorage(join(root, "agents"), logger);
    // `mcpBaseUrl` omitted is exactly what bootstrap produces when mcp.injectIntoAgents is off —
    // and what a persisted config with no `mcp` block resolves to, because that field defaults to
    // false in the config loader while bootstrap treats `undefined` as true.
    const agentManager = new AgentManager({
      clients: { codex: createRecordingCodexClient(launches) },
      registry: storage,
      logger,
    });

    const service = new TeamService({
      paseoHome: root,
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      createId: sequenceIds("member-human"),
    });
    seedAssignedMember({
      paseoHome: root,
      projectId: "project-1",
      memberId: "member-reviewer",
      name: "Reviewer",
      rolePrompt: "Review carefully before approving.",
      homeWorkspaceId: "workspace-reviewer",
    });

    const lifecycle = new MemberLifecycle({
      teamService: service,
      agentManager,
      workspaceRegistry: createWorkspaceRegistryStub({
        workspaceId: "workspace-reviewer",
        projectId: "project-1",
        cwd: root,
      }),
      logger,
    });

    try {
      // Withholding `features.team` stops well-behaved clients offering the feature, but team RPCs
      // are routed unconditionally and `server_info` is only delivered at hello — so a client that
      // connected before injection was turned off still reaches this path. Refusing here is what
      // makes the original silent failure unreachable rather than merely unlikely.
      await expect(
        lifecycle.deliverMentions({
          projectId: "project-1",
          message: buildMessage("Please review this change", ["member-reviewer"]),
        }),
      ).rejects.toThrow(/mcp\.injectIntoAgents/);

      // No model turn was spent.
      expect(launches).toHaveLength(0);
      expect(agentManager.listAgents()).toHaveLength(0);
    } finally {
      service.close();
      // The storage writer keeps writing agent JSON after the assertions, which races the temp-dir
      // cleanup. Close the runtimes before flushing.
      for (const agent of agentManager.listAgents()) {
        await agentManager.closeAgent(agent.id).catch(() => undefined);
      }
      await agentManager.flush().catch(() => undefined);
    }
  });

  async function createTempDir(prefix: string): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), prefix));
    cleanupPaths.push(path);
    return path;
  }
});

function createRecordingCodexClient(launches: AgentSessionConfig[]): AgentClient {
  const base = createTestAgentClients().codex;
  if (!base) {
    throw new Error("expected Codex test client");
  }

  return {
    provider: base.provider,
    capabilities: base.capabilities,
    createSession: async (
      config: AgentSessionConfig,
      launchContext?: AgentLaunchContext,
    ): Promise<AgentSession> => {
      launches.push(config);
      return await base.createSession(config, launchContext);
    },
    resumeSession: async (
      handle: AgentPersistenceHandle,
      overrides?: Partial<AgentSessionConfig>,
      launchContext?: AgentLaunchContext,
      options?: AgentResumeSessionOptions,
    ): Promise<AgentSession> => await base.resumeSession(handle, overrides, launchContext, options),
    fetchCatalog: async (options) => await base.fetchCatalog(options),
    isAvailable: async () => await base.isAvailable(),
  };
}
