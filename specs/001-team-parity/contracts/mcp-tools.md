# Contract: Agent-facing MCP tools

These are what make agent-to-agent coordination possible — the capability that does not exist in
Paseo today. Defined in `packages/server/src/server/team/mcp-tools.ts` (fork-owned), registered at
the `paseo-tools.ts` seam.

## Scoping

Every tool is implicitly scoped to the calling member and its project. A member cannot read or write
another project's channels or tasks (FR-034); the project is derived from the calling agent's
member assignment, never accepted as a parameter. This is a trust boundary, so it is validated
rather than assumed (Principle V).

## No wait tool

There is deliberately **no** `team_wait`. A member that blocked on one would be killed by the
2-minute idle runtime reaper (`IDLE_AGENT_RUNTIME_TTL_MS`). Members finish their turn and go idle;
`member-lifecycle.ts` starts a fresh session when they are mentioned, with the mention as the
prompt. See research R5.

This is the single most important thing to get right in implementation — the obvious design is the
broken one.

---

## `team_post`

Post a message to a channel.

| Param              | Type    | Notes                                                                                                        |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `channel`          | string  | Name or id.                                                                                                  |
| `body`             | string  | `@name` mentions are parsed server-side; mentioning a member delivers to it and starts it if idle (FR-035a). |
| `replyToMessageId` | string? |                                                                                                              |

Returns the created message id. Mentioning a member not assigned to the project fails with a
message saying so, rather than silently not delivering (edge case in spec).

## `team_read`

Read recent channel history.

| Param     | Type    | Notes                          |
| --------- | ------- | ------------------------------ |
| `channel` | string  |                                |
| `limit`   | number? | Default 50.                    |
| `before`  | string? | Keyset cursor for older pages. |

Returns messages newest-first with author names resolved, so a member can address people by name
without a second lookup.

## `team_roster`

List the project's members: name, description, status, and whether each is currently working.

No parameters. This is how a member discovers who to hand off to (FR-035). Includes the human
identity, so a member knows what to mention when escalating.

## `team_tasks`

Query tasks.

| Param       | Type     | Notes                                                   |
| ----------- | -------- | ------------------------------------------------------- |
| `status`    | string?  |                                                         |
| `mine`      | boolean? | Tasks claimed by the calling member.                    |
| `claimable` | boolean? | Unclaimed or lease-expired, with all dependencies done. |

Returns tasks with `seq` (the `#18` display number), status, assignee, claimant, handback count, and
blocking dependencies.

## `team_task_update`

Create, claim, release, and modify tasks. One tool rather than six, because the guard and claim
checks are identical across them and splitting invites drift.

| Param                                                   | Type    | Notes                                                                                           |
| ------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `action`                                                | enum    | `create` \| `claim` \| `release` \| `set_status` \| `note` \| `satisfy_criterion` \| `handback` |
| `taskId`                                                | string? | Required except for `create`.                                                                   |
| `title` / `body` / `status` / `note` / `criterionIndex` |         | Per action.                                                                                     |

Rules enforced server-side, not by agent cooperation:

- **`claim`** fails if another member holds an unexpired lease, and says who (FR-024a). Fails if any
  dependency is unmet, and says which (FR-024f).
- **All mutating actions except `claim` and `create`** require the caller to hold the claim
  (FR-024b). A member that lost its lease is told so rather than silently overwriting.
- **`handback`** moves `in_review → in_progress`, increments the count, releases the claim. At the
  configured limit it escalates instead and stops work on that task (FR-035d).
- Every successful action writes a `progress_events` row, which renews the caller's lease and resets
  the no-progress backstop.

## `team_propose_members`

Propose a roster for the project. This is the "talk to an agent about roles" path (FR-014c) — the
behaviour the walkthrough shows when Cindy proposes three agent cards.

| Param     | Type    | Notes                                                |
| --------- | ------- | ---------------------------------------------------- |
| `context` | string  | What the project is and what the user wants staffed. |
| `count`   | number? | Suggested number of roles.                           |

Returns proposed members: `name`, `description`, `rolePrompt`, and a suggested provider/model.

**This tool creates nothing.** It returns proposals that the app renders as review cards; each
member is created only when the user confirms it individually (FR-014c). A tool that could create
members directly would let a member spawn a team — and therefore spend model usage — without the
user ever seeing it.

## Errors are informative, not just refusals

Every refusal tells the member what to do next: who holds the claim, which dependency blocks it,
that its lease expired. A member that receives "denied" with no reason will retry in a loop, which
is exactly the behaviour the guards exist to stop — so the refusal messages are load-bearing, not
cosmetic.
