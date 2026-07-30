# Handoff: Team Parity

**For**: a fresh session picking up where this one stopped
**Branch**: `raft-parity`, pushed, HEAD `71a17cf4a`. **PR #1** open on the fork, draft.
**State**: the Team surface is reachable, usable, and shipped in a Windows build. What remains is
validation, a UI integration already designed, and the raft-behaviour gap.

---

## Read this first: the previous handoff's headline bug is fixed

The last version of this file opened with _"OPEN: the Team surface does not appear in a client,
cause unknown — this is where the session stopped, start here."_ **That is solved.** Do not start
there.

It also said the one thing never verified was what `features` the daemon actually puts on the wire.
That got captured — boot an isolated in-process daemon, connect a `DaemonClient`, print the hello
payload:

```
version: 0.2.2
features.team: true
```

The daemon was never the problem. The bug was in `use-team-nav.ts`:

```ts
const serverId = activeWorkspaceSelection?.serverId ?? hosts[0]?.serverId ?? null;
```

A desktop client keeps a `local:`-prefixed placeholder host for its managed daemon even when that
daemon is disabled. It never connects, so it has no `server_info` and no features. Sorted first, it
hid the row while a remote host was serving Team perfectly well. Fixed in `a51003f86` by resolving
against hosts that actually publish `features.team`, using the existing `useHostFeatureMap`.

The untested hypothesis the old handoff floated was the right one. The lesson is that it stayed
untested for a whole session while the daemon got re-examined instead.

## What this session changed

| Commit      | What                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| `a51003f86` | Team row resolves against a host that actually published `server_info` |
| `71bd1f870` | Fork ships as **"Paseo Team"**, installable beside a vanilla Paseo     |
| `b7738196f` | Installer artifact named after the commit it was built from            |
| `ca1459f03` | Settings crashed the app; no form field ever showed its value          |
| `abb811c8b` | Installer no longer shuts down a running vanilla Paseo                 |
| `537642c3a` | Channel creation — unblocks empty projects                             |
| `71a17cf4a` | Channel rename, purpose, delete — **FR-005 closed**                    |

### Two client bugs only a browser could find

Both were first reachable once the Team row rendered. Both are now in `docs/forms.md` as
review-on-sight anti-patterns, because both **type-check and fail silently**.

1. **A `useSyncExternalStore` getSnapshot must be reference-stable.** `getState` on both form models
   cloned per call. React compares snapshots with `Object.is` during render, so every render looked
   like a store change and the component looped until it threw _"Maximum update depth exceeded"_ —
   React error #185, minified and useless in a packaged build. Settings crashed on open. The member
   form would have crashed identically the moment anyone pressed "New member"; it only looked clean
   because it mounts on demand. Build the clone in `publish()`.
   `member-form.tsx` had a second, independent loop from an inline `providerEntries: entries ?? []`
   — a fresh array each render retriggers the apply-effect keyed on its identity.

2. **`FormTextInput` ignores `value`.** `AdaptiveTextInput` destructures `value` away and seeds from
   `initialValue ?? defaultValue`, deliberately, so RN cannot replay stale values and jump the
   cursor. Passing `value` type-checks — the props extend `TextInputProps` — and renders an empty
   box. `member-form.tsx` and `member-detail.tsx` were already correct; the settings and task-detail
   forms were not, so seven fields rendered blank.

### The channel-management gap

FR-005 requires create, rename, describe and delete. The daemon implemented all four end to end with
tests (T026). **The client implemented none of them** — the three mutating RPCs had zero callers
anywhere in the repo, and `packages/app` had only `listTeamChannels`. A brand-new project had zero
channels and no way to make one.

Not a regression. T049 shipped a channel _list_ and was checked off; the create path was never
decomposed into a task at all.

## The verification method that actually works

Service-level green has now **four times** failed to catch a client-side defect on this surface.
Unit tests missed the Team row, both render loops, the blank fields, and an entire missing feature.

Drive the real UI in a browser. This harness found all of them and is cheap to rebuild:

```bash
npm run dev        # dev daemon on 127.0.0.1:6768, PASEO_HOME=.dev/paseo-home
npm run dev:app    # Expo web on 8081; Metro's first bundle takes ~40s
```

Then Playwright (already installed at the repo root — run the script _from the repo root_ or module
resolution fails) against `http://localhost:8081/h/<serverId>/team/<section>`. Read `serverId` from
`.dev/paseo-home/server-id`; it was `srv_AuM1y7-wS71B` and can change. The dev home already carries
a Team project `prj_6417ab69f2b15a9c` with a `#build` channel and the T056 transcript.

Assert: `console` errors, `pageerror`, and that the body does not contain "went wrong" / "ran into a
problem". Then reload and re-check — a full reload re-reads from the daemon, which is what proves
persistence rather than optimistic UI.

**Two harness traps**, both of which produced convincing false results:

