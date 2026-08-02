<!--
Sync Impact Report
==================
Version change: (template) → 1.0.0 → 1.1.0
Bump rationale:
  1.0.0 — Initial ratification. Template placeholders replaced with concrete principles
          derived from CLAUDE.md and docs/. No prior version existed.
  1.1.0 — MINOR. Added Principle VIII (Fork Mergeability) after the decision to keep this
          fork able to merge upstream. Constrains how the team surface may touch upstream
          code; supersedes the earlier intent to reshape chat-service.ts and loop-service.ts
          in place.
  1.1.1 — PATCH. Removed "read state" from the Principle VII SQLite scope. No requirement
          defines unread tracking and the spec's Assumptions exclude an activity inbox, so
          the enumeration authorized scope the feature does not build. Narrowing the
          exception to what is actually built; no principle changed. Raised by
          /speckit-analyze finding F3.

Principles defined:
  I.   Protocol Backward Compatibility (from CLAUDE.md "Critical rules")
  II.  Capability Gates, Not Fallback Paths (from CLAUDE.md "Feature contract")
  III. Cross-Platform By Default (from CLAUDE.md "Platform gating")
  IV.  Behavior-Proving Tests, Real Dependencies (from docs/testing.md)
  V.   Commit To A Shape (from docs/coding-standards.md)
  VI.  Glossary-Authoritative Terminology (from docs/glossary.md)
  VII. Persistence: JSON By Default, SQLite By Exception (extends docs/data-model.md)
  VIII. Fork Mergeability (added 1.1.0)

Added sections:
  - Single-User Scope (new constraint for this fork)
  - Team Surface Data Boundary (new constraint for this fork)
  - Development Workflow

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gate aligns; no edit needed
  ✅ .specify/templates/spec-template.md — no constitution-mandated sections added
  ✅ .specify/templates/tasks-template.md — task categories already cover test-first ordering

Follow-up TODOs:
  - docs/data-model.md needs a section documenting the SQLite boundary (Principle VII).
    Tracked as implementation work, not a constitution deferral.
-->

# Paseo Constitution

Paseo is a single-user tool for monitoring and controlling your local AI coding agents from
anywhere. This constitution governs the fork adding Raft-style team parity: persistent org
agents, agent-to-agent channels, and a project taskboard.

Existing repo documentation is normative. `CLAUDE.md` and `docs/` are not summarized here —
they are incorporated by reference. This document records the non-negotiable rules and the
one place this fork deliberately departs from them.

## Core Principles

### I. Protocol Backward Compatibility

The WebSocket protocol MUST remain parseable in both directions across versions. A six-month-old
client MUST still parse messages from a new daemon, and a six-month-old daemon MUST still send
something a new client accepts.

- New fields are `.optional()` with a sensible default.
- Optional MUST NOT become required. Fields MUST NOT be removed or narrowed
  (`string` → `enum`, `nullable` → non-null).
- Removed fields stay accepted; we stop sending them, not stop reading them.
- Wire schemas are pure structural declarations. No `.transform()`, `.catch()`, or
  `.preprocess()` on WebSocket message schemas — normalization belongs in an explicit
  post-validation pass.
- `z.discriminatedUnion()` over `z.union()` wherever branches share a literal tag.
- New RPCs use dotted namespaces with direction suffixes:
  `domain.provider.operation.request` / `.response`.

Every back-compat shim carries a `COMPAT(name)` comment naming the version it was added in and
a target removal date. `rg "COMPAT\("` MUST produce the complete cleanup list. Back-compat
hidden in untagged `??` fallbacks or optional-chain tunnels is a violation, because it stops
being deletable.

_Rationale: users upgrade the daemon and the app independently, and often months apart. The
protocol is the only contract that cannot be renegotiated at runtime._

### II. Capability Gates, Not Fallback Paths

Features MAY require a new daemon capability. When they do, the client detects the capability
and either runs the feature or tells the user to update the host. That is the entire
degradation story.

- No degraded reimplementation of a new feature for old daemons.
- No fanning out across legacy RPCs to simulate a missing capability.
- Detection happens in exactly one place; downstream code reads a clean shape and contains no
  defensive branches.
- Capability flags live in `server_info.features.*` with a single
  `// COMPAT(featureName): added in v0.1.X, drop the gate when floor >= v0.1.X` comment
  marking the cleanup site.

_Rationale: fallback paths double the surface under test and never get deleted. Existing
functionality keeps working across versions because of Principle I — new-feature degradation
is not a goal._

### III. Cross-Platform By Default

