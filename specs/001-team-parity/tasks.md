---
description: "Task list for Team Parity"
---

# Tasks: Team Parity

**Input**: Design documents from `/specs/001-team-parity/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md,
`.specify/memory/constitution.md` (v1.1.1), `docs/fork.md`

**Tests**: TDD is required by Constitution Principle IV and `docs/testing.md`. Work in **vertical
slices** — one test, then its implementation, then the next. Do not write all tests for a phase up
front; that produces tests of imagined behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on incomplete work
- **[Story]**: US1–US4, on user-story phases only

## Standing rules for every task

1. **Fork-owned paths only.** New code goes in `packages/protocol/src/team/`,
   `packages/server/src/server/team/`, `packages/app/src/screens/team/`,
   `packages/app/src/app/h/[serverId]/team/`. The nine seams below are the **only** permitted edits
   to upstream files.
2. **Never modify** `packages/server/src/server/chat/chat-service.ts` or
   `packages/server/src/server/loop-service.ts` (Constitution VIII).
3. **Every seam task updates the touched-file table in `docs/fork.md`** in the same change.
4. **Real dependencies.** Real SQLite in every storage test. Never a mock database.
5. **Per-file test runs only**: `npx vitest run <file> --bail=1`. Never the full suite locally.
6. **Each task ends green**: `npm run typecheck` and `npm run lint` pass before it is done.

---

## Phase 1: Setup

**Purpose**: This checkout has no dependencies installed. Nothing else can run until it does.

- [x] T001 Run `npm install` at repo root, then `npm run build:server` to generate protocol, client, and server declarations
- [x] T002 Verify `node:sqlite` availability in the daemon's Node version with a scratch script: open `:memory:`, create a table, run `VACUUM INTO` to a temp path; delete the script afterwards
- [x] T003 [P] Create fork-owned directory skeletons with a placeholder `.gitkeep` in `packages/protocol/src/team/`, `packages/server/src/server/team/storage/`, `packages/app/src/screens/team/`, `packages/app/src/app/h/[serverId]/team/`
- [x] T004 [P] Add the "Fork-owned directories" rows for this feature to the table in `docs/fork.md` if any are missing

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Storage, migrations, protocol schemas, and the minimal member record. **No user story
can start until this phase completes.**

Minimal member identity lives here rather than in US2 because messages need an author. US2 adds what
makes members _persistent and expert_ — role prompts, home directories, templates, workspace
lifecycle.

### Storage foundation

- [x] T005 Write a failing test for the migration runner in `packages/server/src/server/team/storage/migrations.test.ts`: a fresh database reaches the latest `PRAGMA user_version`, migrations are idempotent on reopen, and a database stamped with a **newer** version than the code is refused with a clear error rather than opened
- [x] T006 Implement the forward-only migration runner in `packages/server/src/server/team/storage/migrations.ts`, applying each `{version, up(db)}` inside a transaction
- [x] T007 Write a failing test in `packages/server/src/server/team/storage/database.test.ts` asserting the connection pragmas from data-model.md are actually set: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`
- [x] T008 Implement `packages/server/src/server/team/storage/database.ts` — open via `node:sqlite` `DatabaseSync`, apply pragmas, cache one handle per project, run migrations on open
- [x] T009 Implement the v1 schema migration in `packages/server/src/server/team/storage/migrations.ts` for `<projectId>.db`: `project_members`, `channels`, `messages`, `message_mentions`, `tasks`, `task_dependencies`, `task_notes`, `task_acceptance_criteria`, `progress_events`, `project_settings`, per data-model.md
- [x] T010 Implement the v1 schema migration for `roster.db`: `members` table with `role_prompt`, `template_id`, `kind`, `archived_at`
- [x] T011 Write a failing test in `packages/server/src/server/team/storage/database.test.ts` proving the unique index on `project_members.home_workspace_id` rejects two members sharing one workspace (FR-018), then confirm the T009 schema satisfies it
- [x] T012 Write a failing test for keyset pagination in `packages/server/src/server/team/storage/project-store.test.ts`: seed 10,000 messages, page backwards with a cursor, assert no page re-reads rows and `EXPLAIN QUERY PLAN` uses the `(channel_id, created_at DESC, id DESC)` index
- [x] T013 Implement `packages/server/src/server/team/storage/project-store.ts` with Zod validation at every read boundary (Principle V)
- [x] T014 Implement `packages/server/src/server/team/storage/roster-store.ts` with Zod validation at every read boundary

