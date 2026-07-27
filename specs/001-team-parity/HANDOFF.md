# Handoff: Team Parity

**For**: a fresh session picking up where this one stopped
**State**: 121 of 127 tasks done. Built, tested, CI-green, pushed. **Not validated end to end.**
**Branch**: `raft-parity`, pushed. **PR #1** open on the fork (`kawaii-not-kawaii/paseo`), draft.

---

## Where this actually stands

Every phase is implemented: storage, protocol, member identity, agent-to-agent chat, persistent
members, the taskboard and claims, durability and recovery, and the docs. CI is green on the OS
matrix. The six open tasks are **all validation**, and they are the honest gap — the feature
compiles and unit-tests cleanly but has never been proven to do the thing it exists to do.

**Do not read "121/127" as "nearly done".** The remaining six include T056, the MVP thesis, and it
does not pass yet. See "The T056 gap" below — that is the most important section in this file.

## Read first, in this order

1. `.specify/memory/constitution.md` (v1.1.1) — Principles VII and VIII constrain most decisions.
2. `docs/fork.md` — merge policy and the touched-upstream-file table (audited, T118).
3. `docs/team.md` — the Team surface, claim model, guard thresholds. Written this session.
4. `specs/001-team-parity/spec.md`, `research.md` (R1–R11), `data-model.md`, `contracts/`.
5. `specs/001-team-parity/quickstart.md` — the 14 validation scenarios. **Note its gaps** below.
6. `CLAUDE.md` and the `docs/` table.

## The T056 gap — read this before anything else

T056 is quickstart step 1: two members, **one** human message, a multi-turn agent-to-agent exchange
(SC-002). It is the reason this feature exists. It was run for real against a live daemon this
session and **it does not pass**.

What the live run proved **does** work:

- `features.team` is published; the capability gate resolves on a real daemon.
- `@name` mentions parse into `message_mentions` on the RPC post path.
- Mentioning an idle member **starts** it (FR-035a), with its role prompt as `systemPrompt`.
- `team_roster` returns impl, qa and the human when called with a member's `callerAgentId`.
- The `team_*` MCP tools are registered, listed, and callable. Verified by hand over HTTP.

What does **not** work: **members do not reliably choose to post in the channel.**

Two observed failure modes, in order:

1. **Before the fix**: `impl` did the work correctly, then spawned two throwaway agents via
   `create_agent` to "hand off" to QA. Members run with the full Paseo tool catalogue and nothing
   told them the channel was how they communicate. Work happened; the channel stayed empty; the
   human was back to relaying. Fixed by adding `TEAM_COLLABORATION_PROMPT` in `member-home.ts`.
2. **After the fix**: no more throwaway agents — but members still go quiet. One run ended with
   `impl` writing _"the team handoff tools were not callable in this session"_, despite those tools
   being demonstrably callable at that moment via the same agent's `callerAgentId`.

**That second one is the open question.** It is not proven whether the tools are genuinely absent
from the member's session or the model failed to find them. Worth checking first:

- Whether Codex namespaces MCP tools (e.g. `paseo__team_post`) so a prompt naming `team_post` sends
  the model looking for something it cannot see. `runtime-mcp-config.ts` injects the server under
  the name `paseo`.
- Whether the member's launch config actually carries `mcpServers` — `withRuntimePaseoMcpServer`
  injects it at launch and the stored config is stripped, so inspect the **launch** config, not the
  agent JSON on disk.
- Members are created with `modeId: "auto-review"` by default. Confirm a tool call is not sitting in
  a permission prompt.

This is behavioural tuning against a real model, not a code defect. **Budget it explicitly** — it is
an open-ended loop and it spends tokens per attempt.

## What running T056 already found and fixed

Four real defects, none of which any unit test caught. All fixed, tested, pushed (`c95ef483c`):

1. **The human was missing from every project roster.** It is a daemon-wide identity never assigned
   to a project, so `listMembers` filtered it out. The app resolves message authors through that
   list, so **every message the user posted rendered as a raw UUID**, and escalation had nobody to
   mention (FR-006a, FR-035e).
2. **`team.member.create` dropped `rolePrompt`, `modeId`, `templateId`.** Neither the schema nor the
   handler carried them. The app worked around it with a follow-up update, leaving a window where a
   mention starts a member with no role prompt — which FR-014a forbids. Added as optional fields.
3. **Members were never told how to collaborate** (see above).
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

## The six open tasks

| Task     | Needs                     | Notes                                                                                 |
| -------- | ------------------------- | ------------------------------------------------------------------------------------- |
| **T056** | Live daemon + tokens      | The MVP thesis. **Does not pass.** See above.                                         |
| T074     | Live daemon               | US2: worktree removal, memory survival, merge does not strand.                        |
| T101     | Live daemon + tokens      | Claim exclusivity, converging loop, escalation.                                       |
| T114     | Live daemon, little spend | Unclean shutdown, adoption with CLI intact, cross-daemon. **Cheapest — start here.**  |
| T046     | A real device             | Expo route mount. Fails **silently** with a blank screen; web passing proves nothing. |
| T122     | Device + daemon           | Large-history perf, compact parity, back-compat both directions.                      |

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
2. **The T056 investigation** — with an explicit budget. Start with whether Codex namespaces MCP
   tool names.
3. **The relay carve-out spec** — blocks any release regardless of the validations.
4. T046 and T122 whenever a device is available.
