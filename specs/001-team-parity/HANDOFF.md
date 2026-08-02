# Handoff: Team Parity

**For**: a fresh session picking up where this one stopped
**Branch**: `raft-parity`, pushed, HEAD `4a74eda28`. **PR #1** open on the fork, draft.
**State**: the Team surface is rebuilt to the hi-fi design, installed on Windows beside a vanilla
Paseo, and driven by hand. What remains is product gaps the design assumed, and the raft-behaviour
gap.

---

## Read this first

The design is now the source of truth for how Team looks, and the surface matches it. Two sessions
of headline bugs — "the Team row does not appear" and "the surface reads as alien" — are both
closed. Do not start there.

What this session learned instead, and what should shape the next one:

**Real use found two silent data bugs that every test missed.** Both type-checked, both looked
fine, and both were only visible by installing the build and clicking. The pattern is now three for
three: unit tests have never caught a defect on this surface. See _The verification method that
actually works_.

**Three things the design draws do not exist on the daemon at all.** Channel membership, workspace
creation from the app, and live status push. The UI now says so instead of pretending. Those are
the real open work, not styling.

## What this session changed

| Commit      | What                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| `399cd137f` | Team surface rebuilt from the hi-fi design handoff                         |
| `d7c1f4402` | Persistent per-channel unread cursors, capability-gated                    |
| `24a422df1` | Cross-column task dragging on web                                          |
| `08ce40f7f` | Unread clears only while Chat is actually visible                          |
| `d55805c40` | Dropped an upgrade notice that nagged from inside the channel rail         |
| `6765b0dbc` | Centred the chat column; moved the composer focus ring; member-form reason |
| `8e0820a49` | **Stopped the edit form rewriting a member's model**; real member status   |
| `4a74eda28` | Workspace names instead of raw `wks_…` ids                                 |

### The two silent bugs, because the shape will recur

1. **Normalizing against a collection that has not loaded yet destroys state.**
   `member-form-model.ts` ran `recalculateProviderState` at construction, when the provider list was
   still empty. With nothing to validate against it cleared the member's stored provider, model and
   mode — and when the real list arrived a moment later, the _emptied_ model resolved to the
   provider **default**. Opening a member set to haiku showed opus, and saving persisted the
   rewrite. Any member edited before `8e0820a49` may have had its runtime silently reset on disk.
   The fix is to normalize nothing until there is a list to normalize against. Look for this shape
   anywhere an async catalogue validates a stored selection.

2. **A field that only ever holds one value is worse than a missing field.**
   `TeamService.toTeamMember` hard-coded `status` to `unavailable` or `idle`. `TeamMemberStatusSchema`
   has `running` and `stopped`, and **nothing ever produced them** — so a member read as idle while
   it was working, and every "working" affordance in the UI (pill, rail label, presence line) was
   decorative. `TeamService` has no agent manager by design, so `MemberLifecycle.runtimeStatus`
   resolves it from the live agent and `team-session.ts` decorates the roster on the way out. That
   keeps the service storage-only.

## The verification method that actually works

Service-level green has now failed **every time** on this surface. Unit tests missed the Team row,
two render loops, seven blank fields, an entire unimplemented feature, a model-rewriting form, and a
status field that could never say "running".

Install the build, or drive the real UI:

```bash
npm run dev        # dev daemon on 127.0.0.1:6768, PASEO_HOME=.dev/paseo-home
npm run dev:app    # Expo web on 8081; Metro's first bundle takes ~40s
```

Both need `nohup … & disown` to survive a tool call. Playwright is installed at the repo root — run
the script **from the repo root** or module resolution fails. `serverId` lives in
`.dev/paseo-home/server-id` (currently `srv_AuM1y7-wS71B`). The dev home carries Team project
`prj_6417ab69f2b15a9c` with a `#build` channel and the T056 transcript.

