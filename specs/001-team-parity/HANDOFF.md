# Handoff: Team Parity

**For**: a fresh session picking up where this one stopped
**State**: 122 of 127 tasks done. **T056 passes** — the MVP thesis is proven against live models.
**Branch**: `raft-parity`, pushed. **PR #1** open on the fork (`kawaii-not-kawaii/paseo`), draft.

---

## Where this actually stands

Every phase is implemented: storage, protocol, member identity, agent-to-agent chat, persistent
members, the taskboard and claims, durability and recovery, and the docs. CI is green on the OS
matrix.

**T056 now passes.** Two members, one human message naming only `@impl`, and `impl` implemented the
change and pulled in `@qa` by mention — `qa` verified it and posted the result. The human relayed
nothing. Reproduce with:

```bash
npx tsx packages/server/src/server/team/t056-live-check.ts
```

That script is the acceptance test. It spends real tokens, runs on an isolated in-process daemon,
and prints five mechanical checks against the project database rather than a chat log somebody
reads and feels good about. Five open tasks remain, all validation.

T101 passes too, on the same harness (`t101-live-check.ts`). It never tells the member the task id,
so the member has to call `team_tasks` to find the board. Confirmed in the project database:
`team_task_update` reached through MCP for claim, set_status, satisfy_criterion, and release. The
guards never fired because the loop converged on the first round, so handback and no-progress
escalation are still covered only at the service level.

## OPEN: the Team surface does not appear in a client, cause unknown

**This is where the session stopped. Start here.**

A daemon was deployed to a remote box and a desktop client connected to it over the fork's own
relay. Everything works except that the Team nav row never renders, so Channels/Members/Tasks are
unreachable from the UI.

Setup, all of which is confirmed working:

| Piece                                                                     | State                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `racknerd-2231314` (Debian 13, 2 cpu, ~2 GB), reachable via Tailscale SSH | daemon 0.2.2 installed from locally-built packs, `srv_QSQ7ipm7Dh-P`        |
| Relay                                                                     | `wss://paseo.dneet.app:443`, `relay_control_connected`                     |
| Claude Code 2.1.220                                                       | installed and authenticated, provider reports `available`                  |
| Windows desktop client                                                    | built from `0d67e0ad9`, connected to `racknerd-2231314`, password enforced |

**Verified, so do not re-check these:**

- `loadConfig` on that box resolves `mcpEnabled: true`, `mcpInjectIntoAgents: true`,
  `relayEndpoint: paseo.dneet.app:443`, `useTls: true`. Run it with the real loader against
  `/usr/lib/node_modules/@getpaseo/server/dist/server/server/config.js` rather than reasoning from
  the JSON.
- The installed `team/bootstrap.js` contains the capability gate and `bootstrap.js` calls
  `installTeamServerInfo(wsServer, () => ...)` unconditionally, after `agentMcpBaseUrl` is assigned.
- The hello path does reach the patch: `createServerInfoMessage()` (websocket-server.ts:1554) calls
  `this.buildServerInfoStatusPayload()`, and `installTeamServerInfo` replaces that as an own
  property, which shadows the prototype method. Sent at both 1432 and 1457.
- The desktop bundle is not vanilla. Root `build:desktop` runs `expo export --platform web` and
  electron-builder ships `../app/dist` as `app-dist`. `0d67e0ad9` contains the team screens, and
  `left-sidebar.tsx` renders `<TeamSidebarRow>` in both the compact and wide paths.
- Not the local Windows daemon — the user confirmed it is disabled, and the app shows
  `racknerd-2231314` connected.
- The app was fully restarted, so hello-time staleness is not the explanation.

**The one thing never verified: what `features` the daemon actually puts on the wire at hello.**
Everything above is inference from code. Capturing the real `status`/`server_info` payload is the
next step and it should be the first thing done — it splits the problem cleanly in half. It was
blocked here only because the daemon now requires a password that the session did not hold.

Ways to get it: connect a `DaemonClient` on the box with the password and log
`lastServerInfoMessage`; or temporarily start a second daemon on another port with no password and
the same config; or read it from the desktop app's devtools.

**Untested hypothesis worth a look if the wire payload says `team: true`.** `use-team-nav.ts`
resolves which host to ask like this:

```ts
const serverId = activeWorkspaceSelection?.serverId ?? hosts[0]?.serverId ?? null;
```

That is not the host chosen in the composer. With no active workspace selection it falls back to
whichever host sorts first, so the row can reflect a different daemon than the one being worked
against. Fork-owned code, so it is ours to change — but only after the wire payload rules the
daemon in or out.

## Infrastructure built this session, all verified working

None of this is team-parity, but it is what the validation work now runs on.