The app runs on iOS, Android, browser web, and Electron desktop. Code is cross-platform unless
there is a specific reason otherwise. Gates are imported from `@/constants/platform`:
`isWeb`, `isNative`, `getIsElectron()`, and `useIsCompactFormFactor()` from `@/constants/layout`.

- Metro file extensions (`.web.ts`, `.native.ts`, `.electron.tsx`) over large runtime
  `if (isWeb)` blocks. Reserve inline gates for a single line or a few props.
- Raw DOM APIs MUST be behind `isWeb`. Casting a React Native ref to `HTMLElement` outside a
  web-only block is a defect.
- `onPointerEnter` / `onPointerLeave` MUST NOT be used — they do not fire on native iOS.
- Hover is web-only. Hover-to-reveal controls use `isHovered || isNative || isCompact` so they
  are always visible where hover cannot fire.
- Layout decisions use breakpoints, never `Platform.OS` as a proxy for screen size.

_Rationale: the team surface is the first feature in this fork with heavy new UI. Platform
divergence introduced there is paid for on every screen thereafter._

### IV. Behavior-Proving Tests, Real Dependencies

Tests prove behavior, not structure. Every test answers: what user-visible or API-visible
behavior does this verify?

- TDD in vertical slices: one test, one implementation, repeat. Writing all tests first, then
  all implementations, produces tests of imagined behavior.
- Real dependencies over mocks. RPC-backed UI uses an app Playwright test with a real browser,
  network, and daemon whenever feasible.
- Determinism is mandatory: no conditional assertions, no branching assertion paths.
- Every fallible user action exposes pending, success, and failure states in the UI, and every
  one needs behavioral coverage for success _and_ failure. The failure test asserts what the
  user can see and do next — not a response field, state value, or log line.
- Tests are run per-file (`npx vitest run <file> --bail=1`). Full suites go to CI, never to a
  developer machine.

_Rationale: agents posting to channels concurrently is exactly the kind of behavior that mocks
report as working and real dependencies report as broken._

### V. Commit To A Shape

Validate at boundaries — network, IPC, user input, file I/O — then trust types internally.
After the parse, a value is what its type says it is.

- Every `?.` and `??` past the validation boundary is unconfident code. Either the boundary
  resolves it or the type reflects reality.
- No defensive checks for conditions the type system rules out.
- Zero complexity budget: every abstraction justifies itself with a specific, current benefit.
  A function called once is indirection, not abstraction.
- No `index.ts` barrel files that only re-export.
- Comments explain _why_. Delete any comment whose removal loses zero information. No
  commented-out code, no `TODO: implement` stubs, no hedging.
- No "while I'm at it" cleanups — drive-by edits hide in the diff.

_Rationale: this fork adds a large amount of new surface at once. Hedged code compounds
fastest exactly when volume is high._

### VI. Glossary-Authoritative Terminology

`docs/glossary.md` is the single source of truth for product vocabulary. The UI label wins.
Synonyms are forbidden, including in code identifiers.

New concepts introduced by this fork MUST be added to the glossary in the same change that
introduces them, with their code location and any forbidden synonyms. This fork's new terms —
Member, Channel, Task, Home workspace — MUST NOT collide with existing entries. In particular,
`docs/glossary.md` already forbids "Task" as a synonym for **Agent session**; the taskboard's
Task is a distinct, newly-defined concept and the glossary MUST disambiguate both.

_Rationale: Raft's vocabulary and Paseo's vocabulary overlap without matching. Silent conflation
of Raft's "server" with Paseo's Project, or Raft's flat agent with Paseo's Agent session, would
corrupt the model._

### VII. Persistence: JSON By Default, SQLite By Exception

`docs/data-model.md` establishes file-based JSON persistence with Zod validation and atomic
writes, and no schema-versioning framework. That remains the default for all existing stores:
projects, workspaces, agents, schedules, and config MUST NOT be migrated to a database.

This fork takes one bounded exception. SQLite (via the built-in `node:sqlite` — no new
dependency) is permitted **only** for the team surface: channel messages, tasks, the member
roster. These are the first genuinely query-shaped, append-heavy, concurrently written data in
Paseo, where document-shaped JSON fails on pagination, aggregate queries, and concurrent writes.

The exception carries obligations:

- A forward-only migration runner keyed on `PRAGMA user_version` exists from the very first
  schema version, before any schema ships.
- Every database is validated at its boundary with Zod on read, exactly as JSON stores are.
  SQLite replaces the storage engine, not Principle V.
- `docs/data-model.md` MUST document this boundary and its rationale, so the exception is not
  later read as general license, and so nobody "corrects" it back to JSON.
- Extending SQLite to any store outside the team surface requires amending this constitution.

_Rationale: the exception is justified by data shape, not by preference. Naming its boundary
explicitly is what keeps it an exception._