### Protocol schemas

- [x] T015 [P] Create wire types in `packages/protocol/src/team/types.ts`: `TeamMember`, `TeamChannel`, `TeamMessage`, `TeamTask`, `TeamTaskNote`, `TeamProjectSettings`, `TeamRoleTemplate`
- [x] T016 [P] Create `packages/protocol/src/team/capabilities.ts` declaring the `features.team` flag shape with the single `// COMPAT(team): added in v0.2.3, drop the gate when floor >= v0.2.3` comment
- [x] T017 Create `packages/protocol/src/team/rpc-schemas.ts` with every `.request`/`.response` pair from `contracts/rpc.md`, using `z.discriminatedUnion` and **no** `.transform`/`.catch`/`.preprocess` (Constitution I)
- [x] T018 Write a failing test in `packages/protocol/src/team/rpc-schemas.test.ts` asserting schema purity: no transforms, every response carries `requestId` and a nullable `error`, and unknown extra fields do not break parsing
- [x] T019 **SEAM** Register team schemas in the session inbound/outbound discriminated unions in `packages/protocol/src/messages.ts`; update the `docs/fork.md` touched-file table
- [x] T020 Write a backward-compatibility test in `packages/protocol/src/team/rpc-schemas.test.ts`: a payload lacking every optional team field still parses, and an old-shaped session message is unaffected by the new union entries

### Server wiring

- [x] T021 Implement `packages/server/src/server/team/team-session.ts` exposing `isTeamRequest(msg)` and a single `handle(msg)` entry point
- [x] T022 **SEAM** Add the one-line delegation `if (isTeamRequest(msg)) return this.teamSession.handle(msg)` before the existing switch in `packages/server/src/server/session.ts`; update `docs/fork.md`
- [x] T023 Implement minimal member identity in `packages/server/src/server/team/team-service.ts`: create, list, soft-delete members; create the single `kind: "human"` row on first start (FR-006a)
- [x] T024 **SEAM** Construct `TeamService` in `packages/server/src/server/bootstrap.ts` and publish the `features.team` capability flag; update `docs/fork.md`
- [x] T025 Write a test in `packages/server/src/server/team/team-service.test.ts` asserting a member survives a service restart with configuration intact (FR-015)

**Checkpoint**: storage, migrations, protocol, and member identity exist. User stories can begin.

---

## Phase 3: US1 — Agents coordinate without the human relaying (P1) 🎯 MVP

**Goal**: Two members hold a multi-turn exchange in a channel after one human message.

**Independent test**: Create a project with two members, post one message requiring both, and verify
a multi-turn agent-to-agent exchange completes with the human sending exactly one message (SC-002).

### Channels and messages

- [x] T026 [US1] Write a failing test in `packages/server/src/server/team/team-service.channels.test.ts` for channel create/list/update/delete, including that deleting a channel cascades its messages
- [x] T027 [US1] Implement channel operations in `packages/server/src/server/team/team-service.ts`
- [x] T028 [US1] Write a failing test in `packages/server/src/server/team/team-service.messages.test.ts`: posting parses `@name` mentions into `message_mentions` rows in an explicit **post-validation** pass, never in the wire schema
- [x] T029 [US1] Implement message posting and mention extraction in `packages/server/src/server/team/team-service.ts`
- [x] T030 [US1] Write a failing test in `packages/server/src/server/team/team-service.messages.test.ts` asserting a mention of a member not assigned to the project fails with a message naming the problem, rather than silently not delivering
- [x] T031 [US1] Implement paginated message reads over `project-store.ts` keyset pagination

### Member lifecycle — the reaper interaction