Assert console errors, `pageerror`, and that the body contains neither "went wrong" nor "ran into a
problem". Then reload — a full reload re-reads from the daemon, which is what separates persistence
from optimistic UI.

**Harness traps, every one of which produced a convincing false result:**

- **The Team route cannot be deep-linked.** `…/team/chat` redirects to `/open-project` via startup
  routing. Click `[data-testid="sidebar-team"]` from `/`, then the `team-section-*` buttons.
- **Pass `colorScheme: "dark"`.** The design is dark; headless Chromium defaults to light, so a
  screenshot will look wrong in ways that have nothing to do with your change.
- **`page.on("dialog", d => d.accept())`** or `window.confirm`-backed deletes silently cancel.
- **`team-channel-` also prefixes the create button and the unread badges.** A `.last()` selector
  clicks the wrong thing and the feature looks broken. Same class of mistake cost two rounds on the
  task board: the card is also `role="button"`, so grabbing the drag activator needs
  `[aria-roledescription]` specifically.
- **One console error is pre-existing and not yours**: `React does not recognize the 'uniProps' prop
on a DOM element`. It fires on `/open-project`, where no Team code mounts.
- **`gh run view --json` rejects `displayTitle`/`startedAt`** on the installed CLI version. A bad
  field name exits 1 and reads exactly like a failed build.

## `tasks.md` is not a reliable completion record

Read scope from `spec.md`. T049 was checked off while FR-005's create/rename/delete sat
unimplemented on the client for the entire build. T101 is unchecked but passes.

## Open work

### The three product gaps the design assumed

These are the reason Team still feels incomplete in use. None is a styling problem.

**1. You cannot create a workspace from the app without starting a chat.**
`New workspace` routes to `/new`, the agent draft — the workspace only materializes when you send a
first message. Every member needs its **own** home workspace (`project_members.home_workspace_id` is
UNIQUE), so a team of four means four chat drafts. `workspace.create.request` already exists on the
WebSocket protocol (`messages.ts:2054`) with `worktree` + `branch-off` + `projectId`, so the daemon
can already do it — the app just never offers it standalone. Smallest honest fix: a "Create a
workspace" action inside the member form's Home workspace picker, where the need actually arises.

**2. Channel membership is opt-in.**
`TeamMember.channelIds` is populated from `channel_members`; channel create/update carry optional
`memberIds` on the existing RPCs, and mention resolution plus message wake-up use that membership.
New channels and newly assigned members join nothing unless explicitly picked. Existing channels
are migration-backfilled with their assigned members so upgrading does not silence them. This
reverses the former _everyone in, opt out_ decision: membership now controls wake fan-out, so an
over-included member burns an agent turn on every message rather than merely appearing in `@`.

**3. Member status is correct on refresh but never pushed.**
`8e0820a49` made status truthful, but nothing emits an event when an agent's liveness changes, so a
member that starts running will not flip until the roster refetches. Switching sections or reloading
does it. The fix is a `team.member.changed` emission on agent lifecycle transitions.

### Validation

| Task | State                                                                                   |
| ---- | --------------------------------------------------------------------------------------- |
| T046 | **Done for desktop/web.** Native mobile untested; compact layout deliberately deferred. |
| T114 | Open. Unclean shutdown, adoption with CLI intact, cross-daemon. Cheapest — start here.  |
| T101 | Passes on `t101-live-check.ts`; guards never fired because the loop converged first.    |
| T074 | Open. Worktree removal, memory survival, merge does not strand.                         |
| T122 | Open. Large-history perf, compact parity, back-compat both directions. Needs a device.  |

### Compact / mobile is deliberately unbuilt

The design is a 1440×900 desktop frame. The Team surface targets wide form factors; compact still
uses the old stacked behaviour. **The user is designing compact separately** — do not extrapolate a
phone layout.

### The gap to raft (`~/general/RAFT-A.md`, `RAFT-B.md`)

