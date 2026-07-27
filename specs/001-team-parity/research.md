# Phase 0 Research: Team Parity

Decisions that were open at the end of `/speckit-specify`, resolved against the real code.

---

## R1: Claim release on member stop — lease-based

**Decision**: Claims are **leases** with an expiry timestamp, renewed by the claimant while it works.
They are not tied to agent runtime liveness.

**Rationale**: `bootstrap.ts:218` sets `IDLE_AGENT_RUNTIME_TTL_MS = 2 * 60 * 1000`, and
`collectIdleAgents` reclaims any agent runtime idle past that cutoff. Members are idle by design
between turns — they post a message and wait to be mentioned again. If claim release were tied to
the member stopping, **a member would lose its task roughly two minutes after claiming it**, and
another member could take work already in progress. That is a data-corruption-shaped bug, not a
tuning problem.

A lease decouples the two lifetimes. A member claims a task, may be reaped and restarted several
times while holding it, and only loses it if the lease actually expires without renewal.

FR-024e ("claims released when a member stops") is satisfied in the way the user actually needs:
a genuinely dead member's lease expires; a merely idle member keeps its work.

**Lease TTL**: equal to the per-attempt wall-clock limit (R3). The two express the same thing — how
long a single attempt may take before the system concludes it is not coming back — so they must not
be able to disagree. One value, two uses.

**Renewal**: on any progress event from the claimant. No separate heartbeat timer; a member that is
working is by definition producing progress, and one that is not should lose the lease.

**Alternatives considered**:
- *Release on member stop* — rejected: broken by the 2-minute reaper, as above.
- *Explicit heartbeat* — rejected: a second liveness mechanism that can disagree with progress, and
  a timer to own. Progress is already the signal the guards use.
- *Never expire, manual release only* — rejected: a crashed member strands a task forever, which
  FR-024e exists to prevent.

---

## R2: Handbacks per task — default 3

**Decision**: 3 handbacks, per project configurable.

**Rationale**: The intended behaviour is a QA member rejecting a build and handing it back until it
passes. Round 1 is the first honest attempt; round 2 is the fix for what QA found; round 3 is the
fix for what the fix broke. A fourth failure is not usually one more bug — it is the wrong approach,
a misunderstood requirement, or a missing capability, and those are what a human is for. Escalating
there matches the user's stated intent ("after x number of passes it won't pass QA, escalate").

The cost of being wrong is small in both directions: too low and the user gets an escalation they
dismiss with one action; too high and they pay for a few extra model turns. It is configurable
precisely because the right number depends on the work.

**Alternatives considered**: 5 — more autonomy, but four consecutive failures is already a strong
signal and the extra rounds are the most expensive ones. 2 — escalates before a genuine
fix-and-retest cycle completes, which would make the feature feel broken.

---

## R3: Per-attempt wall-clock limit — default 30 minutes

**Decision**: 30 minutes per attempt, per project configurable. Also serves as the claim lease TTL
(R1).

**Rationale**: This guard exists for the case handback counting cannot see — a member wedged
*inside* one attempt, where the count never increments. It must therefore sit above the slowest
legitimate attempt. The reference workload is the user's own: build an Android app and run it in an
emulator. A cold Gradle build plus emulator boot plus a test pass is minutes, occasionally tens of
minutes on a loaded machine. 30 minutes clears that with margin while still bounding a hung attempt
to something a user would tolerate discovering.

`loop-service.ts` already models this as `maxTimeMs`, confirming the shape is right; the team module
reimplements the semantics rather than the code, per Constitution VIII.

**Alternatives considered**: 10 minutes — would fire during ordinary Android builds and train the
user to raise it. 2 hours — a wedged member burns most of a working session before anyone is told.

---

## R4: No-progress backstop — default 12 consecutive turns

**Decision**: 12 consecutive automatic member messages with no progress event, per project
configurable.

**Rationale**: This catches only one failure mode — members conversing while touching no work. It is
deliberately generous, because tripping it during legitimate coordination would be the worst
outcome: it is the one guard that stops the whole project rather than a single task. A genuine
handoff conversation ("I'm done, over to you", "ack, starting") is a handful of messages and is
normally punctuated by a claim or a status change, which resets the count. Twelve messages with no
task touched at all is not coordination.

Any progress event resets it, and so does any message from the user (FR-035f).

**Alternatives considered**: 5 — plausibly hit by real coordination, especially with three or more
members. 50 — permits a long, expensive, pointless exchange before stopping, which is the exact
thing this guard is for.

---

## R5: Members do not block on a wait tool

**Decision**: There is no long-lived `team_wait` tool. Members go idle, their runtimes are reclaimed,
and `member-lifecycle.ts` starts a fresh session on mention with the mention as its prompt.

**Rationale**: FR-032 called for a member to "wait for new messages and be woken". Implemented
literally as a blocking tool call, it would be killed by the 2-minute idle reaper. Rather than
protect members from the reaper, this design works with it: idle members cost zero processes, so a
project with twenty members holds twenty rows in SQLite and no runtimes. FR-035a already requires
start-on-mention, so the observable behaviour is identical — a mention reaches the member and it
acts — while the resource profile is far better.

`collectIdleAgents({ cutoff, protectedAgentIds })` remains the escape hatch if a member must stay
resident; `scheduleService.listActiveAgentTargetIds()` is the precedent to copy. Not needed for v1.

**Alternatives considered**:
- *Protect all members from reaping* — rejected: twenty idle runtimes held open, for no behavioural
  gain.
- *Raise `IDLE_AGENT_RUNTIME_TTL_MS`* — rejected: modifies upstream behaviour for every agent to
  serve a fork feature. Violates Constitution VIII.

