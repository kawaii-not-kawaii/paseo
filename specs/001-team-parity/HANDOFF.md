# Handoff: Team Parity

**For**: a fresh session picking up implementation
**State**: design complete and committed (`648c505a2`). **Zero implementation.**
**Branch**: `raft-parity` (not pushed)

---

## Task

Implement the Team Parity feature by working through
[`tasks.md`](./tasks.md) — 123 tasks in 7 phases. Start at **T001**.

Do not re-litigate the design. It went through specify → clarify → plan → analyze → tasks with the
user, and every open question was resolved with them directly. If something looks wrong, say so and
ask; do not silently redesign.

## Context

Paseo is a mobile app for monitoring and controlling local AI coding agents. This is a **fork**
(`kawaii-not-kawaii/paseo`, upstream `getpaseo/paseo`). The user wants parity with raft.build's team
model: persistent agent members that coordinate with each other in channels and track work on a
shared board, with the human surfacing only at decision points.

The reference walkthrough the user supplied lives outside the repo at
`/home/yun/.paseo/uploads/upload_de6296ef-8483-4923-a7a8-ecd78ed3d6a8/…RAFT-B_1.MD`. Sections 10–12
describe the target end state. Everything about multi-user, roles, billing, invites, marketplace,
and the relationship graph is **explicitly out of scope** — this product is single-user.

## Read first, in this order

1. `.specify/memory/constitution.md` (v1.1.1) — non-negotiable. Principles VII and VIII constrain
   almost every implementation decision.
2. `docs/fork.md` — the merge policy and the touched-upstream-file table.
3. `specs/001-team-parity/spec.md` — 71 FRs, 23 SCs, 4 prioritized user stories.
4. `specs/001-team-parity/plan.md` — structure, seams, complexity tracking.
5. `specs/001-team-parity/research.md` — R1–R11, the *why* behind every non-obvious decision.
6. `specs/001-team-parity/data-model.md` — SQLite schema, claim SQL, state transitions.
7. `specs/001-team-parity/contracts/` — RPC surface and MCP tool contracts.
8. `specs/001-team-parity/quickstart.md` — 14 runnable validation scenarios.
9. `CLAUDE.md` and the `docs/` table — repo conventions. `docs/` is the source of truth, not the web.

## Current state

- Design artifacts complete and committed. Constitution at v1.1.1.
- `upstream` remote configured (`getpaseo/paseo`, fetch-only, push URL disabled). Fork is level with
  `upstream/main` — 0 ahead, 0 behind.
- **`node_modules` is NOT installed.** Nothing builds, typechecks, lints, or tests until T001.
- Because of that, `npm run format` was never run on the committed markdown. Run it once deps exist.
- Nothing is pushed. No implementation code exists.

## What was tried and rejected

Recorded so it is not re-attempted:

- **Extending `loop-service.ts` to drive members** — was the plan until Constitution VIII was added.
  Rejected: ~1000 lines of actively developed upstream code becomes a permanent conflict zone.
  Its *semantics* are reimplemented in `team/review-cycle.ts` instead.
- **Reshaping `chat-service.ts` for project scoping and SQLite** — rejected for the same reason, and
  it serves the `paseo chat` CLI that upstream owns. The daemon will run two chat stores. That is
  deliberate; `docs/fork.md` records why so nobody "cleans it up".
- **A turn-count cap on agent autonomy** — rejected: it would kill a converging QA loop, the exact
  behaviour the feature exists to enable. Replaced with progress-based guards.
- **Cherry-picking open upstream PRs** — rejected: taking unmerged third-party branches creates the
  conflicts Principle VIII exists to avoid. Only merge from upstream `main`.
- **A template marketplace** — rejected: single-user. Built-in templates as data plus an agent that
  *proposes* rosters covers the real need.

## Decisions

Do not reopen these; the user settled each one.