Members get 6 MCP tools; raft agents get ~11 command families. Already matching: the task flow
(`todo → in_progress → in_review → done`), claims, the MEMORY.md protocol with member-owned home
dirs, and `member-proposal-cards.tsx` (raft's clickable `agent:create` card).

| Gap                       | Why it matters in raft                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **Threads**               | Where coordination happens — 37-reply and 5-reply threads in the walkthrough        |
| **DMs**                   | Credential hygiene depends on them: "send the endpoint by DM, not a public channel" |
| **Reminders**             | Author-owned, snoozable; agents use them to manage their own noise                  |
| **Message search**        | How agents recover prior context before answering                                   |
| **Channel membership**    | Public vs private, join/leave/mute, mention scoping                                 |
| **Sleep/wake on message** | Raft members are woken _by_ messages; ours are start/stop, which reads as processes |

Also absent: reactions, attachments/Files, saved messages, member profiles, and the
`type=third_party_app` message class with its prompt-injection guard.

Sleep/wake is the deepest difference and the one to scope carefully — it is an agent-lifecycle
change in upstream-owned code, not a Team-surface change. Note that the current model is closer than
it looks: a mention already starts a member and _is_ its prompt; `start` deliberately brings up a
warm runtime **without** prompting it. That distinction confused a user, so it is worth surfacing in
the UI rather than re-architecting first.

## The design handoff

`design_handoff_paseo_team_tab/`, delivered as a zip at
`~/.paseo/uploads/upload_2618e53e-beda-4dae-a974-67fa64d20829/`. Extract it before touching Team
layout; `/tmp` copies do not survive.

**It was a structure rebuild, not a palette one.** Every colour in the design is already a Paseo
dark-theme token — `#181B1A` is `surface0`, `#141716` is `surfaceSidebar`, `#252B2A` is `border`,
`#2F3534` is `borderAccent`, `#434645` is `surface3`, `#20744A` is `accent`, `#7ccba0` is
`accentBright`. The layout constants matched too: `HEADER_INNER_HEIGHT` is 48,
`WORKSPACE_SECONDARY_HEADER_HEIGHT` is 36, `MAX_CONTENT_WIDTH` is 820,
`SETTINGS_DESKTOP_SIDEBAR_WIDTH` is 320. The design was drawn from Paseo's real values.

The five colours with no token live in `screens/team/team-colors.ts`; fixed measurements in
`screens/team/team-layout.ts`. **Use those two files — do not reintroduce raw hex or magic numbers.**

What changed structurally: the shell stopped being a `ScrollView` of settings cards and became a
fixed frame — 48px header, 36px switcher, section body at `flex:1` + `minHeight:0`. That is what
lets Chat pin its composer and Tasks scroll its board horizontally. `settingsStyles` is still
correct for the Members configuration card and the Settings groups; those really are settings
surfaces, and the shared card already matches the design exactly. Chat and Tasks had to leave it.

**Cap with `alignSelf: "center"`, always.** The chat column capped at 820 but did not centre, so on
a wide window it stranded against one edge and collapsing the sidebar looked inert. Paseo's own
agent stream already pairs `maxWidth: MAX_CONTENT_WIDTH` with `alignSelf: "center"` — match it.

**Do not put a raw `TextInput` in a styled box.** It draws the platform focus ring tight around
itself, which reads as a stray rectangle _inside_ the composer. `FormTextInput` zeroes the outline
and styles its wrapper; the Team composer now does the same.

### Two fork-owned pieces worth knowing about

- `screens/team/ui/segmented-shell.tsx` — the design's segmented control is a _shell_ idiom
  (`surface1` shell, `surface3` active segment, rounded rectangles). The shared
  `components/ui/segmented-control.tsx` is a _pill_ idiom with a white active segment. Adding a
  variant to the shared one would mean editing an upstream file for a fork feature, so the fork owns
  this shape. Used by the section switcher (28/24) and the Board/List toggle (26/22).
- `screens/team/tasks/task-board-drag-surface.{web,native}.tsx` — **each `DraggableList` builds its
  own `DndContext`**, so four columns are four sealed drag contexts and `onDragEnd` is a
  within-list reorder callback that can never move a card between columns. The board owns one
  dnd-kit context with a `useDroppable` per column instead. `draggable-list.*` is upstream-owned and
  was deliberately not reshaped. Native keeps the explicit status menu — no faked cross-list drag.

## Fork desktop identity

`electron-builder.fork.yml` extends the upstream config and overrides only what must differ:

|                          | vanilla            | fork                   |
| ------------------------ | ------------------ | ---------------------- |
| Install dir / Start Menu | Paseo              | Paseo Team             |
| `appId`                  | `sh.paseo.desktop` | `app.dneet.paseo-team` |
| userData                 | `%APPDATA%\Paseo`  | `%APPDATA%\Paseo Team` |
| Windows executable       | `Paseo.exe`        | `PaseoTeam.exe`        |
| Updater                  | getpaseo releases  | this fork              |

Three traps, each silent, each pinned by a test in `fork-packaging.test.ts`:

- `productName` **must** equal `APP_NAME` in `main.ts`. It feeds `app.setName` → userData dir →
  Electron's single-instance lock. Left at "Paseo", launching this build while vanilla runs just
  focuses vanilla and exits.
- `win.executableName` must be overridden. Inherited, the exe stays `Paseo.exe` and the NSIS
  installer's running-instance check **shuts down a vanilla Paseo** mid-install.
- `publish` must point at this fork. Inherited, the installed app finds a newer getpaseo release and
  quietly replaces itself with vanilla.

`APP_SCHEME` stays `paseo` on purpose — it is a privileged renderer origin and the daemon's CORS
allowlist contains `paseo://app`, so renaming it breaks the renderer load, not just an association.
Both builds claim `paseo://` and the last installed wins; harmless while they share `~/.paseo`.

**Coexistence is now confirmed by hand** — the user installed this build and it ran as a second
Paseo instance alongside vanilla. That closes the long-standing "unverified, needs a human at the
machine" item. Still unverified: the Electron branch of the delete confirmation.

## Building a Windows installer

`.github/workflows/desktop-windows-fork.yml` — fork-owned, x64 NSIS only, off a branch, no tag, no
release. Upstream's `desktop-release.yml` is a release pipeline that wants an existing tag.

```bash
git push origin raft-parity   # the workflow checks out from the REMOTE
gh workflow run desktop-windows-fork.yml --ref main -f ref=raft-parity \
  -R kawaii-not-kawaii/paseo
```

~10 min, ~110 MB, artifact `paseo-team-windows-x64-<branch>-<sha>`. Last good run:
`30572344609` → `paseo-team-windows-x64-raft-parity-4a74eda`.

Three gotchas. `workflow_dispatch` only appears once the workflow exists on the **default branch**,
which is why a copy lives on `main`. The definition that _executes_ is main's copy — only the
checked-out tree comes from the dispatched ref, so editing the workflow on `raft-parity` alone
changes nothing. And **push before dispatching**: `actions/checkout` fetches the ref from the
remote, so unpushed commits build the old code and the green tick lies. Confirm with
`gh run view <id> --log | grep BUILT_SHA`.

## Infrastructure (done, verified)

- **Self-hosted relay** — `paseo.dneet.app` on this fork's Cloudflare account (`ee452b28f`,
  `fbbaad206`, `0d67e0ad9`). `useTls` is inferred from the endpoint port rather than a match against
  the hosted default. `PASEO_RELAY_UPSTREAM` must stay unset or the worker becomes a proxy to
  upstream's Fly relay.