- [x] T032 [US1] Write a failing test in `packages/server/src/server/team/member-lifecycle.test.ts`: mentioning a member with **no running session** starts one and delivers the mention as its prompt (FR-035a)
- [x] T033 [US1] Implement `packages/server/src/server/team/member-lifecycle.ts` — start-on-mention using the existing agent manager, with the member's role prompt as `AgentConfig.systemPrompt`
- [x] T034 [US1] **INVARIANT TEST** Write a test in `packages/server/src/server/team/member-lifecycle.test.ts` asserting **no blocking wait tool exists** and no member is held resident to stay reachable — a member idle past `IDLE_AGENT_RUNTIME_TTL_MS` is still reachable by mention (research R5)
- [x] T035 [US1] Write a failing test asserting `auto_started` is recorded on messages written by automatically started sessions (FR-035i)

### MCP tools

- [x] T036 [US1] Write a failing test in `packages/server/src/server/team/mcp-tools.test.ts` for `team_post`, including that project scope is derived from the calling member and never accepted as a parameter (FR-034 — a trust boundary, so validated not assumed)
- [x] T037 [US1] Implement `team_post` in `packages/server/src/server/team/mcp-tools.ts`
- [x] T038 [US1] [P] Write a failing test then implement `team_read` with keyset paging and author names resolved
- [x] T039 [US1] [P] Write a failing test then implement `team_roster`, including the human identity so members know what to mention when escalating
- [x] T040 [US1] Write a failing test in `packages/server/src/server/team/mcp-tools.test.ts` asserting a member cannot read or post to a project it is not assigned to (FR-034)
- [x] T041 [US1] **SEAM** Register `team_*` tools in `packages/server/src/server/agent/tools/paseo-tools.ts`; update `docs/fork.md`

### Live updates

- [x] T042 [US1] Implement server-pushed `team.message.posted` events in `packages/server/src/server/team/team-service.ts`, carrying `projectId` so other-project clients discard cheaply
- [x] T043 [US1] Write a test in `packages/server/src/server/team/team-service.events.test.ts` asserting two connected sessions viewing the same channel both receive a posted message (edge case: same project open in two clients)

### App — routing and Chat section

- [x] T044 [US1] **SEAM** Add `buildHostTeamRoute(serverId, section)` to `packages/app/src/utils/host-routes.ts` **by appending**, plus a test in `packages/app/src/utils/host-routes.test.ts`; update `docs/fork.md`
- [x] T045 [US1] **SEAM** Create the route file `packages/app/src/app/h/[serverId]/team/[section].tsx` and register it with a single `<Stack.Screen>` in `packages/app/src/app/h/[serverId]/_layout.tsx` — the **host** layout, never the root (`docs/expo-router.md`); update `docs/fork.md`
- [ ] T046 [US1] Verify on a native build that the Team route mounts and renders — a misplaced route fails **silently** with a blank screen and no JavaScript error
- [x] T047 [US1] Implement `packages/app/src/screens/team/team-screen.tsx`: section switcher, project scoping, and the daemon indicator required by FR-001a
- [x] T048 [US1] Implement the capability gate in exactly one place — absent `features.team` hides the entry and renders "Update the host to use this" on deep link. No degraded view, no fallback to legacy `chat/*` RPCs (Constitution II)
- [x] T049 [US1] [P] Implement the channel list in `packages/app/src/screens/team/chat/channel-list.tsx` using existing primitives from `packages/app/src/components/ui/` (`docs/design.md`)
- [x] T049a [US1] Implement client-side channel creation using the existing `team.channel.create` RPC, a non-React form model, and a sheet reachable from the zero-channel state (FR-005)
- [x] T049b [US1] Implement channel rename, purpose editing, and confirmed deletion using the existing `team.channel.update/delete` RPCs, refreshing the list and preserving a valid active selection (FR-005)
- [x] T049c [US1] Drive channel management through the real browser UI and verify persistence through the checkout-local daemon
- [x] T050 [US1] Implement the message list in `packages/app/src/screens/team/chat/message-list.tsx` with incremental loading and stable ordering
- [x] T051 [US1] Implement the composer in `packages/app/src/screens/team/chat/message-composer.tsx` with `@` mention autocomplete over the project roster
- [x] T052 [US1] Render member activity in `packages/app/src/screens/team/chat/member-activity-strip.tsx` so working and idle members are distinguishable at a glance (FR-012, SC-011)
- [x] T053 [US1] Implement pending/success/failure states for posting, keeping an actionable error visible in context until retried or dismissed (FR-004, `docs/testing.md`)
- [x] T054 [US1] **SEAM** Add the Team nav row to `packages/app/src/components/left-sidebar.tsx` — labels type, labels map, handler, active-path check, and **both** the compact and wide render paths; update `docs/fork.md` noting this is the ~6-line seam
- [x] T055 [US1] Write a Playwright test in `packages/app/` covering post-message success and post-message failure, asserting what the user can see and do after the failure — not a response field or log line
- [ ] T056 [US1] **STORY VALIDATION** Execute quickstart step 1 end to end: two members, one human message, multi-turn agent-to-agent exchange (SC-002)

