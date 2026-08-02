# Quickstart: validating Team Parity

Runnable checks that prove the feature works. Each maps to a success criterion in
[spec.md](./spec.md).

## Prerequisites

```bash
npm install                    # node_modules is NOT present in this checkout
npm run build:server           # protocol + client + server declarations
```

Repo dev commands use checkout-local state: `PASEO_HOME` resolves to `.dev/paseo-home`, so nothing
here touches `~/.paseo` or the main daemon on port 6767.

```bash
npm run dev                    # dev daemon
npm run dev:app                # Expo against it
```

## 1. The thesis — two members coordinate without you relaying (SC-002)

The core scenario. Everything else is supporting cast.

1. Open the Team view for a project → **Members** → add two members, each with its own workspace:
   - `impl` — "Implements changes"
   - `qa` — "Verifies changes and hands back failures"
2. **Chat** → create `#build` → post one message asking for a change that needs both.
3. Watch. Expected: `impl` claims a task, works, moves it to In Review, mentions `@qa`; `qa` claims
   it, verifies, and either accepts or hands back.

**Pass**: you sent exactly one message. Check the transcript — every subsequent message is
member-authored.

## 2. Claim exclusivity (SC-012)

```bash
npm run cli -- team task create "contended" --project <id>
```

Have two members attempt `team_task_update{action:"claim"}` on it concurrently.

**Pass**: exactly one succeeds. The other receives a refusal naming the holder — not a generic
error, and not a second successful claim.

## 3. Claims survive idle reaping (R1 — the regression this design exists to prevent)

1. Have a member claim a task.
2. Leave it idle for **3 minutes** — past `IDLE_AGENT_RUNTIME_TTL_MS` (2 min), so its runtime is
   collected.
3. Check the task.

**Pass**: still claimed by that member, lease unexpired. **Fail**: claim released — the lease has
been wrongly tied to runtime liveness, and another member can steal in-progress work.

## 4. The QA loop converges without interruption (SC-015)

Give `qa` criteria the first two attempts cannot satisfy but the third can.

**Pass**: the loop runs to acceptance with no human input and no guard firing. A guard that stops a
_converging_ loop is the worst failure mode in this feature.

## 5. Escalation on a non-converging loop (SC-016)

Give `qa` criteria that can never be satisfied.

**Pass**: after `handback_limit` (default 3) rounds, work on that task stops, the user is mentioned
in `#build`, the task shows `escalated_at`, and **a notification is delivered** (FR-035e1) — verify
with the app backgrounded, not just open on the Team view. Other members keep working (FR-035e).

## 6. Durability under unclean shutdown (SC-006)

```bash
# with members actively posting
kill -9 <daemon pid>
npm run dev
```

**Pass**: every message acknowledged to its author is present. WAL + `synchronous=NORMAL` is what
makes this true; if it fails, check the pragmas in `storage/database.ts`.

## 7. Large-history performance (SC-003)

Seed 50,000 messages into one channel, then open it on a compact viewport.

**Pass**: first paint within one second, comparable to an empty channel. **Fail**: any degradation
means pagination regressed to `OFFSET` — check the `(channel_id, created_at DESC, id DESC)` index is
being used with `EXPLAIN QUERY PLAN`.

## 8. Worktree removal (SC-007)

Merge a member's branch and remove its worktree.

**Pass**: channels, history, and tasks all intact; the member is still listed, flagged as needing a
workspace, and cannot run until one is chosen (FR-019).

## 9. Adoption of existing chat (SC-008)

With rooms in `~/.paseo/chat/rooms.json` from before the upgrade, start the daemon and adopt into a
project.

**Pass**: every room and message readable in the Team view, **and** `paseo chat ls` still works —
upstream's service must be untouched (Constitution VIII).

## 10. Cross-daemon independence (SC-007a)

Connect two daemons that both have the same project (same git remote → same `projectKey`).

**Pass**: each shows its own team; the view says which daemon; taking one offline leaves the other
fully usable.

## 11. Compact parity (SC-010)

On a phone-width viewport, complete every action: create a channel, post, create a task, move it
between columns, add a member.

**Pass**: all achievable. Also confirm the Team view does **not** participate in the workspace
three-panel swipe (`docs/mobile-panels.md`) — swiping inside Team must not drag the agent/file
panels.

## 12. Memory outlives workspaces (SC-011b)

1. Let a member run long enough to write to its `MEMORY.md`.
2. Archive its home workspace, remove the worktree, re-point it at a new one.

**Pass**: `~/.paseo/team/members/<id>/MEMORY.md` is byte-identical, and the member's detail view
still shows it. **Fail**: if memory lived in the worktree, it is gone — which is precisely why the
home directory is separate from the git workspace.

## 13. Merge does not strand a member (SC-011c)

Enable `autoArchiveAfterMerge`, then merge a member's branch.

**Pass**: the member's home workspace survives and the member can still run. **Fail**: the member is
flagged as needing a workspace after every successful merge — the guard clause in
`archive-if-safe.ts` is missing.

## 14. Backward compatibility (FR-043)

- Old app → new daemon: existing functionality works; no Team view.
- New app → old daemon: Team entry hidden or "Update the host to use this". No crash, no partial
  view, no fallback to legacy `chat/*` RPCs.

## Per-change gates

```bash
npm run typecheck
npm run lint
npm run format
npx vitest run <changed-file> --bail=1     # never the full suite locally
```