- `confirmDialog` routes through `window.confirm` on plain web. Playwright **auto-dismisses**
  dialogs, so a delete silently cancels and looks broken. Add `page.on("dialog", d => d.accept())`.
  On Electron it routes to the native desktop dialog — a different path, still unverified.
- The channel manage kebab acts on the **selected** channel, not per row. A `.last()` selector will
  cheerfully rename something you did not mean to.

## `tasks.md` is not a reliable completion record

Read scope from `spec.md`. Treat `tasks.md` as a rough guide:

- **T049** is checked off while FR-005's create/rename/delete sat unimplemented on the client for
  the entire build. The task list looked complete.
- **T101** is unchecked but passes (`t101-live-check.ts`).
- **T046** is unchecked; now done for desktop and web, open only for native mobile.

## Open work

### Validation

| Task | State                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------- |
| T046 | **Done for desktop/web.** Packaged Windows build mounts all four sections. Native mobile untested. |
| T114 | Open. Unclean shutdown, adoption with CLI intact, cross-daemon. Cheapest — start here.             |
| T101 | Passes on `t101-live-check.ts`; guards never fired because the loop converged first.               |
| T074 | Open. Worktree removal, memory survival, merge does not strand.                                    |
| T122 | Open. Large-history perf, compact parity, back-compat both directions. Needs a device.             |

### The UI was rebuilt to the design handoff — this section is superseded

A hi-fi design handoff (`design_handoff_paseo_team_tab/`) is now the source of truth for how Team
looks. It **supersedes the channel-tabs plan below**: Chat stays a full-height section with its own
240px channel rail, and no upstream `workspace-tabs` files are touched. Read the design's README
before changing any Team layout.

Every color in that design is already a Paseo dark-theme token — `#181B1A` is `surface0`, `#141716`
is `surfaceSidebar`, `#20744A` is `accent`. So it was a structure rebuild, not a palette one. The
five values with no token live in `screens/team/team-colors.ts`; the fixed measurements live in
`screens/team/team-layout.ts`.

What that rebuild changed: the shell stopped being a `ScrollView` of settings cards and became a
fixed frame (48px header, 36px switcher, section body at `flex:1` + `minHeight:0`), which is what
lets Chat pin its composer and Tasks scroll its board. `settingsStyles` is still correct for the
Members configuration card and the Settings groups — those really are settings surfaces, and the
shared card already matches the design exactly. It is Chat and Tasks that had to leave it.

### The original channel-tabs plan (NOT the current direction — kept for context)

The Team surface looks wrong because it was assembled from the **settings** idiom — `settingsStyles`
appears in 13 Team files, and Paseo's real chat uses none of it. `packages/app/src/composer/` and
`components/message.tsx` exist and go unused; the chat composer is a hand-rolled `TextInput` in a
settings row. That is the whole reason it reads as alien.

The chosen fix, which subsumes a restyle:

- **Channels stay listed in the left sidebar**, under the Team row, the way Workspaces lists
  workspaces. `TeamSidebarRow` is already fork-owned, so this needs **no new upstream seam**.
- **Clicking a channel opens a tab in the top tab strip**, beside terminal / diff / file browser.
  Channel content then inherits Paseo's chrome for free.
- Members, Tasks and Settings stay as the full-screen section. Only Chat moves.
- Keep the existing full-screen Chat until the tab version is proven, then delete it separately.

Cost, measured not guessed — four upstream files, all _additive cases in existing switches_:
`workspace-tabs/model.ts` (union member), `workspace-tabs/identity.ts` (normalize + equality —
mandatory, tabs are serialized and restored across restart), `panels/register-panels.ts` (one
`registerPanel`), and `workspace-tab-menu.ts`. The panel component is fork-owned and reads its
target from `usePaneContext`.

Known wrinkle: tabs belong to a **workspace**, channels are **project**-scoped. A channel tab opens
in whichever workspace is active, so the same channel can be open in two workspaces at once and
closing one will not close the other. Judged acceptable — it is a view, not a resource of that
workspace.

Members already carry `homeWorkspaceId`, so terminal, diff and file browser already work for a
member. That part is routing, not new code.

### Channel membership (specced, not built)

Mentions currently resolve against **project** membership — `resolveMentionMemberIds`
(`team-service.ts:928`) accepts any member assigned to the project, in any channel. Raft's rule is
that mentions only reach members of the channel.

Needs: a `channel_members` table, add/remove/list on the service, two RPCs, per-channel scoping in
`resolveMentionMemberIds` (one function, all callers already route through it), and a members picker
in the channel form.

**User decision — do not reopen**: _everyone in, opt out_. Existing channels get every project
member; new channels default to all members with the picker to trim. Nothing breaks on upgrade and
mentions keep working where they do today.

### The gap to raft (`~/general/RAFT-A.md`, `RAFT-B.md`)