| Thing                              | State                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android APK via GitHub Actions     | Works with **no EAS, no Expo account, no `EXPO_TOKEN`**. `expo prebuild` then Gradle on a stock `ubuntu-latest`. `.github/workflows/android-apk-ci.yml`, ~36 min, 90 MB artifact.                                                                           |
| Windows desktop via GitHub Actions | Works with **no secrets** beyond the auto-provided `GITHUB_TOKEN` — no signing step exists. Dispatch `desktop-release.yml` with `platform=windows`, `publish=false`, `checkout_ref=<branch>`. Produces `Paseo-Setup-<version>-x64.exe`.                     |
| Self-hosted relay                  | `paseo.dneet.app` on the fork's own Cloudflare account. `/health`, `/ws` rejections, and a real WebSocket session with a `sync` frame all verified. Free tier is viable because the Durable Object is SQLite-backed and uses the WebSocket Hibernation API. |

Gotchas worth keeping:

- `workflow_dispatch` only works once the workflow file exists on the **default branch**, even when
  targeting another ref. `android-apk-ci.yml` carries a temporary path-filtered `push` trigger as a
  workaround; delete it once merged.
- On a `push` trigger every `inputs.*` is the empty string, which silently built the wrong variant
  and named the artifact `paseo---apk`. Resolve inputs once at job level with explicit fallbacks.
- Setting `PASEO_RELAY_UPSTREAM` in `wrangler.toml` turns the worker into a proxy to upstream's Fly
  relay rather than a relay. It must stay unset.
- `/user/tokens/verify` returns `Invalid API Token` for an account-scoped Cloudflare token. That is
  the endpoint needing a User permission, not a bad token. Do not use it as a gate.

## Read first, in this order

1. `.specify/memory/constitution.md` (v1.1.1) — Principles VII and VIII constrain most decisions.
2. `docs/fork.md` — merge policy and the touched-upstream-file table (audited, T118).
3. `docs/team.md` — the Team surface, claim model, guard thresholds. Written this session.
4. `specs/001-team-parity/spec.md`, `research.md` (R1–R11), `data-model.md`, `contracts/`.
5. `specs/001-team-parity/quickstart.md` — the 14 validation scenarios. **Note its gaps** below.
6. `CLAUDE.md` and the `docs/` table.

## How T056 was actually failing — read this before anything else

The earlier diagnosis in this file was wrong, and wrong in a way worth understanding, because it
cost a whole session of prompt engineering aimed at a non-problem.

The symptom was "members do not reliably choose to post in the channel". One run ended with `impl`
writing _"the team handoff tools were not callable in this session"_ — and that statement was
**literally true**. The member had no `team_*` tools. Codex's rollout logs
(`~/.codex/sessions/**/rollout-*.jsonl`) record every tool search: `impl` searched three times with
the right names and got back nothing but `mcp__codex_apps__github`. No `mcp__paseo` namespace ever.

The cause was one config default:

```text
config.ts        mcpInjectIntoAgents ?? false   ← persisted loader defaults OFF
.dev/paseo-home/config.json                     ← had no "mcp" block at all
bootstrap.ts     agentMcpBaseUrl = null, setPaseoToolsEnabled(false)
runtime-mcp-config.ts   no mcpBaseUrl → no injection
```

Note the asymmetry that hid it: the **persisted loader** defaults `injectIntoAgents` to `false`,
while **bootstrap** treats `undefined` as `true`. Tests that build a config object get injection;
a daemon booting from a real `config.json` with no `mcp` block does not. `~/.paseo/config.json` had
`injectIntoAgents: true` set explicitly, so the production daemon worked and only the dev daemon
was broken.

Hand-verifying `/mcp/agents` over HTTP did not catch this because `mcp.enabled` (mounts the route)
and `mcp.injectIntoAgents` (hands the server to agents) are independent switches. The manual check
exercised the half that was never broken.

The same cause produced the _other_ failure mode too. `setPaseoToolsEnabled(false)` also strips the
generic Paseo tools, so the earlier run where `impl` "spawned throwaway agents via `create_agent`"
did not happen either — the transcript shows it shelling out to `paseo run` after its tool searches
came back empty. Both symptoms, one cause.

**Dead hypotheses, do not re-chase:** tool namespacing (the model searched semantically, not by
exact name — a prefix mismatch would still have surfaced `mcp__paseo__team_post`); permission
prompts (`mode_id` was `null`, nothing was ever pending); prompt wording (no wording reaches a tool
that is not there).

### What fixed it

1. `team/bootstrap.ts` — `features.team` is gated on the resolved agent MCP base URL instead of
   hardcoded `true`. That URL additionally requires `mcp.enabled` and a TCP listen target.