- **Android APK via GitHub Actions** — no EAS, no Expo account, no `EXPO_TOKEN`. Carries a temporary
  path-filtered `push` trigger as the default-branch workaround; delete it once merged.

---

# Reference — still current

## How T056 was failing (kept: the lesson generalises)

The symptom was "members do not reliably choose to post in the channel". One run ended with `impl`
writing _"the team handoff tools were not callable in this session"_ — **literally true**. The member
had no `team_*` tools. Codex rollout logs (`~/.codex/sessions/**/rollout-*.jsonl`) record every tool
search: three searches with the right names, nothing but `mcp__codex_apps__github` back.

One config default:

```text
config.ts        mcpInjectIntoAgents ?? false   ← persisted loader defaults OFF
bootstrap.ts     treats undefined as true       ← the asymmetry that hid it
```

Tests that build a config object get injection; a daemon booting from a real `config.json` with no
`mcp` block does not. `~/.paseo/config.json` set it explicitly, so only the dev daemon was broken.
Hand-verifying `/mcp/agents` over HTTP missed it because `mcp.enabled` (mounts the route) and
`mcp.injectIntoAgents` (hands the server to agents) are independent switches.

**Dead hypotheses, do not re-chase**: tool namespacing, permission prompts, prompt wording. No
wording reaches a tool that is not there.