**Checkpoint**: US1 is independently shippable. Agent-to-agent coordination works.

---

## Phase 4: US2 — A team that persists (P2)

**Goal**: Specialist members with their own role prompts and accumulated memory, surviving restarts,
merges, and worktree removal.

**Independent test**: Create three members, restart the daemon, verify all three retain name,
description, role prompt, project assignments, and home workspaces (SC-005).

- [x] T057 [US2] Write a failing test in `packages/server/src/server/team/team-service.members.test.ts` asserting a member's `role_prompt` is applied as `AgentConfig.systemPrompt` on every session it runs (FR-014a)
- [x] T058 [US2] Implement role prompt storage and application in `packages/server/src/server/team/team-service.ts`
- [x] T059 [US2] [P] Implement built-in role templates as data in `packages/server/src/server/team/role-templates.ts` (lead, UI, QA, release, docs) with `team.member.list_templates` — no store, no distribution format (research R10)
- [x] T060 [US2] Write a failing test in `packages/server/src/server/team/member-home.test.ts`: creating a member creates `~/.paseo/team/members/<id>/` with a seeded `MEMORY.md`, `notes/`, `artifacts/`
- [x] T061 [US2] Implement `packages/server/src/server/team/member-home.ts`, injecting the directory path and the FR-014e prompt-vs-memory distinction into the member's session context
- [x] T062 [US2] **INVARIANT TEST** Write a test asserting a member's home directory and `MEMORY.md` are byte-identical after its home workspace is archived, its worktree removed, and it is re-pointed at a new workspace (FR-019b, SC-011b)
- [x] T063 [US2] Write a failing test then implement `team.member.list_home_files` and `team.member.read_home_file`, validating the requested path resolves inside the member's home directory — a trust boundary, not a convenience check
- [x] T064 [US2] Write a failing test then implement `team_propose_members` in `packages/server/src/server/team/mcp-tools.ts`, asserting it **creates nothing** and only returns proposals (FR-014c, research R10)
- [x] T065 [US2] Implement project assignment and home workspace selection in `packages/server/src/server/team/team-service.ts`, surfacing the FR-018 uniqueness constraint as a usable error rather than a raw constraint violation
- [x] T066 [US2] Write a failing test in `packages/server/src/server/team/team-service.members.test.ts` asserting a member whose home workspace disappears survives, is flagged unable to run, and cannot run until re-pointed (FR-019)
- [x] T067 [US2] **SEAM** Add a guard clause to `packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts` so a member's home workspace is never auto-archived; update `docs/fork.md`
- [x] T068 [US2] **INVARIANT TEST** Write a test asserting that with `autoArchiveAfterMerge` enabled, merging a member's branch leaves its home workspace intact and the member runnable (SC-011c) — a feature that punishes success is a bug
- [x] T069 [US2] Write a test in `packages/server/src/server/team/team-service.members.test.ts` asserting removing a member leaves its messages readable and correctly attributed (FR-022)
- [x] T070 [US2] [P] Implement the roster view in `packages/app/src/screens/team/members/member-list.tsx` — status, description, home workspace, channels
- [x] T071 [US2] Implement the member detail view in `packages/app/src/screens/team/members/member-detail.tsx` including an editable role prompt and a `MEMORY.md` reader (FR-014f)
- [x] T072 [US2] Implement the create/edit member form in `packages/app/src/screens/team/members/member-form.tsx` following `docs/forms.md` — non-React form model, load-state gating — covering every field a member owns: name, description, runtime and model (FR-014, reusing the existing provider/model pickers — this feature adds no new provider surface), role prompt, template picker, project assignments (FR-016), and home workspace per project (FR-017). The FR-018 uniqueness conflict MUST surface as a usable error naming the member already holding that workspace, never a raw constraint violation
- [x] T072a1 [US2] Implement the `team.member.start` and `team.member.stop` handlers in `packages/server/src/server/team/member-lifecycle.ts` and `team-session.ts` (FR-021). Stopping ends the runtime and **must not** release the member's claims — a member paused by the user would otherwise have its in-progress work taken (research R1). This task was missing: the RPCs were specified in `contracts/rpc.md` and the schemas generated, but no task implemented the handlers
- [x] T072a [US2] Implement member lifecycle actions in `packages/app/src/screens/team/members/member-actions.tsx` — start, stop, and remove (FR-021). Removal MUST state that history is preserved and attribution kept (FR-022) before it is confirmed, and a member flagged unable to run (lost home workspace, FR-019) MUST show why and offer re-pointing rather than a disabled button with no explanation
- [x] T073 [US2] Implement proposal review cards in `packages/app/src/screens/team/members/member-proposal-cards.tsx` so each proposed member is created only on individual confirmation (FR-014c)
- [ ] T074 [US2] **STORY VALIDATION** Execute quickstart steps 8, 12, and 13 (worktree removal, memory survival, merge does not strand)

