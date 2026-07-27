# Contract: WebSocket RPC surface

Naming follows `docs/rpc-namespacing.md`: `domain.namespace.operation.request` paired with
`.response`. Dots, not slashes. The operation segment is a verb.

Schemas live in `packages/protocol/src/team/rpc-schemas.ts` (fork-owned). They are registered in the
session unions in `packages/protocol/src/messages.ts` — the one non-trivial upstream seam.

## Schema rules

Per `docs/protocol-validation.md` and Constitution I:

- `z.discriminatedUnion("type", …)`, never plain `z.union()`.
- No `.transform()`, `.catch()`, or `.preprocess()` anywhere in a wire schema. Normalization
  (name casing, mention parsing) happens in an explicit post-validation pass in the service.
- `.default()` only on primitive leaves, never on item schemas of large arrays.
- New fields are added `.optional()`. Optional never becomes required.
- Every response carries `requestId` and a nullable `error`, matching the existing chat RPCs.

## Capability gate

```ts
// COMPAT(team): added in v0.2.3, drop the gate when floor >= v0.2.3
server_info.features.team?: boolean
```

Detected in exactly one place in the app. Absent or false → the Team nav entry is hidden and any
deep link renders "Update the host to use this." No degraded Team view, no fallback to the legacy
`chat/*` RPCs (Constitution II).

## Channels

| RPC                           | Payload                                       | Notes              |
| ----------------------------- | --------------------------------------------- | ------------------ |
| `team.channel.list.request`   | `projectId`                                   |                    |
| `team.channel.create.request` | `projectId`, `name`, `purpose?`               |                    |
| `team.channel.update.request` | `projectId`, `channelId`, `name?`, `purpose?` |                    |
| `team.channel.delete.request` | `projectId`, `channelId`                      | Cascades messages. |

## Messages

| RPC                         | Payload                                               | Notes                                                                                                  |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `team.message.list.request` | `projectId`, `channelId`, `before?`, `limit?`         | Keyset paginated on `(created_at, id)`, newest first. `before` is the cursor. Never offset-based (R6). |
| `team.message.post.request` | `projectId`, `channelId`, `body`, `replyToMessageId?` | Author is the human identity. Mentions are parsed server-side post-validation.                         |

## Tasks

| RPC                           | Payload                                                          | Notes                                                                                 |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `team.task.list.request`      | `projectId`, `status?`, `assigneeMemberId?`, `creatorMemberId?`  | Serves both board and list views.                                                     |
| `team.task.get.request`       | `projectId`, `taskId`                                            | Detail with notes, criteria, dependencies.                                            |
| `team.task.create.request`    | `projectId`, `title`, `body?`, `assigneeMemberId?`, `dependsOn?` |                                                                                       |
| `team.task.update.request`    | `projectId`, `taskId`, plus optional fields                      | Also the drag-to-column path (`status`). User edits bypass the claim check (FR-024b). |
| `team.task.set_claim.request` | `projectId`, `taskId`, `claimantMemberId \| null`                | The user's claim override. Members use the MCP tool instead.                          |
| `team.task.delete.request`    | `projectId`, `taskId`                                            |                                                                                       |

## Members

| RPC                                                      | Payload                                                                      | Notes                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `team.member.list.request`                               | `projectId`                                                                  | Roster with live status, home workspace, channels.                                                                             |
| `team.member.create.request`                             | `projectId`, `name`, `description?`, `provider`, `model?`, `homeWorkspaceId` |                                                                                                                                |
| `team.member.update.request`                             | `memberId`, plus optional fields                                             | Roster-level; name and description are daemon-wide.                                                                            |
| `team.member.assign.request`                             | `projectId`, `memberId`, `homeWorkspaceId`                                   | Assignment plus home workspace (FR-016, FR-017).                                                                               |
| `team.member.remove.request`                             | `projectId`, `memberId`                                                      | Soft delete; history stays attributed.                                                                                         |
| `team.member.start.request` / `team.member.stop.request` | `projectId`, `memberId`                                                      | Manual control.                                                                                                                |
| `team.member.list_templates.request`                     | —                                                                            | Built-in role templates for the create form (FR-014b). Static data; no project scope.                                          |
| `team.member.list_home_files.request`                    | `memberId`, `path?`                                                          | Browse the member's home directory (FR-014f).                                                                                  |
| `team.member.read_home_file.request`                     | `memberId`, `path`                                                           | Read `MEMORY.md` or a note. Path is validated against the member's home directory — a trust boundary, not a convenience check. |

## Project control

| RPC                                      | Payload                | Notes                                                                                                                            |
| ---------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `team.project.get_settings.request`      | `projectId`            | Thresholds and retention cap.                                                                                                    |
| `team.project.update_settings.request`   | `projectId`, settings  |                                                                                                                                  |
| `team.project.stop_all.request`          | `projectId`            | FR-035h — the one-action stop.                                                                                                   |
| `team.project.resume.request`            | `projectId`, `taskId?` | FR-035g. Resets the relevant counter. `taskId` resumes one escalated task; omitted resumes the project after a no-progress stop. |
| `team.project.adopt_legacy_chat.request` | `projectId`            | One-time import of `~/.paseo/chat/rooms.json` (R7).                                                                              |

## Server-pushed events

Live updates (FR-008, FR-028) reuse the existing session outbound push mechanism. All are
project-scoped and carry `projectId` so a client viewing another project ignores them cheaply.

| Event                  | When                                                    |
| ---------------------- | ------------------------------------------------------- |
| `team.message.posted`  | Any member or the user posts.                           |
| `team.task.changed`    | Create, update, status change, claim change.            |
| `team.member.changed`  | Status, activity, assignment, home-workspace loss.      |
| `team.project.stopped` | A guard fired. Carries the reason and the task, if any. |

`team.project.stopped` is also what triggers the user notification required by FR-035e1 — the
escalation must reach the user through the existing notification path, not only change state in a
view they may not be looking at.
