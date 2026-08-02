import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "./config.js";

const roots: string[] = [];

async function createPaseoHome(config: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-config-mcp-injection-"));
  roots.push(root);
  const paseoHome = path.join(root, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  await writeFile(path.join(paseoHome, "config.json"), JSON.stringify(config, null, 2));
  return paseoHome;
}

/**
 * `mcpInjectIntoAgents` defaulting to `false` is the single line behind the SC-002 failure: a dev
 * daemon whose `config.json` had no `mcp` block launched Team members with no `team_*` tools, and
 * they did the work and went silent.
 *
 * The default is deliberate — the Paseo tool catalogue is the daemon control plane, so agents do
 * not get it unless asked. But `scripts/dev-home.sh`, `docs/team.md`,
 * `docs/ad-hoc-daemon-testing.md` and the Team capability gate are all now written against this
 * exact value. Changing it silently makes four artifacts wrong at once, so it is pinned here.
 */
describe("daemon MCP injection config", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test("defaults agent MCP injection off when the persisted config has no mcp block", async () => {
    const home = await createPaseoHome({ version: 1 });

    expect(loadConfig(home, { env: {} }).mcpInjectIntoAgents).toBe(false);
  });

  test("defaults agent MCP injection off when the mcp block omits injectIntoAgents", async () => {
    const home = await createPaseoHome({ version: 1, daemon: { mcp: { enabled: true } } });

    // `mcp.enabled` mounts /mcp/agents; it does not hand the server to agents. Two flags, and
    // only ever calling the endpoint by hand proves the first one.
    const config = loadConfig(home, { env: {} });
    expect(config.mcpEnabled).toBe(true);
    expect(config.mcpInjectIntoAgents).toBe(false);
  });

  test("honours an explicit opt-in", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: { mcp: { injectIntoAgents: true } },
    });

    expect(loadConfig(home, { env: {} }).mcpInjectIntoAgents).toBe(true);
  });
});
