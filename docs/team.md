# Team

Team is the project-scoped surface where persistent members coordinate in channels and track work on a shared board. It is visible only when the connected daemon publishes `server_info.features.team`; there is no fallback path to legacy chat or loop RPCs.

## Scope

- Team data is split by two keys:
  - Project-scoped: channels, messages, tasks, claims, and project settings.
  - Daemon-scoped: member identities, role prompts, templates, and each member's durable home directory.
- The Team route lives at `h/[serverId]/team/[section]`, so the same project on two daemons shows two separate teams.
- Team is not a workspace panel. It is a host route with its own compact layout and does not participate in the workspace three-panel swipe.

## Surface

- **Chat** shows project channels, member activity, message history, and the composer. Mentioning `@member` routes work without the human relaying.
- **Members** manages durable member records: runtime/model, role prompt, project assignments, home workspace, and `MEMORY.md` / home files.
- **Tasks** shows the shared board and list views. Tasks are the durable work record members move through `Todo`, `In Progress`, `In Review`, and `Done`.
- **Settings** owns the bounded project controls: message retention, handback limit, attempt timeout, no-progress backstop, adoption of legacy chat, and recovery from snapshots.

## Claim model

Claims are exclusive leases on tasks, not runtime locks.

- A claim is acquired by one conditional SQL update in `claims.ts`; two concurrent claim attempts cannot both succeed.
- The assignee is intent. The claimant is possession. They are intentionally separate so review and handoff flows stay legible.
- Claims renew on progress, not on a heartbeat timer. An idle member runtime may be reaped after two minutes, but its task claim survives until the lease expires.
- Releasing a claim is separate from stopping a runtime. A user-stopped member should not silently give away in-progress work.

This is why claims are progress-based rather than liveness-based: member runtimes are disposable, but task ownership is not.

## Guard thresholds

The guard settings live in Team project settings and default to the research values:

- Handback limit: `3`
- Attempt timeout: `30 minutes`
- No-progress backstop: `12` consecutive automatic member turns without progress

These guards are progress-based, not turn-based, for two reasons:

1. Converging work should keep going. A QA loop that keeps recording progress can take more than three rounds without being pathological.
2. A stalled member can fail without producing turns. The attempt timeout catches the "one wedged attempt" case that handback counting cannot see.

The guard semantics are:

- Any progress event resets the no-progress backstop.
- Any user message also resets the no-progress backstop.
- Hitting the handback limit escalates only that task.
- Hitting the no-progress backstop stops the project until the user resumes it.
- Hitting the attempt timeout escalates the stuck task and releases its claim.

The model is deliberately biased toward not interrupting productive work. A guard that stops a converging task is worse than one that lets a few extra turns happen.