**Checkpoint**: members are durable and accumulate expertise.

---

## Phase 5: US3 — Shared work tracking (P3)

**Goal**: A Kanban board where claims are exclusive locks and non-converging work escalates.

**Independent test**: Create tasks, have members claim and move them, verify the board reflects every
change in both directions and that contention resolves to exactly one holder (SC-012).

### Claims — the correctness core

- [x] T075 [US3] Write a failing test in `packages/server/src/server/team/claims.test.ts` asserting the conditional-UPDATE claim from data-model.md: two concurrent claims on one task, exactly one succeeds, the loser is told who holds it (FR-024a)
- [x] T076 [US3] Implement `packages/server/src/server/team/claims.ts` — acquire, renew on progress, release, expire — with exclusivity from the SQL predicate, not application-level care
- [x] T077 [US3] **INVARIANT TEST** Write a test in `packages/server/src/server/team/claims.test.ts` asserting a claim **survives the idle runtime reaper**: a member claims a task, its runtime is collected past `IDLE_AGENT_RUNTIME_TTL_MS`, and the claim is still held and unexpired (research R1, quickstart step 3). This is the regression test that prevents members stealing in-progress work
- [x] T078 [US3] Write a failing test in `packages/server/src/server/team/claims.test.ts` asserting a task with unmet dependencies cannot be claimed and the refusal names the blockers (FR-024f)
- [x] T079 [US3] Write a failing test in `packages/server/src/server/team/claims.test.ts` asserting only the claimant may change status, edit, or annotate, and that the user can always override (FR-024b)
- [x] T080 [US3] Write a failing test in `packages/server/src/server/team/claims.test.ts` asserting a claim is released when its holder is removed or loses its home workspace, so no task is stranded (FR-024e)

### Tasks and guards

