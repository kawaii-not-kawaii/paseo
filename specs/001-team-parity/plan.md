# Implementation Plan: Team Parity

**Branch**: `raft-parity` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-team-parity/spec.md`

## Summary

Add a project-scoped **Team** surface: persistent agent members, project channels they coordinate
in, and a Kanban taskboard with exclusive claims. Members reach channels and tasks through new MCP
tools, so handoffs happen without the human relaying.

The technical approach is shaped by three facts discovered in the code rather than assumed:

1. **The daemon reclaims idle agent runtimes after 2 minutes** (`IDLE_AGENT_RUNTIME_TTL_MS`,
   `bootstrap.ts:218`). Members therefore never block on a long-lived wait tool. They go idle, their
   runtime is reclaimed, and the team service starts a fresh session on mention. Task claims are
   **lease-based** rather than tied to runtime liveness, or a member would lose its task two minutes
   after claiming it.
2. **The app's project spans daemons** (`ProjectSummary.hosts`, `packages/app/src/utils/projects.ts`).
   A team is per project _per daemon_; the Team view shows the connected daemon's team.
3. **This is a fork that must keep merging upstream** (Constitution VIII). All logic lives in
   fork-owned directories; upstream files are touched only at enumerated seams.
4. **Unread state belongs to the human identity, not the device.** A project database read cursor
   keyed by channel and identity lets every client see the same durable unread state. The daemon
   advances the cursor to the channel's current message row when it is viewed.
5. **The existing drag primitive is list-local.** Web gets one board-owned dnd-kit context with
   each status column registered as a drop target. Native keeps the existing overflow move action;
   reshaping the upstream cross-platform primitive for one fork feature would widen the merge
   surface without solving native cross-list drag.
6. **Human channel messages are the ambient wake boundary.** Delivery stays in
   `MemberLifecycle.deliverMentions`: human-authored messages fan out to the channel's resolved
   member set without interrupting busy members, while member-authored messages retain
   mention-only delivery. Existing per-member channel read cursors record messages that arrive
   during a run; the single daemon lifecycle bridge emits the existing `team.member.changed` event
   and delivers one all-author catch-up wake after completion. Successful wakes and members' own
   posts advance those cursors, so no queue or schema change is needed.

## Technical Context

**Language/Version**: TypeScript, Node 24 (daemon/CLI), React Native + Expo (app)

**Primary Dependencies**: None added. `node:sqlite` is built into Node 24 — verified working in this
checkout (`DatabaseSync`, `VACUUM INTO`). Zod for schema authoring, existing zod-aot pipeline for
inbound validation.

**Storage**: SQLite, one database per project at `~/.paseo/team/<projectId>.db`, plus
`~/.paseo/team/roster.db` for daemon-wide member identities. Forward-only migrations keyed on
`PRAGMA user_version`. Bounded by Constitution VII — all existing JSON stores are untouched.

**Testing**: Vitest per-file (`npx vitest run <file> --bail=1`), Playwright for RPC-backed UI. Real
dependencies over mocks; real SQLite in tests, never a mock database.

**Target Platform**: iOS, Android, browser web, Electron desktop — cross-platform by default.
Cross-column task drag is web/Electron first; native retains the existing explicit status menu.

**Project Type**: npm workspace monorepo; daemon + mobile/web client + protocol package.

**Performance Goals**: Opening a channel with 50,000 messages is as fast as an empty one (SC-003) —
requires keyset pagination, never a full-table read. Message fan-out visible within 2s (SC-004).

**Constraints**: No new runtime dependency. No modification of `chat-service.ts` or
`loop-service.ts`. Protocol backward compatible in both directions. `node_modules` is **not
installed** in this checkout — `npm install` is the first implementation step.

**Scale/Scope**: Single user, tens of members, tens of thousands of messages per project. ~4 new
protocol schema modules, ~12 new server modules, ~15 new app screens/components, 6 MCP tools.

## Constitution Check

_GATE: evaluated before Phase 0, re-evaluated after Phase 1 design._

| Principle                                     | Status                        | How this design satisfies it                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Protocol Backward Compatibility            | PASS                          | All team RPCs are new `type` values; no existing schema is modified. New fields optional. Dotted namespaces with `.request`/`.response`. `discriminatedUnion` throughout. No `.transform`/`.catch`/`.preprocess` in wire schemas — retention and normalization happen post-validation. |
| II. Capability Gates, Not Fallback Paths      | PASS                          | `server_info.features.team` gates the surface; `server_info.features.teamChannelReads` gates durable unread tracking. Missing capabilities tell the user to update the host. No degraded path or legacy-RPC fan-out. Each capability has one `COMPAT` comment.                         |
| III. Cross-Platform By Default                | PASS WITH DOCUMENTED LIMIT    | Unread and presence are cross-platform. Cross-column drag uses a fork-owned `.web.tsx` implementation because the installed native list primitive has no shared cross-list context; native retains the explicit move menu. Team is _not_ a mobile panel (see Structure).               |
| IV. Behavior-Proving Tests, Real Dependencies | PASS                          | Real SQLite in tests. Claim contention, lease expiry, migration, and adoption are behavioral tests. Every fallible UI action gets success and failure coverage.                                                                                                                        |
| V. Commit To A Shape                          | PASS                          | Zod validation at the SQLite read boundary and the WebSocket boundary; typed internals after. No barrel files.                                                                                                                                                                         |
| VI. Glossary-Authoritative Terminology        | PASS                          | New glossary entries required in the same change: Member, Channel, Task (disambiguated from Agent session), Claim, Home workspace.                                                                                                                                                     |
| VII. JSON By Default, SQLite By Exception     | PASS                          | SQLite confined to the team surface. Migration runner present at schema v1. Zod at read boundary. `docs/data-model.md` gains the boundary section.                                                                                                                                     |
| VIII. Fork Mergeability                       | PASS WITH ONE NOTED EXCEPTION | All logic in fork-owned directories. Seams enumerated below. **One seam is not a one-liner** — see Complexity Tracking.                                                                                                                                                                |

## Project Structure

### Documentation (this feature)

```text
specs/001-team-parity/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — decisions and rationale
├── data-model.md        # Phase 1 — SQLite schema, entities, state transitions
├── contracts/
│   ├── rpc.md           # WebSocket RPC surface
│   └── mcp-tools.md     # Agent-facing MCP tool contracts
├── quickstart.md        # Phase 1 — runnable validation guide
└── checklists/requirements.md
```

### Source code

Fork-owned (new files, never conflict with upstream):

```text
packages/protocol/src/team/
├── types.ts                    # Member, Channel, Message, Task, Claim wire types
├── rpc-schemas.ts              # *.request / *.response pairs
└── capabilities.ts             # features.team flag shape