### VIII. Fork Mergeability

This repository is a fork of an actively developed upstream project, and MUST remain able to merge
upstream fixes and features. Merge conflicts occur in files upstream also edits, so the governing
metric is not diff size but **diff surface in upstream-owned files**.

- New behaviour goes in new files, in fork-owned directories. New files never conflict.
- Where an upstream file MUST be touched, the edit is a **seam**: one import and one registration
  call. All logic lives in fork-owned files. A seam conflict is resolved by re-adding one line.
- Upstream services MUST NOT be reshaped in place to serve fork features. Build alongside them and
  leave their existing behaviour and consumers working. Duplicating a concept is cheaper than
  permanently owning a merge conflict in an actively developed file. This explicitly applies to
  the daemon's chat service and loop service.
- Formatting-only, renaming-only, or "while I'm at it" changes to upstream files are forbidden —
  they create conflicts that buy nothing. This strengthens the Principle V rule against drive-by
  edits: in a fork, drive-by edits have a recurring cost.
- Every touched upstream file MUST be listed in `docs/fork.md` with the reason, so the merge
  surface is a known, reviewable set rather than a discovery made during a conflicted merge.
- Fork-specific configuration (endpoints, branding, defaults) MUST be centralized so upstream
  changes around it do not scatter conflicts.

_Rationale: the fork's value depends on upstream's continued work. A fork that cannot merge
upstream is a hard fork, and pays for every upstream fix by reimplementing it._

## Single-User Scope

Paseo is single-user and stays single-user. This fork adds the _shape_ of a team — members,
channels, assignment — without the machinery of multi-tenancy.

- No authentication or authorization system beyond the existing daemon auth.
- No roles, permissions, or access-control checks. There is one human and they own everything.
- No invites, no owner/admin/member hierarchy, no billing, no marketplace.
- "Member" means an agent identity in the roster, plus the single human. It does not imply a
  user account.

_Rationale: roles and permissions are the single largest source of accidental complexity in
team products, and none of it buys anything for a user who is the only user._

## Team Surface Data Boundary

The team surface introduces a third scoping key alongside the two `docs/architecture.md`
already defines (`cwd`-keyed directory-backed state, `workspaceId`-keyed workspace-owned state).

- **Project-keyed state**: channels, messages, tasks, and project membership. Keyed by
  `projectId`, stored at `~/.paseo/team/<projectId>.db`. Identical regardless of which
  workspace or worktree the user is viewing from.
- **Daemon-keyed state**: member identities, which exist across projects. Stored at
  `~/.paseo/team/roster.db`. A member is assigned to one or more projects and has one home
  workspace per project.
- Team data lives in `~/.paseo`, never inside the repository. It is not source, must not reach
  git, and must be identical across every worktree of a project.
- One database per project: deleting a project is removing one file, corruption is contained to
  one project, and there is no cross-project locking.

Backups are automatic: `VACUUM INTO` a timestamped snapshot on daemon start and every 24 hours
thereafter, retaining the last 3 per database. `VACUUM INTO` is required over file copy because
it is consistent under concurrent writes. Message history is subject to a configurable
per-project retention cap, pruned on daemon start.

_Rationale: workspaces are disposable — a worktree is created for a branch and removed on
archive. Channels and tasks pinned to one would die with it, and agents on different branches
could not see each other. Projects are stable and are the natural unit of "a codebase and the
people working on it."_

## Development Workflow

- `npm run typecheck` and `npm run lint` after every change. `npm run format` before committing.
- Linting and formatting go through npm scripts, never direct tool invocation.
- Build workspace packages before diagnosing cross-package type errors (`npm run build:client`,
  `npm run build:server`). Stale generated declarations MUST NOT be worked around with local
  duplicate types or patched inferred parameters.
- The main daemon on port 6767 is never restarted without explicit permission — it manages
  running agents, including the agent doing the work.
- New system, process, or gotcha knowledge goes in `docs/`. Code-level facts go in comments next
  to the code.

## Governance

This constitution supersedes conflicting practice. Where it is silent, `CLAUDE.md` and `docs/`
govern; where they conflict with it, this document wins and the conflicting doc is updated in
the same change.

Amendments require: a written rationale, a version bump per the policy below, and propagation to
any affected template or doc in the same change.

Versioning policy:

- **MAJOR** — a principle is removed or redefined incompatibly.
- **MINOR** — a principle or section is added, or guidance materially expanded.
- **PATCH** — clarification, wording, or non-semantic refinement.

Compliance is verified at review time. Complexity must be justified against Principle V, and
any new persistence outside the Principle VII boundary blocks merge until the constitution is
amended.

**Version**: 1.1.1 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-07-27