Members get 6 MCP tools — `team_post`, `team_read`, `team_roster`, `team_tasks`, `team_task_update`,
`team_propose_members`. Raft agents get ~11 command families.

Already matching: task flow (`todo → in_progress → in_review → done`, identical), claims, the
MEMORY.md protocol with member-owned home dirs, and `member-proposal-cards.tsx` — which is raft's
clickable `agent:create` action card.

Missing, roughly by how much each changes the feel:

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

The sleep/wake lifecycle is the deepest difference and the one to scope carefully — it is an
agent-lifecycle change, not a Team-surface change, and it lands in upstream-owned code.

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
Both builds therefore claim `paseo://` and the last installed wins; harmless while they share
`~/.paseo`.

**Unverified, needs a human at the machine**: that the two actually coexist, and the Electron branch
of the delete confirmation.

## Building a Windows installer

`.github/workflows/desktop-windows-fork.yml` — fork-owned, x64 NSIS only, off a branch, no tag, no
release. Upstream's `desktop-release.yml` is a release pipeline that wants an existing tag and builds
four artifacts behind a create-release job.

```bash
gh api repos/kawaii-not-kawaii/paseo/actions/workflows/322458477/dispatches \
  -X POST --input - <<< '{"ref":"main","inputs":{"ref":"raft-parity"}}'
```

~11 min, ~116 MB, artifact `paseo-team-windows-x64-<branch>-<sha>`.

Two gotchas: `workflow_dispatch` only appears once the workflow file exists on the **default
branch**, which is why a copy lives on `main`. And the workflow definition that _executes_ is main's
copy — only the checked-out tree comes from the dispatched ref, so editing the workflow on
`raft-parity` alone changes nothing.

## Infrastructure (done, verified)

- **Self-hosted relay** — `paseo.dneet.app` on this fork's Cloudflare account. The relay carve-out
  the previous handoff listed as "still unwritten, still blocking any release" is **done**
  (`ee452b28f`, `fbbaad206`, `0d67e0ad9`). `useTls` is now inferred from the endpoint port rather
  than from a match against the hosted default. `PASEO_RELAY_UPSTREAM` must stay unset or the worker
  becomes a proxy to upstream's Fly relay.
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
- `npm run typecheck` and `npm run lint` after every change; `npm run format` before committing.
  Never `--no-verify`, never loosen lint or tsconfig to make something pass.
- Protocol stays backward compatible both directions; new fields `.optional()`.
- **Never restart the daemon on port 6767.** The dev daemon on 6768 is fair game.

## Decisions — do not reopen

Everything from the original handoff holds: lease-based claims, progress-based guards, role prompt
vs MEMORY.md, per-project-per-daemon scope.

| Decision                                                    | Where                                          |
| ----------------------------------------------------------- | ---------------------------------------------- |
| The human identity appears in every project roster          | `team-service.ts` `listMembers`                |
| Member create carries role prompt, mode and template        | `rpc-schemas.ts`, optional fields              |
| Members are told to use the channel, not spawn agents       | `member-home.ts` `TEAM_COLLABORATION_PROMPT`   |
| Message retention cap defaults to 50,000                    | User-chosen placeholder, not research-derived  |
| Starting a member by hand does not prompt it                | `member-lifecycle.ts` `start`                  |
| Stopping a member never releases its claims                 | `member-lifecycle.ts` `stop`, research R1      |
| Chat stays a full-height section with its own channel rail  | Design handoff — supersedes "channels as tabs" |
| Channel membership defaults to every project member         | This session — "everyone in, opt out"          |
| `APP_SCHEME` stays `paseo`; only the OS association differs | Privileged renderer origin + daemon CORS       |

## Uncommitted, deliberately

`.gitignore` carries a modification that predates this work. The BMAD and Codex tooling directories
(`.agents/`, `.claude/skills/`, `.bmad-loop/`, `_bmad/`, `.codex/`) are untracked and have been
excluded from every commit. They either belong in `.gitignore` or belong committed — unresolved, and
a `git add -A` would sweep them in.

## Design elements without backing data

The July 30 Team design completion pass evaluates four intentionally omitted elements:

- **System-note pill** — not built. Task status events are project-scoped while messages are
  channel-scoped, and neither a task nor a status update identifies the channel/message that should
  own the pill. Adding a `kind` field alone would create a renderer with no truthful producer.
- **Composer image and paperclip** — not built. There is no attachment entity, storage,
  upload/download protocol, retention policy, or agent-facing file contract. Shipping buttons would
  be dead UI; building the feature would be a separate trust-boundary and storage project.
- **Channel header bell** — not built. Mute and channel membership/preferences do not exist. The
  bell waits for that product capability rather than inventing a local-only preference.
- **Header panel-right** — not built. Team is a host route with no right panel to reveal. A toggle
  without a target is not a feature.