Around sixty team tests passed throughout, because every one stopped at `TeamService` or at the
composed prompt string. `member-home.test.ts` asserted `prompt.toContain("team_post")` — it verified
the string was written, which was never in doubt. `member-mcp-injection.test.ts` now covers the
actual launch boundary.

## Four defects T056 found that no unit test caught (`c95ef483c`)

1. **The human was missing from every project roster** — a daemon-wide identity never assigned to a
   project, so `listMembers` filtered it out and every user message rendered as a raw UUID.
2. **`team.member.create` dropped `rolePrompt`, `modeId`, `templateId`** — the app worked around it
   with a follow-up update, leaving a window where a mention starts a member with no role prompt.
3. **Members were never told how to collaborate** — `TEAM_COLLABORATION_PROMPT` in `member-home.ts`.
4. Two tests asserted whole-roster equality when they meant one member's state.

## Quickstart is not runnable as written

`quickstart.md` assumes CLI commands that do not exist — `paseo team task create` and similar.
**There is no `team` CLI surface**; it was never specified as a task. Drive the daemon over the
WebSocket protocol instead, as `t056-live-check.ts` and `t101-live-check.ts` do.

## Running things locally

The dev daemon is **isolated from the main one**: `PASEO_LISTEN=127.0.0.1:6768`,
`PASEO_HOME=.dev/paseo-home`. It never touches `~/.paseo` or port 6767.

```bash
npm run dev                                  # daemon on 6768
curl -s localhost:6768/api/health            # readiness
PASEO_HOST=127.0.0.1:6768 npm run cli -- ls -a
```

`npm run cli` defaults to 6767 and will fail against the dev daemon without `PASEO_HOST`.

The Team databases are plain SQLite and are the fastest way to set up a scenario the UI cannot yet
create — seeding a second channel, claiming a task, checking a read cursor:

```bash
.dev/paseo-home/team/roster.db                    # members
.dev/paseo-home/team/<projectId>.db               # channels, messages, tasks, cursors
```

Inspect the MCP surface directly:

```bash
curl -s -X POST "http://127.0.0.1:6768/mcp/agents?callerAgentId=<agent-uuid>" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"team_roster","arguments":{}}}'
```

Without `callerAgentId` the team tools refuse with "team tools require a calling member runtime" —
that refusal is the tool working.

### Gotcha for any live harness

A member calling `team_post` does not go through whatever `MemberLifecycle` your script built.
`mcp-tools.ts` constructs its own from the daemon's real `WorkspaceRegistry`. Stub that registry and
the two disagree: the mention resolves a home workspace that "does not exist", which clears
`home_workspace_id` and makes the teammate unmentionable. It looks exactly like a product failure.
Seed `$PASEO_HOME/projects/workspaces.json` before the daemon starts.