packages/server/src/server/team/
├── team-service.ts             # Orchestration: channels, tasks, members
├── storage/
│   ├── database.ts             # node:sqlite open, pragmas, per-project handle cache
│   ├── migrations.ts           # forward-only, PRAGMA user_version, v1 baseline
│   ├── roster-store.ts         # ~/.paseo/team/roster.db
│   ├── project-store.ts        # ~/.paseo/team/<projectId>.db
│   └── backup.ts               # VACUUM INTO, retention of last 3
├── member-lifecycle.ts         # start-on-mention, idle reaping interaction
├── claims.ts                   # lease acquire/renew/release/expire
├── review-cycle.ts             # handback counting, guards, escalation
├── retention.ts                # per-project message cap, prune on start
├── adoption.ts                 # one-time import of ~/.paseo/chat/rooms.json
├── member-home.ts              # ~/.paseo/team/members/<id>/ — MEMORY.md, notes/, artifacts/
├── role-templates.ts           # built-in templates, shipped as data
├── mcp-tools.ts                # team_* tool definitions
└── team-session.ts             # single RPC entry point (the session.ts seam)

packages/app/src/screens/team/
├── team-screen.tsx             # section switcher + responsive layout
├── chat/                       # channel list, message list, composer
├── tasks/                      # board, list, task detail
└── members/                    # roster, member detail, add/edit form