| Decision | Where |
|---|---|
| Team is per project **per daemon** (the app's project spans daemons) | FR-001a/b |
| Members are a daemon-wide roster, assigned to projects, one home workspace each | FR-016/017 |
| Claims are **lease-based**, decoupled from runtime liveness | research R1 |
| Board records work; a claim is an exclusive lock, released to pass work along | FR-024a–f |
| Mentions auto-start idle members | FR-035a |
| Bounded by progress, not turns: handbacks 3, wall-clock 30 min, no-progress 12 | research R2–R4 |
| SQLite via `node:sqlite`, one db per project, migrations from v1 | Constitution VII |
| Team is a **route**, not a fourth mobile panel | research R8 |
| Role prompt (user-owned) and MEMORY.md (member-owned) are different things | FR-014a/d/e |

## Traps

Each of these is a silent failure — wrong behaviour with no error.

1. **The 2-minute idle reaper.** `IDLE_AGENT_RUNTIME_TTL_MS` in `bootstrap.ts:218` reclaims idle
   agent runtimes. Two consequences: never implement a blocking wait tool (it dies), and never tie
   claim release to member stop (a member would lose its task two minutes after claiming it, and
   another could steal in-progress work). **T034** and **T077** are the regression tests.
2. **Expo Router fails silently.** A route registered by the wrong layout renders a blank native
   screen with no JavaScript error. Team is a host leaf registered by `h/[serverId]/_layout.tsx`,
   never the root. Read `docs/expo-router.md` before touching `packages/app/src/app/`. **T046**
   verifies on a real native build.
3. **Guards must not interrupt productive work.** A guard that stops a converging QA loop is the
   worst failure mode here — it breaks the feature while looking like it is working. **T085**.
4. **`autoArchiveAfterMerge`** archives a workspace when its branch merges, which would strand a
   member on every success. **T067** adds the exemption; **T068** tests it.
5. **Not a mobile panel.** `docs/mobile-panels.md` forbids adding another panel translate shared
   value. Team has its own layout and must not join the workspace three-panel gesture system.
6. **`docs/glossary.md` currently forbids "Task"** as a synonym for Agent session. The taskboard's
   Task is a different concept; **T115** must disambiguate both, not overwrite one.

## Constraints

- **Fork-owned directories only**: `packages/protocol/src/team/`,
  `packages/server/src/server/team/`, `packages/app/src/screens/team/`,
  `packages/app/src/app/h/[serverId]/team/`.
- **Eight upstream seams only** — listed in `plan.md` and `docs/fork.md`. Each seam task updates
  that table in the same change. If a seam outgrows "one import + one registration call", move logic
  back into a fork-owned file rather than letting it grow.
- **Never modify** `chat-service.ts` or `loop-service.ts`.
- **TDD in vertical slices** (`docs/testing.md`): one test, then its implementation. Not all tests
  first — that produces tests of imagined behaviour.
- **Real dependencies.** Real SQLite in every storage test, never a mock database.
- **Per-file test runs only**: `npx vitest run <file> --bail=1`. Never the full suite locally — it
  will freeze the machine. Push to CI for full verification.
- `npm run typecheck` and `npm run lint` after every change; `npm run format` before committing.
- **Never restart the daemon on port 6767** without permission.
- Protocol stays backward compatible both directions; new RPCs use dotted namespaces
  (`docs/rpc-namespacing.md`); wire schemas stay pure (`docs/protocol-validation.md`).

## Acceptance

- [ ] T001–T025 complete: deps installed, storage, migrations, protocol schemas, member identity
- [ ] **MVP = Phases 1–3.** Quickstart step 1 passes: two members hold a multi-turn exchange after
      one human message (SC-002)
- [ ] Invariant tests green: T034, T077, T085, T068, T062, T104
- [ ] `docs/fork.md` table matches the upstream files actually touched
- [ ] Glossary and `docs/data-model.md` updated (Principles VI and VII)

## First actions

1. `npm install`, then `npm run build:server` (T001).
2. Read the constitution and `docs/fork.md`.
3. Start T005 — the migration runner test. Everything else reads or writes through it.

## Open

- Nothing blocking. Three threshold defaults (3 / 30 min / 12) are chosen and justified in R2–R4;
  tune only with the user.
- **Relay carve-out is a separate, unwritten spec.** This fork must stop defaulting to getpaseo's
  hosted relay and app URLs, with its own Cloudflare worker as the default. Unrelated to team
  parity — do not fold it in. Gotcha for whoever writes it: `useTls` is inferred from
  `endpoint === DEFAULT_RELAY_ENDPOINT`, so swapping the constant alone wrongly assumes TLS for a
  self-hosted plaintext endpoint.
