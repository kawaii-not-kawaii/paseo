# Team

Team is the project-scoped surface where persistent members coordinate in channels and track work on a shared board. It is visible only when the connected daemon publishes `server_info.features.team`; there is no fallback path to legacy chat or loop RPCs.

## Team requires MCP injection

`features.team` is published only while the daemon resolves a non-null agent MCP base URL. This is not a preference — members talk to each other exclusively through the `team_*` MCP tools, so without that URL a mentioned member starts, does the work, and never posts. Nothing errors; the channel just stays empty and the user is back to relaying.

Three conditions have to hold, and missing any one of them withholds the capability:

- `mcp.enabled` — mounts `/mcp/agents`.
- `mcp.injectIntoAgents` — hands that server to agents. Independent of the above; calling the endpoint by hand proves only the first.
- A **TCP** listen target. A daemon on a unix socket has no injectable HTTP URL.

Two traps worth knowing:

- The persisted config loader defaults `mcp.injectIntoAgents` to **`false`**, while bootstrap treats `undefined` as **`true`**. A daemon started from a `config.json` with no `mcp` block injects nothing. `scripts/dev-home.sh` seeds it for dev homes.
- The capability is evaluated per request, but `server_info` only reaches a client at hello. Toggling injection on a live daemon does not reach connected clients, so `MemberLifecycle` refuses to start a member when the URL is null rather than trusting the flag.

One edge the capability cannot see: it answers "will the daemon inject", not "will this member's provider use what was injected". A provider with `supportsMcpServers: false` and no native Paseo tool support drops the injected config, and that member comes up tool-less while `team` is still `true`. `omp` is safe here — it takes the native catalogue instead.

## Scope

- Team data is split by two keys:
  - Project-scoped: channels, messages, tasks, claims, and project settings.
  - Daemon-scoped: member identities, role prompts, templates, and each member's durable home directory.
- The Team route lives at `h/[serverId]/team/[section]`, so the same project on two daemons shows two separate teams.
- Team is not a workspace panel. It is a host route with its own compact layout and does not participate in the workspace three-panel swipe.

## Surface

- **Chat** shows project channels, member activity, message history, and the composer. Mentioning `@member` routes work without the human relaying.
- **Members** manages durable member records: runtime/model, role prompt, project assignments, home workspace, and `MEMORY.md` / home files. `project_members.home_workspace_id` is UNIQUE, so the home workspace picker offers only workspaces no other member holds, and creates one (`workspace.create.request`, `kind: "directory"` on the project's repo root, titled `<member>-home`) rather than sending the user out to a chat draft to materialise one.
- **Tasks** shows the shared board and list views. Tasks are the durable work record members move through `Todo`, `In Progress`, `In Review`, and `Done`.
- **Settings** owns the bounded project controls: message retention, handback limit, attempt timeout, no-progress backstop, adoption of legacy chat, and recovery from snapshots.

## Wake and presence

- Every channel message wakes every idle non-human member in its resolved audience except its author, regardless of who authored it. A wake does not imply a reply: the shared member prompt makes silence the correct result when nothing needs that member's attention, forbids idle narration, and reserves outcome reporting for the member that did the work. The per-message notification must stay conditional too; an unconditional “then reply” instruction was enough to sustain a live agent loop despite the shared etiquette.
- Channel membership does not exist yet, so the resolved audience is every non-human member assigned to the project, even for messages in other channels. This fan-out is strictly wider than raft's channel-scoped reach. The lookup remains in the one delivery resolver in `member-lifecycle.ts` so adding channel membership later narrows it in one place.
- Ambient messages never interrupt a running member. Its channel cursor remains behind, and one consolidated wake after the run completes catches it up on every unread message, regardless of author. An explicit mention deliberately retains the existing interrupt behavior.
- A successful wake and a member's own post advance that member's channel cursor. This prevents duplicate and self-triggered catch-up without a separate queue.
- Unlike raft, Paseo does not inject a content-free inbox notice into a busy member's active turn. It reaches the same no-interruption outcome by waking the member from its cursor-backed backlog after the run drains.
- More than 20 consecutive member-authored messages without a human message produces a daemon warning. This is detection only: it never suppresses, delays, or drops a wake.
- Live member status comes from the agent manager through `MemberLifecycle`; `TeamService` remains storage-only. One daemon lifecycle subscription translates those transitions into the existing `team.member.changed` event and drives completion catch-up.

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
