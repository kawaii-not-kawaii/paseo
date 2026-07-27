# Phase 1 Data Model: Team Parity

Storage is SQLite via built-in `node:sqlite`, bounded to the team surface by Constitution VII. All
existing JSON stores are untouched.

## Layout

```text
~/.paseo/team/
├── roster.db                 # daemon-wide member identities
├── <projectId>.db            # one per project: channels, messages, tasks
└── backups/
    ├── roster-<ts>.db
    └── <projectId>-<ts>.db   # last 3 per database
```

One database per project means deleting a project is removing one file (FR-041), corruption is
contained to one project (FR-042), and there is no cross-project locking.

## Connection settings

Applied on every open, in `storage/database.ts`:

| Pragma | Value | Why |
|---|---|---|
| `journal_mode` | `WAL` | Readers never block the writer. The app reads history while members post. |
| `synchronous` | `NORMAL` | With WAL, survives process crash — which is what FR-038 requires. `FULL` guards against OS/power loss at a write-throughput cost not worth paying here. |
| `foreign_keys` | `ON` | Off by default in SQLite. The task and message tables rely on it. |
| `busy_timeout` | `5000` | Members write concurrently; fail slow rather than immediately. |

## Migrations

Forward-only, keyed on `PRAGMA user_version`, present from v1 (Constitution VII). Each migration is
`{ version, up(db) }`, applied in order inside a transaction. A database from a newer daemon than the
running one is refused with a clear error rather than opened and corrupted.

Every read is validated with Zod at the boundary (Principle V); after parsing, values are trusted.

---

## roster.db

### `members`

Daemon-wide identities. A member exists independently of any project (FR-016).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `mem_<hex>` |
| `name` | TEXT NOT NULL UNIQUE | The `@name` used in mentions. Unique daemon-wide so a mention is unambiguous. |
| `description` | TEXT | What this member owns. |
| `provider` | TEXT NOT NULL | Existing agent provider id. |
| `model` | TEXT | Null means provider default. |
| `mode_id` | TEXT | Optional. |
| `role_prompt` | TEXT | The member's exclusive system prompt (FR-014a). Maps directly onto the existing per-agent `AgentConfig.systemPrompt` (`agent-storage.ts:20`) at session start — no new mechanism. |
| `template_id` | TEXT | Which built-in template seeded this member, for display only. The prompt is the member's own once created. |
| `kind` | TEXT NOT NULL | `agent` \| `human`. Exactly one `human` row, created on first start (FR-006a). |
| `created_at` | TEXT NOT NULL | ISO 8601. |
| `archived_at` | TEXT | Soft delete — history stays attributed (FR-022). |

### Member home directory

Not in the database — a real directory the member reads and writes with ordinary file tools:

```text
~/.paseo/team/members/<memberId>/
├── MEMORY.md        # created at member creation with a short header; the member maintains it
├── notes/
└── artifacts/
```

This is deliberately **not** the member's git workspace (FR-014d). A worktree is merged, rebased,
and eventually removed; anything an agent wrote there is either committed into the user's repository
or destroyed. Accumulated expertise needs a location with a different lifetime, so it survives
workspace archival, worktree removal, and being re-pointed at a new workspace (FR-019b).

The path is injected into the member's role prompt at session start, along with the distinction
FR-014e requires: the prompt is who you are and the user owns it; the memory is what you have
learned and you own it.

Excluded from backups and from the retention cap — it is plain files, and it belongs to the member
rather than to the project's message history.

### Role templates

Built-in, shipped as data in a fork-owned module rather than stored in the database. There is no
marketplace, no distribution, and no user-authored template store (Constitution: single-user scope).
A template is `{ id, name, description, rolePrompt }`, and its only job is to pre-fill the create
form. Once a member exists, its prompt is a plain editable field.

Removal is a soft delete. Hard-deleting a member would orphan every message it wrote, and FR-022
requires history remain readable and correctly attributed.

---

## `<projectId>.db`

### `project_members`

The member ↔ project assignment, carrying the home workspace (FR-017).

| Column | Type | Notes |
|---|---|---|
| `member_id` | TEXT PK | References `roster.db.members.id`. Cross-database, so not a SQL foreign key — validated in the service layer. |
| `home_workspace_id` | TEXT | Null when the workspace is gone; member survives and is flagged (FR-019). |
| `joined_at` | TEXT NOT NULL | |

Unique index on `home_workspace_id` where non-null — enforces FR-018 (two members never share a
working tree) in the database rather than in application logic.

### `channels`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `chn_<hex>` |
| `name` | TEXT NOT NULL UNIQUE | Normalized lowercase, matching upstream chat behaviour. |
| `purpose` | TEXT | |
| `created_at` / `updated_at` | TEXT NOT NULL | |
| `archived_at` | TEXT | |

### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `msg_<hex>` |
| `channel_id` | TEXT NOT NULL | FK → `channels(id)` ON DELETE CASCADE |
| `author_member_id` | TEXT NOT NULL | Never a foreign key to a deletable row — members are soft-deleted. |
| `body` | TEXT NOT NULL | |
| `reply_to_message_id` | TEXT | |
| `created_at` | TEXT NOT NULL | |
| `auto_started` | INTEGER NOT NULL | 1 when written by an automatically started session (FR-035i). |