packages/app/src/app/h/[serverId]/team/
└── [section].tsx               # host-level leaf route
```

### Upstream seams

Every touched upstream file, to be recorded in `docs/fork.md`:

| File                                                                  | Edit                                                                                                     | Size                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/protocol/src/messages.ts`                                   | Import team schemas; add entries to the inbound/outbound session unions                                  | Import block + N union entries — **the one non-trivial seam** |
| `packages/server/src/server/session.ts`                               | One delegation before the existing switch: `if (isTeamRequest(msg)) return this.teamSession.handle(msg)` | 1 line + 1 import                                             |
| `packages/server/src/server/bootstrap.ts`                             | Construct `TeamService`; add its member IDs to the existing `protectedAgentIds` set                      | ~4 lines                                                      |
| `packages/app/src/app/h/[serverId]/_layout.tsx`                       | One `<Stack.Screen name="team/[section]" />`                                                             | 1 line                                                        |
| `packages/app/src/utils/host-routes.ts`                               | Append `buildHostTeamRoute()`                                                                            | 1 function, appended                                          |
| `packages/app/src/components/left-sidebar.tsx`                        | Team nav row                                                                                             | ~6 small additions — see Complexity Tracking                  |
| `packages/server/src/server/agent/tools/paseo-tools.ts`               | Register `team_*` tools                                                                                  | 1 import + 1 spread                                           |
| `packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts` | Skip workspaces that are a member's home workspace (FR-019a)                                             | 1 guard clause + 1 import                                     |
| `docs/glossary.md`, `docs/data-model.md`, `docs/fork.md`              | Documentation, required by Principles VI/VII/VIII                                                        | Additive sections                                             |

**Structure Decision**: Fork-owned modules under `team/` in each package, wired through the eight
seams above. The app's Team view is a **host-level leaf route**, registered by
`h/[serverId]/_layout.tsx` per `docs/expo-router.md` — the root layout must not register it, and
misplacement fails silently with a blank native screen rather than an error.

**Team is not a mobile panel.** `docs/mobile-panels.md` defines exactly three compact destinations
(`agent-list`, `agent`, `file-explorer`) and forbids adding another panel translate shared value.
The Team view is a separate route with its own internal layout: on compact, one section at a time
with a segmented switcher; on wide, list beside detail. It never participates in the workspace
three-panel gesture system.

## Complexity Tracking

| Violation                                                                                     | Why Needed                                                                                                                                                                        | Simpler Alternative Rejected Because                                                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two chat stores in one daemon (upstream's JSON `chat-service.ts` plus team SQLite)            | Constitution VIII: `chat-service.ts` is upstream-owned and serves the `paseo chat` CLI. Reshaping it for project scoping and SQLite would make it a permanent conflict zone.      | Modifying it in place is less code but creates recurring merge cost in an actively developed file. Recorded in `docs/fork.md` so it is not "cleaned up" later. |
| Loop guard semantics reimplemented in `review-cycle.ts` rather than reusing `loop-service.ts` | Same reason: ~1000 lines of actively developed upstream code, and loops created outside the Team view must keep working unchanged.                                                | Extending `loop-service.ts` was the original plan; Principle VIII (constitution 1.1.0) supersedes it.                                                          |
| `left-sidebar.tsx` seam is ~6 additions, not one line                                         | The nav row is duplicated across the compact and wide render paths, plus a labels type, a labels map, a handler, and an active-path check. There is no single registration point. | A fork-owned sidebar wrapper would mean forking the whole sidebar — far larger and more conflict-prone than 6 mechanical lines. Accepted and recorded.         |
| `messages.ts` union entries                                                                   | The protocol's discriminated unions are the single validated dispatch boundary; new RPCs must be listed there. There is no plugin registry.                                       | A separate union would break `WSInboundMessageSchema` as the single boundary and defeat the zod-aot pipeline.                                                  |