---

## R6: Message pagination — keyset, not offset

**Decision**: Messages are read by keyset pagination on `(created_at, id)` with a covering index,
newest first.

**Rationale**: SC-003 requires opening a channel with 50,000 messages to be as fast as opening an
empty one, on a mid-range phone. `LIMIT ... OFFSET` degrades linearly with depth and re-reads the
skipped rows; keyset is constant-time per page regardless of history size. This is also why messages
are in SQLite rather than JSON or JSONL at all — it is the requirement that ruled out a file.

---

## R7: Adoption of existing chat rooms — one-time, non-destructive

**Decision**: On first start after upgrade, `adoption.ts` reads `~/.paseo/chat/rooms.json`, imports
rooms and messages into the team database of a project the user selects, and writes an adoption
marker. The original file is left untouched and upstream's `chat-service.ts` keeps serving it.

**Rationale**: FR-036 requires nothing be discarded, and Constitution VIII forbids reshaping the
upstream service. Copy-and-leave satisfies both: the `paseo chat` CLI keeps working exactly as it
did, and the history becomes visible in the Team view. Because existing rooms have no `projectId`
(the current schema has no such field), the target project cannot be inferred and must be chosen —
a one-time prompt rather than a guess that silently puts history in the wrong place.

**Alternatives considered**: move-and-delete — breaks the CLI and is unrecoverable if the user picks
the wrong project. Infer the project from the daemon's single project — wrong whenever there is more
than one.

---

## R8: Team view layout — route, not panel

**Decision**: A host-level leaf route at `h/[serverId]/team/[section]`. Compact shows one section at
a time behind a segmented control; wide shows list beside detail.

**Rationale**: `docs/mobile-panels.md` states the compact layout has exactly three mutually exclusive
destinations and explicitly forbids adding another panel translate shared value or backdrop shared
value. Team is not a fourth workspace panel — it is project-scoped, not workspace-scoped, so it does
not belong in that gesture system at all.

`docs/expo-router.md` then fixes where it mounts: layouts own only their direct children, so
`h/[serverId]/_layout.tsx` registers it and the root layout must not. Getting this wrong produces a
blank native screen with no JavaScript error, which is why it is called out here rather than left to
implementation.

Section is a route param rather than local state so that deep links, notifications, and back
navigation all address a section directly.

---

## R9: Member home directory is separate from home workspace

**Decision**: Each member gets `~/.paseo/team/members/<memberId>/` containing `MEMORY.md`, `notes/`,
and `artifacts/`. This is distinct from its **home workspace**, the git worktree where it does code
work.

**Rationale**: These have fundamentally different lifetimes, and merging them loses data. A git
worktree is created for a branch, merged, and removed — `autoArchiveAfterMerge` removes it
automatically when enabled. Anything a member wrote there is then either committed into the user's
repository (polluting it with agent notes) or destroyed on cleanup. Accumulated expertise is exactly
the thing that must survive a merge, so it cannot live in the thing a merge destroys.

Keeping them separate also satisfies FR-019b directly: re-pointing a member at a new workspace after
its worktree is removed leaves its memory untouched, so a member does not lose what it learned every
time its branch lands.

The directory is plain files rather than database rows because the member reads and writes it with
ordinary file tools it already has — no new capability, no new MCP surface.

**Alternatives considered**:
- *Memory inside the worktree* — rejected: destroyed on merge, or committed into the user's repo.
- *Memory as a SQLite table* — rejected: the member would need a bespoke tool to read and write its
  own notes, where a file needs nothing. Also outside the Principle VII boundary, which covers
  query-shaped data; a single markdown document is not query-shaped.

---

## R10: Role templates are data, and proposals never auto-create

**Decision**: A small set of built-in role templates shipped as data in a fork-owned module. No
marketplace, no distribution format, no user-authored template store. Separately, a
`team_propose_members` MCP tool lets an existing member propose a roster, returned as review cards
the user confirms individually.

**Rationale**: The valuable half of "a template market" for a single user is not distribution — it
is not having to write a role prompt from a blank page. Built-in templates solve the cold start;
a member proposing roles from the actual project context produces better prompts than any generic
template could, because it knows the stack. A marketplace adds a server, a review process, and a
sharing format for a product with exactly one user, and Constitution "Single-User Scope" excludes it.

`team_propose_members` deliberately **cannot create members**. If it could, a member could staff a
team — and therefore spend model usage — without the user seeing it. Proposals are inert data; the
user confirms each one. This mirrors the reference product, where proposed agents render as cards
with a Create button.

**Alternatives considered**:
- *Templates as files in `~/.paseo/team/templates/`* — rejected: a sharing format for a single user
  is ceremony, and it invites a schema to version. Revisit only if users ask to share rosters.
- *Proposal tool that creates directly* — rejected: unattended usage the user never approved.

---

## R11: Members' home workspaces are exempt from auto-archive

**Decision**: `archive-if-safe.ts` gains a guard so a workspace that is a member's home workspace is
never archived automatically on merge.

**Rationale**: `autoArchiveAfterMerge` exists for throwaway task workspaces — cut a worktree, ship
the change, reclaim it. Members invert that assumption: the workspace is their long-term working
home and merging is routine, not terminal. Without the exemption, every successful merge would
strand the member that did the work, requiring the user to re-point it (FR-019). A feature that
punishes success is a bug.

This is a one-line guard clause at an upstream seam, recorded in `docs/fork.md`. The alternative —
requiring users to leave `autoArchiveAfterMerge` off — silently disables an existing upstream feature
to accommodate a fork feature, which is worse for both.