Immutable once written.

**Index**: `(channel_id, created_at DESC, id DESC)` — the covering index for keyset pagination
(R6). This index is what makes SC-003 achievable; without it, opening a busy channel scans.

### `message_mentions`

| Column | Type | Notes |
|---|---|---|
| `message_id` | TEXT NOT NULL | FK → `messages(id)` ON DELETE CASCADE |
| `member_id` | TEXT NOT NULL | |

Primary key `(message_id, member_id)`. A separate table rather than a JSON column so mention
delivery — "which members must receive this message" (FR-007) — is an indexed lookup rather than a
scan over message bodies.

### `tasks`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Short, human-quotable (`#18` style display id derived from a per-project counter). |
| `seq` | INTEGER NOT NULL UNIQUE | The per-project number shown in chat as `#18`. |
| `title` | TEXT NOT NULL | |
| `body` | TEXT | |
| `status` | TEXT NOT NULL | `todo` \| `in_progress` \| `in_review` \| `done` |
| `creator_member_id` | TEXT NOT NULL | |
| `assignee_member_id` | TEXT | Intent — who it is meant for. |
| `claimant_member_id` | TEXT | Possession — who holds it now. Distinct from assignee (FR-024d). |
| `claim_expires_at` | TEXT | Lease expiry (R1). Null when unclaimed. |
| `handback_count` | INTEGER NOT NULL DEFAULT 0 | Reset on acceptance (FR-035c). |
| `attempt_started_at` | TEXT | Start of the current attempt, for the wall-clock guard (FR-035d1). |
| `escalated_at` | TEXT | Non-null means stopped and awaiting the user. |
| `created_at` / `updated_at` | TEXT NOT NULL | |

**Partial unique index** on `claimant_member_id` where non-null and not expired is *not* used —
a member may hold several tasks. Exclusivity is per task, enforced by the conditional UPDATE below.

### `task_dependencies`

`(task_id, depends_on_task_id)`, both FK → `tasks(id)` ON DELETE CASCADE. A task with any dependency
not `done` is blocked and cannot be claimed (FR-024f).

### `task_notes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `task_id` | TEXT NOT NULL | FK → `tasks(id)` ON DELETE CASCADE |
| `author_member_id` | TEXT NOT NULL | |
| `body` | TEXT NOT NULL | |
| `created_at` | TEXT NOT NULL | |

### `task_acceptance_criteria`

`(task_id, position, text, satisfied_at)`. Satisfying one is a progress event.

### `progress_events`

Append-only. The signal both guards read (FR-035b, FR-035f).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `task_id` | TEXT | Null for project-level events. |
| `member_id` | TEXT NOT NULL | |
| `kind` | TEXT NOT NULL | `claimed` \| `released` \| `status_changed` \| `noted` \| `criterion_satisfied` |
| `created_at` | TEXT NOT NULL | |

The no-progress backstop is "count messages since the last row here". Keeping it as a table rather
than a counter means the guard state survives restart and is auditable when a user asks why the
project stopped.

### `project_settings`

Single row: `message_retention_cap`, `handback_limit`, `attempt_timeout_ms`,
`no_progress_limit`, `auto_start_enabled`. Defaults from research R2–R4.

---

## Claim acquisition

Exclusivity (FR-024a) is a single conditional UPDATE, not a read-then-write:

```sql
UPDATE tasks
   SET claimant_member_id = :member,
       claim_expires_at   = :now_plus_ttl,
       attempt_started_at = :now
 WHERE id = :task
   AND (claimant_member_id IS NULL OR claim_expires_at <= :now)
   AND NOT EXISTS (
         SELECT 1 FROM task_dependencies d
           JOIN tasks t ON t.id = d.depends_on_task_id
          WHERE d.task_id = :task AND t.status <> 'done')
```

Zero rows changed means the claim was refused; the service then reads the current holder to tell the
caller who has it (FR-024a) or which dependencies block it (FR-024f). Two members racing cannot both
succeed, because SQLite serializes the writes — the correctness comes from the database, not from
application-level care.

## Task state transitions

```text
todo ──claim──▶ in_progress ──submit──▶ in_review ──accept──▶ done
                     ▲                       │
                     └────── handback ───────┘
                        handback_count += 1
```

- **claim**: only if unclaimed or lease expired, and no unmet dependency.
- **handback**: `in_review → in_progress`, increments `handback_count`, releases the claim so the
  next member can take it. At `handback_count >= handback_limit`, sets `escalated_at` instead and
  stops work on this task only (FR-035e).
- **accept**: `in_review → done`, resets `handback_count`, releases the claim.
- Any transition writes a `progress_events` row.
- The user can override any claim or status at any time (FR-024b).

## Backups

`VACUUM INTO '<backups>/<name>-<ts>.db'` on daemon start and every 24h, keeping the last 3
(FR-039). `VACUUM INTO` is required over a file copy because it is consistent under concurrent
writes — a copy can catch a torn WAL. Restore is a file move; no import step.

## Retention

On daemon start, messages beyond `message_retention_cap` per project are deleted oldest-first
(FR-040), and the pruned count is recorded so the user can see that pruning occurred. Pruning at
start rather than continuously keeps it off the write path and avoids the view shifting under a
user who is reading (edge case: "user is viewing a channel while retention prunes it").