Also: `project_members.home_workspace_id` is UNIQUE, so two members cannot share one workspace id.
Two ids pointing at the same directory is fine, and is what lets qa read what impl wrote.

## Constraints

- **Fork-owned directories only.** Every upstream seam is listed in `docs/fork.md` — keep the table
  current; one read should give the complete picture. A seam that outgrows "one import and one
  registration" moves back into fork-owned code.
- **Never modify** `chat-service.ts` or `loop-service.ts` (Constitution VIII).
- **Per-file test runs only**: `npx vitest run <file> --bail=1`. Never the full suite locally — it
  will freeze the machine. Push to CI; it is the only thing that has caught cross-package and
  Windows regressions.
- **Close every database handle in tests.** Windows fails with `EBUSY` where POSIX forgives.
- Real SQLite, real filesystem. Never a mock database.
- **`useUnistyles()` is banned** (docs/unistyles.md). Use `StyleSheet.create((theme) => …)`; for a
  theme-reactive React prop such as an icon `color`, wrap that leaf with `withUnistyles` + `uniProps`.
- `npm run typecheck` and `npm run lint` after every change; `npm run format` before committing.
  Never `--no-verify`, never loosen lint or tsconfig to make something pass.
- Protocol stays backward compatible both directions; new fields `.optional()`. New daemon
  capability goes behind `server_info.features.*` with one `COMPAT(name)` comment, and **no fallback
  paths** — the client either has the capability or says so.
- **Never restart the daemon on port 6767.** The dev daemon on 6768 is fair game.

## Decisions — do not reopen

Everything from the original handoff holds: lease-based claims, progress-based guards, role prompt
vs MEMORY.md, per-project-per-daemon scope.

| Decision                                                    | Where                                              |
| ----------------------------------------------------------- | -------------------------------------------------- |
| The human identity appears in every project roster          | `team-service.ts` `listMembers`                    |
| Member create carries role prompt, mode and template        | `rpc-schemas.ts`, optional fields                  |
| Members are told to use the channel, not spawn agents       | `member-home.ts` `TEAM_COLLABORATION_PROMPT`       |
| Message retention cap defaults to 50,000                    | User-chosen placeholder, not research-derived      |
| Starting a member by hand does not prompt it                | `member-lifecycle.ts` `start`                      |
| Stopping a member never releases its claims                 | `member-lifecycle.ts` `stop`, research R1          |
| Chat stays a full-height section with its own channel rail  | Design handoff — supersedes "channels as tabs"     |
| Channel membership is opt-in                                | Reversed: wake fan-out makes over-inclusion costly |
| `APP_SCHEME` stays `paseo`; only the OS association differs | Privileged renderer origin + daemon CORS           |
| The app sidebar is **not** restyled to the design           | Avoids widening the fork's merge surface           |
| Compact/mobile is designed separately by the user           | Wide form factors only for now                     |

## Uncommitted, deliberately

`.gitignore` carries a modification that predates this work. The BMAD and Codex tooling directories
(`.agents/`, `.claude/skills/`, `.bmad-loop/`, `_bmad/`, `.codex/`) are untracked and have been
excluded from every commit. They either belong in `.gitignore` or belong committed — unresolved, and
a `git add -A` would sweep them in.

## Design elements without backing data

Four elements the design draws are deliberately **not built**, because no data backs them. Shipping
a control that does nothing is worse than omitting it:

- **System-note pill** — task status events are project-scoped while messages are channel-scoped,
  and neither identifies the channel/message that should own the pill. A `kind` field alone would
  create a renderer with no truthful producer.
- **Composer image and paperclip** — there is no attachment entity, storage, upload/download
  protocol, retention policy, or agent-facing file contract.
- **Channel header bell** — mute and channel preferences do not exist; see the channel-membership
  gap above.
- **Header panel-right** — Team is a host route with no right panel. A toggle without a target is
  not a feature.

Presence follows the same rule: the line reports `@member is working` only for a genuine `running`
status, never invented command text.
