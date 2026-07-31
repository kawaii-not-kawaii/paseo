# Fork maintenance

This repository is a fork of [getpaseo/paseo](https://github.com/getpaseo/paseo). It carries
fork-specific features while continuing to merge upstream fixes and features.

That second half is a constraint on how the first half is written. See Principle VIII in
`.specify/memory/constitution.md`.

## Remotes

```
origin     kawaii-not-kawaii/paseo   fetch + push   this fork
upstream   getpaseo/paseo            fetch only     push URL deliberately DISABLED
```

Sync:

```bash
git fetch upstream
git merge upstream/main        # on a branch, never straight onto a dirty tree
```

## The rule

Merge conflicts happen in files **upstream also edits**. The metric that matters is not how large
our diff is, it is how much of it lands in upstream-owned files.

- New behaviour goes in new files in fork-owned directories. New files never conflict.
- Where an upstream file must be touched, the edit is a **seam**: one import, one registration
  call. All logic lives in our files. Resolving that conflict is re-adding one line.
- Never reshape an upstream service in place to serve a fork feature. Build alongside it and leave
  its behaviour and consumers working. Duplicating a concept is cheaper than permanently owning a
  conflict in an actively developed file.
- Never make formatting-only, rename-only, or drive-by changes to upstream files. They create
  conflicts and buy nothing.

## Fork-owned directories

Code here is ours. Upstream does not touch it, so it never conflicts.

| Path                                         | Contents                                                     |
| -------------------------------------------- | ------------------------------------------------------------ |
| `packages/protocol/src/team/`                | Team surface wire schemas                                    |
| `packages/server/src/server/team/`           | Team service, storage, migrations, loop control              |
| `packages/app/src/screens/team/`             | Team view screens                                            |
| `packages/app/src/app/h/[serverId]/team/`    | Team routes                                                  |
| `docs/fork.md`                               | This file                                                    |
| `specs/`                                     | Fork feature specs                                           |
| `packages/desktop/electron-builder.fork.yml` | Fork desktop identity, extends the upstream config           |
| `.github/workflows/desktop-windows-fork.yml` | One-installer Windows build off a branch, no tag, no release |

## Touched upstream files

Every edit to an upstream-owned file is listed here with its reason. Keep this table current — it
is the fork's merge surface, and it should stay short. If an entry stops being a one-line seam,
that is a signal to move logic back into a fork-owned file.

Planned for the team-parity feature (not yet applied — see `specs/001-team-parity/plan.md`):

| File                                                                       | Kind              | Reason                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol/src/messages.ts`                                        | Applied seam      | Imports the fork-owned team schema tuples and registers them in the session inbound/outbound discriminated unions, and extends `server_info.features` with the fork-owned `team` capability flag shape.                                                                                                                 |
| `packages/server/src/server/session.ts`                                    | Applied seam      | Imports the fork-owned team helpers, attaches the team session in the constructor, delegates team RPCs with `if (isTeamRequest(msg)) return this.teamSession.handle(msg)`, and calls fork-owned Team project cleanup from `project.remove.request`.                                                                     |
| `packages/server/src/server/bootstrap.ts`                                  | Applied seam      | Constructs the fork-owned `TeamService` and its daemon-wide member lifecycle bridge, patches `server_info.features.team` through the fork-owned bootstrap helper, and closes the service on daemon shutdown.                                                                                                            |
| `packages/app/src/app/h/[serverId]/_layout.tsx`                            | One-line seam     | Registers the fork-owned `team/[section]` host leaf in the host layout only.                                                                                                                                                                                                                                            |
| `packages/app/src/utils/host-routes.ts`                                    | Appended function | `buildHostTeamRoute(serverId, section)` for the fork-owned Team host leaf.                                                                                                                                                                                                                                              |
| `packages/app/src/components/left-sidebar.tsx`                             | ~6 additions      | Team nav row. Not a one-liner: the row is duplicated across compact and wide render paths. Accepted with rationale in the plan's Complexity Tracking.                                                                                                                                                                   |
| `packages/server/src/server/agent/tools/paseo-tools.ts`                    | Applied seam      | Registers the fork-owned `team_*` MCP tools from `packages/server/src/server/team/mcp-tools.ts` with a single import and registration call.                                                                                                                                                                             |
| `packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts`      | Applied seam      | Imports the fork-owned team home-workspace guard and returns early so a member's home workspace is never auto-archived on merge.                                                                                                                                                                                        |
| `packages/app/src/i18n/resources/{ar,en,es,fr,ja,pt-BR,ru,zh-CN}.ts`       | Additive          | Adds the Team UI locale blocks to every supported app locale. Not a seam, but still upstream-owned files touched by the feature.                                                                                                                                                                                        |
| `packages/app/src/utils/host-routes.test.ts`                               | Additive          | Covers the appended `buildHostTeamRoute()` helper with a small route-construction assertion.                                                                                                                                                                                                                            |
| `packages/server/src/server/auto-archive-on-merge/archive-if-safe.test.ts` | Additive          | Covers the home-workspace guard so the seam in `archive-if-safe.ts` does not regress.                                                                                                                                                                                                                                   |
| `packages/desktop/src/main.ts`                                             | One-line seam     | `APP_NAME` is `"Paseo Team"`, matching `productName` in `electron-builder.fork.yml`. It feeds `app.setName` → userData directory → Electron's single-instance lock, so leaving it at upstream's `"Paseo"` makes this build focus a running vanilla Paseo instead of launching. `APP_SCHEME` stays `paseo` deliberately. |
| `packages/desktop/package.json`                                            | One-line seam     | `build` points at `electron-builder.fork.yml` instead of the upstream config.                                                                                                                                                                                                                                           |
| `packages/desktop/bin/paseo.cmd`                                           | One-line seam     | Resolves `PaseoTeam.exe`, matching `win.executableName` in `electron-builder.fork.yml`. The shim hardcodes the executable name, so renaming the exe — which is what stops the NSIS installer from shutting down a running vanilla Paseo — drags this with it.                                                           |
| `package-lock.json`                                                        | Generated         | Lockfile churn from `npm install` in the setup phase. No product logic should move here.                                                                                                                                                                                                                                |
| `docs/glossary.md`                                                         | Additive          | New terms, required by Principle VI.                                                                                                                                                                                                                                                                                    |
| `docs/data-model.md`                                                       | Additive          | The SQLite boundary, required by Principle VII.                                                                                                                                                                                                                                                                         |

## Deliberately not upstreamable

Changes that only make sense for this fork, kept centralized so upstream churn around them does not
scatter conflicts.

| Concern                                  | Where                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relay worker deployment target           | `packages/relay/wrangler.toml` — this fork's Cloudflare account and hostname, and no `PASEO_RELAY_UPSTREAM`. Setting that var turns the worker into a proxy to upstream's Fly relay.                    |
| Relay endpoint and app base URL defaults | **Unchanged on purpose.** The daemon reaches the fork's relay through `daemon.relay.endpoint` (or `PASEO_RELAY_ENDPOINT`), and the app learns it from the pairing offer, so no constant needed forking. |

## Upstream services we build alongside rather than modify

| Upstream service                                  | Why we leave it alone                                                    | What we do instead                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server/src/server/chat/chat-service.ts` | Daemon-global JSON store, serves the `paseo chat` CLI that upstream owns | Team chat is a separate project-scoped store. Existing rooms are imported once; the upstream service keeps running untouched.                           |
| `packages/server/src/server/loop-service.ts`      | ~1000 lines, actively developed, owns the existing loops surface         | Team loop control is a fork-owned module reusing the same guard semantics. Loops created outside the Team view keep using upstream's service unchanged. |