- [x] T081 [US3] Implement task CRUD, dependencies, notes, and acceptance criteria in `packages/server/src/server/team/team-service.ts` with the per-project `seq` counter for `#18`-style references
- [x] T082 [US3] Implement `progress_events` writes for every claim, release, status change, note, and satisfied criterion
- [x] T083 [US3] Write a failing test in `packages/server/src/server/team/review-cycle.test.ts` asserting handback increments the count, releases the claim, and resets on acceptance (FR-035c)
- [x] T084 [US3] Implement `packages/server/src/server/team/review-cycle.ts` — handback counting, escalation at the limit, guards. Reuse the _semantics_ of `loop-service.ts`; do not import from or modify it
- [x] T085 [US3] **INVARIANT TEST** Write a test in `packages/server/src/server/team/review-cycle.test.ts` asserting a **converging** review loop is never interrupted regardless of round count, as long as progress is recorded (SC-015) — a guard that stops productive work is the worst failure mode in this feature
- [x] T086 [US3] Write a failing test in `packages/server/src/server/team/review-cycle.test.ts` asserting a non-converging task escalates after the handback limit, stops **only that task**, and leaves other members working (FR-035d, FR-035e)
- [x] T087 [US3] Write a failing test in `packages/server/src/server/team/review-cycle.test.ts` asserting the per-attempt wall-clock limit stops a member wedged inside one attempt, where the handback count never increments (FR-035d1)
- [x] T088 [US3] Write a failing test in `packages/server/src/server/team/review-cycle.test.ts` asserting the no-progress backstop stops members exchanging messages without touching work, and that any progress event or user message resets it (FR-035f)
- [x] T089 [US3] Implement escalation delivery in `packages/server/src/server/team/review-cycle.ts` through the existing notification path, verified with the app backgrounded rather than open on the Team view (FR-035e1, SC-017a)
- [x] T090 [US3] Implement `team.project.stop_all` and `team.project.resume` with counter resets (FR-035g, FR-035h)
- [x] T091 [US3] Implement `project_settings` defaults from research: handbacks 3, attempt timeout 30 min (also the claim lease TTL), no-progress backstop 12, message retention cap 50,000 (user-chosen placeholder, not derived from research — revisit at T108/T109)
- [x] T091a [US3] Write a failing test then implement the `team.project.get_settings` and `team.project.update_settings` handlers in `packages/server/src/server/team/team-service.ts`, validating each value at the trust boundary — a retention cap of `0` or a negative attempt timeout must be refused with a message naming the valid range, never persisted
- [x] T091b [US3] Implement the project settings view in `packages/app/src/screens/team/settings/project-settings-form.tsx` following `docs/forms.md` (non-React form model, load-state gating), exposing all four values — message retention cap, handback limit, attempt timeout, no-progress backstop — as editable fields with their defaults shown, reachable from the Team section switcher. Lowering the retention cap MUST say what it will prune before it is saved (FR-040 discoverability)
- [x] T092 [US3] Write a failing test then implement `team_tasks` and `team_task_update` in `packages/server/src/server/team/mcp-tools.ts`, asserting every refusal explains what to do next — a bare "denied" makes members retry in a loop

### App — board

- [x] T093 [US3] [P] Implement the board in `packages/app/src/screens/team/tasks/task-board.tsx` with Todo/In Progress/In Review/Done columns and counts
- [x] T094 [US3] Implement drag between columns, reusing `packages/app/src/components/draggable-list.*` rather than a new gesture implementation
- [x] T095 [US3] [P] Implement the list view and the board/list toggle in `packages/app/src/screens/team/tasks/task-list.tsx`
- [x] T096 [US3] Implement creator and assignee filters in `packages/app/src/screens/team/tasks/task-filters.ts`, persisting while the user stays in the view (FR-026)
- [x] T097 [US3] Implement task detail in `packages/app/src/screens/team/tasks/task-detail.tsx` — editable fields, notes in time order, acceptance criteria, dependencies, handback count, and claimant shown distinctly from assignee (FR-024d)
- [x] T098 [US3] Render inline `#18`, `#channel`, and `@member` references in message bodies as navigable links, degrading readably when the target is deleted (FR-011)
- [x] T099 [US3] Implement live task updates via `team.task.changed` without manual refresh (FR-028)
- [x] T100 [US3] Verify compact parity: every board action completable at phone width, including moving a task between columns (SC-010), and confirm Team does **not** participate in the workspace three-panel swipe (`docs/mobile-panels.md`)
- [ ] T101 [US3] **STORY VALIDATION** Execute quickstart steps 2, 4, and 5 (claim exclusivity, converging loop uninterrupted, escalation)

**Checkpoint**: work is tracked, contention is safe, runaway loops are bounded.

---

## Phase 6: US4 — The record survives (P4)

**Goal**: History and task state survive crashes, upgrades, and mistakes, without unbounded growth.

**Independent test**: Populate a project, force an unclean shutdown mid-write, restart, and verify no
acknowledged message or task change is lost (SC-006).