2. `member-lifecycle.ts` — `assertTeamToolsReachable` refuses to start a member when that URL is
   null. The capability flag is not enough on its own: team RPCs route unconditionally and
   `server_info` only reaches a client at hello, so a client that connected before injection was
   turned off still reaches the mention path.
3. `member-lifecycle.ts` — the mention now names the channel and the author. `team_post` requires an
   exact channel name, no tool lists channels, and the member was previously handed only the message
   body. It had to guess, and a wrong guess throws something that reads like a broken tool.
4. `scripts/dev-home.sh` — seeds `mcp.injectIntoAgents` for fresh dev homes.

### The lesson

Around sixty team tests passed throughout, because every one of them stopped at `TeamService` or at
the composed prompt string. `member-home.test.ts` asserted `prompt.toContain("team_post")` — it
verified the string was written, which was never in doubt. Nothing asserted what the provider was
actually launched with. `member-mcp-injection.test.ts` now covers that boundary.

## What running T056 already found and fixed

Four real defects, none of which any unit test caught. All fixed, tested, pushed (`c95ef483c`):

1. **The human was missing from every project roster.** It is a daemon-wide identity never assigned
   to a project, so `listMembers` filtered it out. The app resolves message authors through that
   list, so **every message the user posted rendered as a raw UUID**, and escalation had nobody to
   mention (FR-006a, FR-035e).
2. **`team.member.create` dropped `rolePrompt`, `modeId`, `templateId`.** Neither the schema nor the
   handler carried them. The app worked around it with a follow-up update, leaving a window where a
   mention starts a member with no role prompt — which FR-014a forbids. Added as optional fields.
3. **Members were never told how to collaborate.** `TEAM_COLLABORATION_PROMPT` in `member-home.ts`.
   Worth keeping as policy, but note it fixed nothing at the time — see the section above. It was
   aimed at a misread symptom.
4. Two tests asserted whole-roster equality when they meant one member's state.

**The lesson worth carrying**: every one of these was invisible to 60 passing unit tests. Run the
thing before believing it.

## Other findings from this session

- **`docs/fork.md` was under-reporting.** It listed the eight seams but not the eight locale files,
  two upstream test files, or `package-lock.json`. Fixed (T118). The table's value is that one read
  gives the complete picture — keep it that way.
- **CI caught two regressions the local per-file runs could not.** A `session.ts` seam that broke 96
  upstream tests, and a Windows `EBUSY` that turned out to be a **production** bug: `openDatabase`
  created the handle before running pragmas, so a corrupt file left it open — invisible on POSIX,
  but on Windows it blocks the restore FR-042 offers for that exact database.
- **The sidebar seam landed at 49 lines** against a claimed ~6, with logic duplicated across both
  render paths. Collapsed to 6 by moving it into fork-owned `use-team-nav.ts` and
  `team-sidebar-row.tsx`. Watch for this: seams grow quietly.
- **Three task-list gaps** were found by agents building against the design: project settings had no
  UI task, the member form's fields were unspecified, and `team.member.start`/`stop` had schemas but
  no implementing task (added as T072a1). The design was right; the breakdown dropped pieces.

## Quickstart is not runnable as written

`quickstart.md` assumes CLI commands that do not exist — `paseo team task create`, and similar.
**There is no `team` CLI surface**; it was never specified as a task. Options: add one, or drive the
daemon over the WebSocket protocol as this session did.

A working driver for the latter was written at `/tmp/t56/t056.ts` (ephemeral — it is gone now, but
it is ~110 lines and easy to rebuild). It connects the app's own `DaemonClient` to a dev daemon,
creates a project, two workspaces, two members and a channel, posts one human message, then polls
the channel and reports pass/fail against SC-002. Gotchas it encoded: the workspace create response
field is `workspace.id` (not `workspaceId`), and the human member id comes from `team.member.list`
(now that it is included there).

## Running things locally

The dev daemon is **isolated from the main one**: `PASEO_LISTEN=127.0.0.1:6768`,
`PASEO_HOME=.dev/paseo-home`. It does not touch `~/.paseo` or port 6767.

```bash
npm run dev                                  # daemon on 6768
curl -s localhost:6768/api/health            # readiness
PASEO_HOST=127.0.0.1:6768 npm run cli -- ls -a
```

`npm run cli` defaults to 6767 and will fail against the dev daemon without `PASEO_HOST`.

To inspect the MCP surface directly (this is how the team tools were verified):

```bash
curl -s -X POST "http://127.0.0.1:6768/mcp/agents?callerAgentId=<agent-uuid>" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"team_roster","arguments":{}}}'
```

Without `callerAgentId` the team tools correctly refuse with "team tools require a calling member
runtime" — that refusal is the tool working, not failing.

## The five open tasks

T056 is **done** — see above. `t056-live-check.ts` reproduces it in about a minute.

