import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const forkConfig = readFileSync(join(packageRoot, "electron-builder.fork.yml"), "utf8");
const baseConfig = readFileSync(join(packageRoot, "electron-builder.yml"), "utf8");
const mainSource = readFileSync(join(packageRoot, "src", "main.ts"), "utf8");

/**
 * These three values are what let this build install and run alongside a vanilla Paseo. Every
 * failure mode here is silent — the build succeeds and the breakage only shows up on the user's
 * machine at install or launch time — so they get asserted rather than reviewed.
 */
describe("fork packaging identity", () => {
  it("names the app the same in the installer and in app.setName", () => {
    // `productName` picks the install directory; `APP_NAME` feeds `app.setName`, which picks the
    // userData directory, which keys Electron's single-instance lock. If these drift, the
    // installer looks right and the app silently focuses vanilla Paseo instead of launching.
    const productName = /^productName:\s*(.+)$/m.exec(forkConfig)?.[1]?.trim();
    const appName =
      /APP_NAME\s*=\s*process\.env\.PASEO_TEST_APP_NAME\?\.trim\(\)\s*\|\|\s*"([^"]+)"/.exec(
        mainSource,
      )?.[1];

    expect(productName).toBe("Paseo Team");
    expect(appName).toBe(productName);
  });

  it("takes its own appId so the two installs do not share an uninstall entry", () => {
    const forkAppId = /^appId:\s*(.+)$/m.exec(forkConfig)?.[1]?.trim();
    const baseAppId = /^appId:\s*(.+)$/m.exec(baseConfig)?.[1]?.trim();

    expect(forkAppId).toBeTruthy();
    expect(forkAppId).not.toBe(baseAppId);
  });

  it("points the auto-updater at this fork, not upstream", () => {
    // Inherit upstream's `publish` block and the installed app finds a newer getpaseo release and
    // replaces itself with vanilla, taking the Team surface with it.
    expect(forkConfig).toMatch(/^\s*owner:\s*kawaii-not-kawaii$/m);
    expect(forkConfig).not.toMatch(/^\s*owner:\s*getpaseo$/m);
  });

  it("builds from the fork config, not the upstream one", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.build).toContain("electron-builder.fork.yml");
  });
});