- [x] T102 [US4] Write a failing test in `packages/server/src/server/team/adoption.test.ts` importing rooms and messages from a fixture `~/.paseo/chat/rooms.json` into a chosen project, with an adoption marker preventing re-import
- [x] T103 [US4] Implement `packages/server/src/server/team/adoption.ts` — copy, never move; leave the original file untouched
- [x] T104 [US4] **INVARIANT TEST** Write a test asserting `paseo chat ls` and `paseo chat read` still work unchanged after adoption (SC-008, Constitution VIII) — upstream's service must be untouched
- [x] T105 [US4] Implement the one-time adoption prompt, since existing rooms carry no `projectId` and the target cannot be safely inferred (research R7)
- [x] T106 [US4] Write a failing test in `packages/server/src/server/team/storage/backup.test.ts` asserting `VACUUM INTO` produces a readable snapshot **while a concurrent write is in flight**, and that only the last 3 are retained
- [x] T107 [US4] Implement `packages/server/src/server/team/storage/backup.ts` — snapshot on daemon start and every 24h, per database, pruning to 3 (FR-039)
- [x] T108 [US4] Write a failing test in `packages/server/src/server/team/retention.test.ts` asserting messages beyond the per-project cap are pruned oldest-first on start, and the pruned count is recorded and readable by the user (FR-040)
- [x] T109 [US4] Implement `packages/server/src/server/team/retention.ts`, pruning at start only — never on the write path, and never while the user is reading
- [x] T110 [US4] Write a failing test asserting an acknowledged message survives `kill -9` mid-write (FR-038, SC-006), proving the WAL and `synchronous` settings are correct
- [x] T111 [US4] Write a failing test in `packages/server/src/server/team/storage/database.test.ts` asserting a corrupt or unreadable team database lets the daemon start, surfaces the failure, and offers recovery from the most recent snapshot without hand tooling (FR-042)
- [x] T112 [US4] Implement restore-from-snapshot in `packages/server/src/server/team/storage/backup.ts` and surface it in `packages/app/src/screens/team/team-recovery.tsx` as a user-facing action requiring no terminal (SC-009)
- [x] T113 [US4] Write a failing test in `packages/server/src/server/team/storage/database.test.ts` asserting deleting a project removes only that project's team data (FR-041)
- [ ] T114 [US4] **STORY VALIDATION** Execute quickstart steps 6, 9, and 10 (unclean shutdown, adoption with CLI intact, cross-daemon independence)

**Checkpoint**: the data is durable and bounded.

---

## Phase 7: Polish & cross-cutting

- [x] T115 [P] Add glossary entries to `docs/glossary.md` for Member, Channel, Task, Claim, Home workspace, and Member home directory — **disambiguating Task from Agent session**, which the glossary currently lists as a forbidden synonym (Constitution VI)
- [x] T116 [P] Add the SQLite boundary section to `docs/data-model.md` per Constitution VII, so the exception is not later read as general license
- [x] T117 [P] Add `docs/team.md` covering the Team surface, guard thresholds, and the claim model
- [x] T118 Verify the `docs/fork.md` touched-file table lists every upstream file actually modified, and that each entry is still the size it claims. An entry that outgrew "one-line seam" is a signal to move logic back into a fork-owned file
- [x] T119 [P] Add i18n strings for all new UI per `docs/i18n.md`; no hardcoded user-facing text
- [x] T120 Verify hover behaviour follows `docs/hover.md` — plain `View` with a separate inner `Pressable`, `isHovered || isNative || isCompact` for hover-to-reveal controls, and no `onPointerEnter`/`onPointerLeave`
- [x] T121 Verify no `useUnistyles()` anywhere in the new app code (`docs/unistyles.md`)
- [ ] T122 Execute quickstart steps 7, 11, and 14 (large-history performance, compact parity, backward compatibility both directions)
- [x] T123 Run `npm run typecheck`, `npm run lint`, and `npm run format`, then push and verify the full suite on CI rather than locally

---

## Phase 8: Design completion increment

- [x] T124 Add a real SQLite channel read cursor and unread-count query, covered by a real-database
      migration/storage test (FR-008a).
- [x] T125 Add the backward-compatible unread field, `team.channel.mark_read` RPC, and
      `teamChannelReads` capability with protocol and session tests (FR-008b).
- [x] T126 Render unread affordances, clear them by calling the daemon when a channel is viewed,
      and render only the truthful coarse working presence from member status.