| Task | Needs                     | Notes                                                                                 |
| ---- | ------------------------- | ------------------------------------------------------------------------------------- |
| T074 | Live daemon               | US2: worktree removal, memory survival, merge does not strand.                        |
| T101 | Live daemon + tokens      | Claim exclusivity, converging loop, escalation.                                       |
| T114 | Live daemon, little spend | Unclean shutdown, adoption with CLI intact, cross-daemon. **Cheapest — start here.**  |
| T046 | A real device             | Expo route mount. Fails **silently** with a blank screen; web passing proves nothing. |
| T122 | Device + daemon           | Large-history perf, compact parity, back-compat both directions.                      |

**No native tooling on this machine**: no `adb`, `xcrun`, `java`, `emulator`, `maestro`, and no
`android/` or `ios/` directories. T046 and T122 need either a real device or an EAS cloud build
(Expo account + `EXPO_TOKEN` in repo secrets). The user chose to defer both.

## Nothing has been built or released

No binary, no Windows release, no Android APK. All release workflows are **tag-triggered**
(`desktop-release.yml`, `android-apk-release.yml`, docker publish), so a PR branch only ever runs the
test jobs. Cutting a build means tagging, via the `release-beta` / `release-stable` skills.

**Two reasons not to ship yet**: the feature is unvalidated (above), and the **relay carve-out is
still unwritten** — this fork still defaults to getpaseo's hosted relay and app URLs, so any build
made today ships pointing at upstream infrastructure.

## The relay carve-out (still unwritten, still blocking any release)

Separate, unspecced work. This fork must stop defaulting to getpaseo's hosted relay and app URLs and
use its own Cloudflare worker. **Gotcha for whoever writes it**: `useTls` is inferred from
`endpoint === DEFAULT_RELAY_ENDPOINT`, so swapping the constant alone wrongly assumes TLS for a
self-hosted plaintext endpoint. Do not fold this into team parity.

## Constraints that still apply

- **Fork-owned directories only**; eight upstream seams, all in `docs/fork.md`. A seam that outgrows
  "one import and one registration" moves back into fork-owned code.
- **Never modify** `chat-service.ts` or `loop-service.ts` (Constitution VIII).
- **Per-file test runs only**: `npx vitest run <file> --bail=1`. Never the full suite locally — push
  to CI. CI is the only thing that has caught cross-package and Windows regressions.
- **Close every database handle in tests.** Windows fails with `EBUSY` where POSIX silently forgives.
- Real SQLite, real filesystem. Never a mock database.
- `npm run typecheck` and `npm run lint` after every change; `npm run format` before committing.
- Protocol stays backward compatible both directions; new fields `.optional()`.
- **Never restart the daemon on port 6767.** The dev daemon on 6768 is fair game.

## Decisions — do not reopen

Everything in the original handoff still holds (lease-based claims, progress-based guards, Team as a
route not a panel, role prompt vs MEMORY.md, per-project-per-daemon scope). Added this session:

| Decision                                              | Where                                         |
| ----------------------------------------------------- | --------------------------------------------- |
| The human identity appears in every project roster    | `team-service.ts` `listMembers`               |
| Member create carries role prompt, mode and template  | `rpc-schemas.ts`, optional fields             |
| Members are told to use the channel, not spawn agents | `member-home.ts` `TEAM_COLLABORATION_PROMPT`  |
| Message retention cap defaults to 50,000              | User-chosen placeholder, not research-derived |
| Starting a member by hand does not prompt it          | `member-lifecycle.ts` `start`                 |
| Stopping a member never releases its claims           | `member-lifecycle.ts` `stop`, research R1     |

## Suggested next steps

1. **T114** — cheapest validation, needs a daemon but almost no token spend.
2. **T101** — claim exclusivity and escalation. `t056-live-check.ts` is the template: seed real
   workspaces into the daemon's own registry, drive it in-process, assert against the project
   database. Do not stub the workspace registry (see the gotcha below).
3. **The relay carve-out spec** — blocks any release regardless of the validations.
4. T046 and T122 whenever a device is available.

### Gotcha for the next live harness

A member calling `team_post` does not go through whatever `MemberLifecycle` your script built.
`mcp-tools.ts` constructs its own from the daemon's real `WorkspaceRegistry`. Stub that registry and
the two disagree: the agent-to-agent mention resolves a home workspace that "does not exist", which
clears `home_workspace_id` and makes the teammate unmentionable. It looks exactly like a product
failure. Seed `$PASEO_HOME/projects/workspaces.json` before the daemon starts instead.

Also: `project_members.home_workspace_id` is UNIQUE, so two members cannot share one workspace id.
Two ids pointing at the same directory is fine, and is what lets qa read what impl wrote.