- [x] T127 Implement one board-owned dnd-kit context on web, with each status column droppable and
      moves delegated to the existing task update path; retain the native explicit move menu
      (FR-025a).
- [x] T128 Triage the system-note pill, composer attachments, channel bell, and panel-right
      control. Implement only elements with durable backing and document every omission.
- [x] T129 Run targeted Team app/server tests, typecheck, lint, format, and real browser
      verification including full-reload persistence for unread and task moves.

---

## Phase 9: Ambient wake and live member status increment

- [x] T130 Add focused lifecycle tests for human fan-out, member mention-only delivery, explicit
      interruption, and ambient busy-member non-interruption (FR-007a, FR-007b).
- [x] T131 Resolve message deliveries once in `member-lifecycle.ts`, preserving explicit mention
      behavior while ambient human delivery fans out to the current channel member set.
- [x] T132 Add focused event tests proving running and idle member transitions produce
      `team.member.changed` with the live decorated member (FR-012a).
- [x] T133 Produce and forward live member status changes from one daemon lifecycle subscription
      without adding the agent manager to `TeamService`.
- [x] T135 Add focused tests for cursor-backed busy-member deferral, all-author consolidated
      catch-up, own-post cursor advancement, and catch-up termination (FR-007c).
- [x] T136 Advance member cursors on successful delivery and own posts, then deliver one
      consolidated catch-up wake from the existing completion lifecycle hook without a new queue
      or schema (FR-007c).
- [x] T134 Run the focused Team tests, typecheck, lint, format, and isolated-daemon live
      verification that an open Team view flips member status without navigation or reload and two
      busy members catch up once before the exchange rests.
- [x] T137 Add and test load-bearing member etiquette that makes a no-op wake correct, prevents
      uninvited replies and idle narration, and reserves outcome reporting for the member that did
      the work (FR-007d).
- [x] T138 Widen the single delivery resolver to wake idle peers for every channel message, exclude
      the author, and add a log-only consecutive-agent-message warning (FR-007a, FR-007b, FR-007d).
- [x] T139 Re-run the isolated-daemon live scenario with an agent-authored message and prove a
      two-member exchange returns to idle without ping-ponging (SC-004b).

---

## Dependencies

```text
Phase 1 Setup
    ↓
Phase 2 Foundational  ← BLOCKS EVERYTHING
    ↓
Phase 3 US1 (P1) ── independently shippable MVP
    ↓
Phase 4 US2 (P2) ── needs US1's member lifecycle
    ↓
Phase 5 US3 (P3) ── needs US2's members for assignment and claims
    ↓
Phase 6 US4 (P4) ── protects data the earlier stories produce
    ↓
Phase 7 Polish
```

Within Phase 2, ordering is strict: migrations and schema (T005–T011) before any store reads or
writes them; protocol schemas (T015–T020) before any server or app work depends on them.

US4 is sequenced last but **ships with the others, not after** — it protects the data they produce.

## Parallel opportunities

- **Phase 1**: T003, T004
- **Phase 2**: T015 and T016 together; T013 and T014 once T009/T010 land
- **Phase 3**: T038 and T039 together; T049 alongside server work
- **Phase 4**: T059 and T070 together
- **Phase 5**: T093 and T095 together
- **Phase 7**: T115, T116, T117, T119 all together

App and server work within a story can proceed in parallel once that story's protocol schemas exist.

## Implementation strategy

**MVP is Phase 1 + Phase 2 + Phase 3 (US1).** That delivers the one capability Paseo cannot do
today: agents coordinating without the human as message bus. Everything after it is durability,
legibility, and scale.

Stop after any checkpoint and have something coherent. Do not start Phase 5 before Phase 4 —
claims without persistent members are claims by ephemeral agents, which is the model this feature
exists to replace.

**Three tasks are load-bearing.** If any regresses, the feature is quietly broken rather than
visibly failing:

- **T077** — claims survive the idle reaper. Without it, members steal each other's in-progress work.
- **T085** — converging loops are never interrupted. Without it, the guards break the QA cycle they
  exist to protect.
- **T034** — no blocking wait tool. The obvious implementation is the one that dies to the reaper.
