# Feature Specification: Team Parity

**Feature Branch**: `raft-parity`

**Created**: 2026-07-27

**Status**: Draft

**Input**: A project-scoped Team surface where persistent agent members coordinate through channels and a shared taskboard, modelled on the raft.build walkthrough, single-user throughout.

## Overview

Today a Paseo user orchestrates agents one at a time, and every exchange routes through the
human. The user briefs an agent, waits, reads the result, and briefs the next one. Agents cannot
see each other, cannot hand work off, and do not persist beyond the task they were created for.

This feature gives a project a standing team. Agents become durable members with names, roles, and
a home workspace. They talk to each other in project channels, hand work off by mention, and track
that work on a shared board. The human watches, steers, and is pulled in at decision points —
rather than being the message bus.

The user-facing deliverable is a new **Team** view in the app. Backend work is in scope only where
it is required to make that view real.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agents coordinate in a channel without the human relaying (Priority: P1)

The user opens the Team view for a project and sees its channels. They post a request in `#all`.
Two member agents pick it up, discuss the approach between themselves, and one hands the final
step to the other by name. The user reads the whole exchange as it happens and does not have to
copy anything between agents.

**Why this priority**: This is the thesis of the feature. Without it, everything else is
decoration on the existing single-agent workflow. It is also the only part that is impossible
today — agents currently have no way to reach a channel at all.

**Independent Test**: Create a project with two member agents, post one message asking for work
that requires both, and verify a multi-turn agent-to-agent exchange completes with the human
sending exactly one message.

**Acceptance Scenarios**:

1. **Given** a project with channels, **When** the user opens the Team view and selects a
   channel, **Then** they see its message history with each message attributed to its author and
   timestamped.
2. **Given** the user posts a message in a channel, **When** a member agent is mentioned by name,
   **Then** that agent receives the message and can reply in the same channel without further
   human action.
3. **Given** an agent is working, **When** it mentions another member by name, **Then** the
   mentioned member receives the message and can act on it, and both messages appear in the
   channel in order.
4. **Given** a channel is open, **When** any member posts, **Then** the new message appears in the
   user's view without a manual refresh.
5. **Given** an agent is composing or working, **When** the user is viewing the channel, **Then**
   the agent's current activity is visible so the user can tell the difference between "thinking"
   and "stalled".
6. **Given** the user is viewing one workspace of a project, **When** they open the Team view,
   **Then** they see the same channels and the same history as they would from any other
   workspace or worktree of that project.
7. **Given** two members are iterating on a task — one rejecting and handing back, the other fixing
   — **When** they continue to record progress, **Then** they are never interrupted, however many
   rounds it takes.
8. **Given** a task has been handed back the configured number of times without being accepted,
   **When** the limit is reached, **Then** work on that task stops, the user is mentioned in the
   channel where it was happening, and the attempt history is readable from the task.
9. **Given** one task has escalated, **When** other members are working on other tasks, **Then**
   they continue uninterrupted.
10. **Given** members are exchanging messages without recording any progress, **When** the
    no-progress backstop is reached, **Then** they stop and the user is told.
11. **Given** members have stopped at any limit, **When** the user resumes, **Then** members
    continue from where they stopped and the relevant count starts again from zero.

---

### User Story 2 - A team that persists (Priority: P2)

The user assembles a set of specialist members for a project — a lead, a UI engineer, a QA
engineer — each with a description of what it owns and its own workspace to work in. Those members
are still there tomorrow, after a daemon restart, and after the branch they were working on is
merged and its worktree removed.

**Why this priority**: Persistence is what separates a team from a batch of one-off agents. It is
required for Story 1 to be worth anything beyond a single session, but Story 1 can be demonstrated
first with ad-hoc members.

**Independent Test**: Create three members, restart the daemon, and verify all three are still
present with their descriptions, project assignments, and home workspaces intact.

**Acceptance Scenarios**:

1. **Given** the Members section of the Team view, **When** the user adds a member, **Then** they
   name it, describe what it owns, choose its runtime and model, choose the workspace it works in,
   and give it a role prompt — optionally starting from a built-in template.
1a. **Given** an existing member, **When** the user asks it to propose a team for the project,
    **Then** it returns proposed roles with names, descriptions, and role prompts, and each is
    created only when the user reviews and confirms it individually.
1b. **Given** a member has been working for some time, **When** the user opens its detail view,
    **Then** they can read its memory document and browse its home directory.
1c. **Given** a member has accumulated memory, **When** its home workspace is removed and it is
    re-pointed at a new one, **Then** its memory and home directory are unchanged.
2. **Given** a member exists, **When** the daemon restarts, **Then** the member is still listed
   with its name, description, runtime configuration, project assignments, and home workspace.
3. **Given** a member is listed, **When** the user views it, **Then** they can see whether it is
   currently running, what it is doing, which workspace it works in, and which channels it is in.
4. **Given** a member is assigned to a project, **When** the user assigns it to a second project,
   **Then** it appears in both rosters and has a separate home workspace in each.
5. **Given** a member has a home workspace, **When** that workspace is archived and its worktree
   removed, **Then** the member survives, is flagged as needing a workspace, and the user is
   prompted to pick a new one before it can run again.
6. **Given** two members are assigned to a project, **When** both are running, **Then** they are
   working in separate workspaces and neither can disturb the other's working tree.
7. **Given** a member is removed, **When** the user confirms, **Then** its messages remain in
   channel history attributed to it, so the record stays readable.

---

### User Story 3 - Shared work tracking (Priority: P3)

The user opens the Tasks section and sees a board for the project: Todo, In Progress, In Review,
Done. They add a task and assign it to a member. The member claims it, moves it across the board as
it works, and posts notes against it. While it holds the claim no other member can touch the task,
so two agents never do the same work twice. When its part is done it releases the task and the next
specialist claims it.

**Why this priority**: The board makes the team's work legible and gives agents a shared,
structured place to record state that chat cannot hold. It depends on members existing, but chat
coordination works without it.

**Independent Test**: Create tasks, assign them to members, and verify the board reflects every
status change made from the UI or by an agent, in both directions.

**Acceptance Scenarios**:

1. **Given** the Tasks section, **When** the user opens it, **Then** they see a board with Todo,
   In Progress, In Review, and Done columns, each showing its task count.
2. **Given** a task on the board, **When** the user drags it to another column, **Then** its status
   changes and the change is visible to every member.
3. **Given** the board, **When** the user filters by assignee or by creator, **Then** only matching
   tasks are shown, and the filter persists while they stay in the view.
4. **Given** the board, **When** the user switches to the list view, **Then** the same tasks are
   shown in a filterable list, including their dependencies.
5. **Given** a task, **When** the user opens it, **Then** they see and can edit its title,
   description, assignee, acceptance criteria, and dependencies, and read its notes in time order.
6. **Given** a member is working, **When** it records progress against a task, **Then** the note
   appears in the task's detail and the board reflects any status change without a refresh.
7. **Given** a task exists, **When** a member references it by its identifier in a channel message,
   **Then** the reference is rendered as a link that opens the task.
8. **Given** a task has unmet dependencies, **When** it is displayed, **Then** the blocking tasks
   are visible so the user can see why it cannot start.
9. **Given** an unclaimed task, **When** a member claims it, **Then** the claim is shown on the
   task and on the board, and every other member is refused if it tries to claim the same task.
10. **Given** a task held by one member, **When** that member releases it, **Then** another member
    can claim it, and the handover is visible in the task's notes.
11. **Given** a task held by a member, **When** the user needs to intervene, **Then** they can
    override the claim and reassign the task themselves.
12. **Given** a member holding a task stops or is removed, **When** the user views the task,
    **Then** it is no longer claimed and is available to another member.

---

### User Story 4 - The record survives (Priority: P4)

Months of channel history and task state accumulate. The user can rely on it being there after
crashes, upgrades, and mistakes, and it does not grow without bound.

**Why this priority**: Invisible until it fails, and then total. Sequenced last because it protects
the data the earlier stories produce, but it must ship with them, not after.

**Independent Test**: Populate a project with history, force an unclean daemon shutdown mid-write,
restart, and verify no committed message or task is lost and the view opens normally.

**Acceptance Scenarios**:

1. **Given** an existing installation with channels created before this feature, **When** the
   daemon starts for the first time after upgrading, **Then** those channels and their history are
   adopted into a project and remain readable — nothing is discarded.
2. **Given** a running daemon, **When** it is stopped uncleanly while agents are posting, **Then**
   on restart every message that was acknowledged to its author is still present.
3. **Given** a project's history, **When** the daemon starts and again every 24 hours, **Then** a
   consistent snapshot is taken without interrupting agents, and the three most recent snapshots
   are kept.
4. **Given** a retention cap is configured for a project, **When** history exceeds it, **Then**
   the oldest messages are pruned and the user can see that pruning occurred.
5. **Given** a project is deleted, **When** the user confirms, **Then** that project's team data is
   removed and no other project is affected.
6. **Given** an older version of the app connects to an upgraded daemon, **When** the user uses it,
   **Then** existing functionality continues to work and the Team view is either absent or clearly
   reports that the app needs updating.

---

### Edge Cases

- **A mentioned member is not running.** A session starts automatically and receives the mention
  (FR-035a).
- **A review loop does not converge.** A member repeatedly fails a task and hands it back. After
  the configured number of handbacks, work on that task stops and the user is escalated to, with
  the attempt history readable (FR-035c to FR-035e).
- **A review loop is converging slowly but genuinely.** It must not be interrupted — progress
  resets nothing but the no-progress backstop, and handbacks are counted per task, not per project.
- **Two members converse without touching any task.** The no-progress backstop stops them
  (FR-035f).
- **One task escalates while others are healthy.** Only the failing task stops; the rest of the
  project keeps working (FR-035e).
- **A member games the progress signal** by adding notes without doing work. Handback counting is
  independent of note-writing, so a non-converging task still escalates.
- **A member hangs inside a single attempt** and never completes a round, so the handback count
  never increments. The per-attempt wall-clock limit stops it and escalates (FR-035d1).
- **A limit is reached while nobody is watching the Team view.** The user must be notified through
  the existing notification path, not merely have state change on a screen they are not on
  (FR-035e1).
- **A limit is reached while the user is away.** Everything affected must be stopped and readable
  when they return — no session left running, and the reason visible without hunting.
- **Several channels in one project are active at once.** The no-progress backstop governs the
  project, so parallel conversations cannot together exceed it.
- **A member's home workspace no longer exists** because its worktree was removed on merge. The
  member must survive and be re-pointed, never silently run in the wrong directory (Story 2, #5).
- **Two members try to claim one task at once.** Exactly one succeeds; the other is refused and
  told who holds it (FR-024a).
- **A claimant dies holding a task.** The claim is released so another member can pick it up
  (FR-024e).
- **A member tries to claim a task that is blocked.** The claim is refused and the blocking
  dependencies are reported (FR-024f).
- **A member is mentioned in a project it does not belong to.** The mention must not resolve, and
  the author must be able to tell that it did not.
- **An agent posts continuously in a loop.** Retention and backup must remain bounded, and the user
  must be able to see and stop the member producing the volume.
- **The user is viewing a channel while retention prunes it.** The view must not appear to lose
  live messages or jump.
- **Channel history is opened for a project with tens of thousands of messages.** Opening a channel
  must not require loading all of it.
- **A member is removed while it holds an in-progress task.** The task must remain and become
  visibly unassigned rather than disappearing with the member.
- **A task is referenced in chat and then deleted.** The reference must degrade to something
  readable rather than breaking the message.
- **Team data is unreadable or corrupt on start.** The daemon must still start, the failure must be
  surfaced in the UI, and the most recent snapshot must be recoverable without hand tooling.
- **The same project is open in two clients at once.** Both must see the same history and
  converge — one client's view must not diverge silently.
- **The same project exists on two daemons.** Each has its own independent team. The user must be
  able to tell which daemon's team they are looking at, and one daemon being offline must not
  affect the other's team.
- **The user switches daemon while viewing the Team view.** The view must follow to that daemon's
  team for the project rather than showing stale content from the previous one.

## Requirements *(mandatory)*

### Functional Requirements

#### The Team surface

- **FR-001**: The app MUST provide a Team view as a top-level destination, scoped to the currently
  selected project on the currently connected daemon, containing Chat, Tasks, and Members sections.
- **FR-001a**: A team belongs to one project on one daemon. Where the app shows a project backed by
  more than one daemon, the Team view MUST show the team belonging to the daemon the user is
  currently connected to, and MUST make clear which daemon that is.
- **FR-001b**: Teams on different daemons MUST be independent. Nothing about one daemon's channels,
  tasks, or roster may depend on another daemon being reachable.
- **FR-002**: The Team view MUST show identical content for a project regardless of which workspace
  or worktree the user is currently viewing on that daemon.
- **FR-003**: The Team view MUST be usable on phone, tablet, browser, and desktop form factors,
  adapting layout to available width rather than to platform.
- **FR-004**: Every action in the Team view that can fail MUST show its pending, success, and
  failure state in the UI, keeping an actionable error visible in context until it is retried or
  dismissed.

#### Channels and messages

- **FR-005**: Users MUST be able to create, rename, describe, and delete channels within a project.
- **FR-006**: Users MUST be able to post messages to a channel and to mention members by name.
- **FR-006a**: The user MUST have a single built-in identity in the roster with an editable display
  name, used to attribute their messages and to be mentioned by members escalating a decision.
  This identity is not an account and carries no credentials, roles, or permissions.
- **FR-007**: The system MUST deliver a channel message to every member mentioned in it, and to
  members subscribed to that channel, without human relaying.
- **FR-008**: Channels MUST show new messages as they arrive while the user is viewing, without a
  manual refresh.
- **FR-009**: Channel history MUST load incrementally, so that opening a channel with a large
  history is as fast as opening an empty one.
- **FR-010**: Messages MUST be attributed to their author, ordered consistently, and timestamped.
- **FR-011**: The system MUST render inline references to tasks, channels, and members within
  message text as navigable links.
- **FR-012**: The user MUST be able to see each member's current activity — idle, working, or what
  it is presently doing — from the channel view.
- **FR-013**: Channels, messages, and their history MUST be scoped to a project and MUST survive
  the archival of any workspace and the removal of any worktree.

#### Members

- **FR-014**: Users MUST be able to create a member with a name, a description of what it owns, a
  runtime, and a model.
- **FR-014a**: Each member MUST have its own role prompt, exclusive to it, defining what it is
  responsible for and how it works. The prompt MUST apply to every session that member runs, and
  MUST be editable after creation.
- **FR-014b**: The system MUST ship a set of built-in role templates covering common engineering
  roles. Selecting one MUST pre-fill the member's description and role prompt, and the user MUST be
  able to edit both before and after creating the member.
- **FR-014c**: A member MUST be able to propose a set of roles for the project — names,
  descriptions, and role prompts — which the user reviews, edits, and confirms individually. No
  member may be created without the user confirming it.
- **FR-014d**: Each member MUST have a private, persistent home directory of its own, separate from
  any git workspace, containing at minimum a memory document it maintains itself. Its contents MUST
  survive daemon restarts, workspace archival, and worktree removal, and MUST NOT be part of the
  project's repository.
- **FR-014e**: Members MUST be told the difference between their role prompt and their memory: the
  prompt defines who they are and is owned by the user; the memory records what they have learned
  and is owned by them.
- **FR-014f**: Users MUST be able to browse and read a member's home directory and its memory
  document from that member's detail view.
- **FR-015**: Members MUST persist across daemon restarts with all of their configuration intact.
- **FR-016**: Members MUST exist independently of any single project and MUST be assignable to one
  or more projects.
- **FR-017**: Each member MUST have one home workspace per project it is assigned to, which is
  where its work runs.
- **FR-018**: The system MUST prevent two members in a project from sharing a home workspace, so
  that concurrent members cannot disturb one another's working tree.
- **FR-019**: When a member's home workspace ceases to exist, the system MUST preserve the member,
  mark it as unable to run, and require the user to choose a new workspace before it runs again.
- **FR-019a**: A member's home workspace MUST NOT be archived automatically when its branch merges.
  Members are long-lived and their workspaces are their working home; automatic archival would
  strand a member on every successful merge.
- **FR-019b**: Losing a home workspace MUST NOT affect a member's home directory or memory. Its
  accumulated knowledge survives being re-pointed at a new workspace.
- **FR-020**: Users MUST be able to view a member's roster entry showing its status, description,
  home workspace, project assignments, and the channels it participates in.
- **FR-021**: Users MUST be able to edit, start, stop, and remove a member.
- **FR-022**: Removing a member MUST NOT remove its past messages; history MUST remain readable and
  correctly attributed.

#### Tasks

- **FR-023**: Users MUST be able to create, edit, and delete tasks within a project.
- **FR-024**: Tasks MUST carry a title, description, status, creator, optional assignee, optional
  claimant, optional acceptance criteria, optional dependencies on other tasks, and time-ordered
  notes.
- **FR-024a**: A task MUST have at most one claimant at a time. Claiming an already-claimed task
  MUST fail, and the attempting member MUST be told who holds the claim.
- **FR-024b**: Only the claimant MUST be able to change a task's status, edit it, or add notes to
  it. The user MUST be able to override any claim.
- **FR-024c**: A claimant MUST be able to release its claim, after which any other member MUST be
  able to claim the task. A task therefore MUST be able to pass between members in sequence.
- **FR-024d**: The claimant MUST be visibly distinct from the assignee wherever a task is shown:
  the assignee is who the work is meant for, the claimant is who currently holds it.
- **FR-024e**: When a member stops, is removed, or loses its home workspace, any claim it holds
  MUST be released so the task cannot be stranded.
- **FR-024f**: A task with unmet dependencies MUST NOT be claimable, and the attempting member
  MUST be told which dependencies block it.
- **FR-025**: The Tasks section MUST present a board with Todo, In Progress, In Review, and Done
  columns, and MUST allow moving a task between columns by dragging it.
- **FR-026**: The Tasks section MUST offer a list view of the same tasks, and MUST allow filtering
  by creator and by assignee in both views.
- **FR-027**: Tasks MUST display their unmet dependencies so a blocked task is visibly blocked.
- **FR-028**: Task changes made by a member MUST appear in the user's view without a manual
  refresh, and task changes made by the user MUST be visible to members.
- **FR-029**: Tasks MUST be scoped to a project and MUST survive workspace archival and worktree
  removal.
- **FR-030**: When a task's assignee is removed, the task MUST remain and become visibly
  unassigned.

#### What agents can do autonomously

- **FR-031**: A running member MUST be able to read a channel's recent history and post to it.
- **FR-032**: A member MUST receive messages and mentions directed at it, including when it has no
  running session at that moment. Members MUST NOT be required to hold a session open, or to poll,
  in order to remain reachable.
- **FR-033**: A running member MUST be able to list and read tasks in its project, create tasks,
  claim and release them, and — while holding the claim — change status, add notes, and reassign.
- **FR-034**: A member MUST be restricted to the channels and tasks of projects it is assigned to.
- **FR-035**: A member MUST be able to identify itself and discover the other members of its
  project, so it can address handoffs by name.
- **FR-035a**: When a member is mentioned and has no running session, the system MUST start one
  and deliver the mention to it, without human action.
- **FR-035b**: Members MUST be able to continue working autonomously without limit for as long as
  they are making progress. Progress is a recorded change to project work: a task claimed,
  released, moved between statuses, annotated with a note, or an acceptance criterion satisfied.
- **FR-035c**: Each task MUST count the number of times it has been handed back — moved backward
  from a review status, or failed against its acceptance criteria. The count MUST be visible on the
  task, and MUST reset when the task is accepted.
- **FR-035d**: Each project MUST have a configurable maximum number of handbacks per task. On
  reaching it, work on that task MUST stop and the situation MUST be escalated to the user: the
  user is mentioned in the channel where the work was happening, the task is marked as needing
  their attention, and the reason and history of attempts are readable without hunting.
- **FR-035d1**: Each task MUST additionally carry a configurable maximum wall-clock time for a
  single attempt. A member that exceeds it without completing the attempt MUST be stopped and the
  task escalated to the user in the same way as a handback limit, so that a member wedged inside
  one attempt cannot stall indefinitely.
- **FR-035e**: Escalation MUST be scoped to the task that failed. Other members and other tasks in
  the project MUST continue working.
- **FR-035e1**: Escalation MUST actively notify the user through the app's existing notification
  path, not only by changing state in a view the user may not be looking at.
- **FR-035f**: Each project MUST additionally have a configurable maximum number of consecutive
  automatic turns that produce no progress, as a backstop against members conversing without
  accomplishing anything. Any progress event or any message from the user MUST reset this count.
  On reaching it, members MUST stop and the user MUST be told.
- **FR-035g**: Where members have stopped — whether by escalation or by the no-progress backstop —
  the user MUST be able to resume with one action, which resets the relevant count, or leave it
  stopped. Members MUST NOT resume on their own.
- **FR-035h**: The user MUST be able to stop all activity in a project at any time from the Team
  view, without waiting for any limit.
- **FR-035i**: The user MUST be able to see which sessions were started automatically rather than
  by them, so that usage is attributable.

#### Durability

- **FR-036**: Channels created before this feature MUST be adopted into a project on first start
  after upgrade, with their message history preserved.
- **FR-037**: Team data MUST be stored outside the project's repository, never reaching version
  control, and MUST be identical across all worktrees of a project.
- **FR-038**: An acknowledged message or task change MUST survive an unclean shutdown.
- **FR-039**: The system MUST take a consistent snapshot of each project's team data on daemon
  start and every 24 hours thereafter, without interrupting running members, retaining the three
  most recent snapshots per project.
- **FR-040**: Each project MUST support a configurable message retention cap; history beyond it is
  pruned, and the fact that pruning occurred MUST be discoverable by the user.
- **FR-041**: Deleting a project MUST remove that project's team data and MUST NOT affect any
  other project's data.
- **FR-042**: If team data cannot be read at start, the daemon MUST still start, MUST surface the
  failure in the UI, and MUST allow recovery from the most recent snapshot without hand tooling.
- **FR-043**: An app version predating this feature MUST continue to work against a daemon
  containing it, and an app containing it MUST tell the user to update the host when connected to
  a daemon that lacks it, rather than presenting a degraded Team view.

### Key Entities

- **Member** — A persistent agent identity: name, description of what it owns, runtime, model, role
  prompt, and status. Exists at the daemon level and is assigned to one or more projects. Distinct
  from an **Agent session**, which is one running instance of work; a member may have many sessions
  over its life, or none right now.
- **Role prompt** — The instructions exclusive to one member, defining what it is responsible for.
  Owned by the user, seeded from a template or a proposal, editable at any time, applied to every
  session that member runs.
- **Member home directory** — A member's own private, persistent directory, holding its memory
  document, notes, and artifacts. Not a git workspace and not part of the repository. This is how a
  member accumulates expertise across restarts. Distinct from **Home workspace**, which is the git
  worktree it does code work in — that one can be merged, rebased, and removed; this one cannot.
- **Role template** — A built-in starting point for a member: a description and a role prompt for a
  common engineering role. Only a seed; once a member is created its prompt is its own.
- **Project assignment** — The link between a member and a project, carrying that member's home
  workspace for that project.
- **Channel** — A named, project-scoped conversation with an optional description. Holds messages.
- **Message** — One post in a channel: author, body, timestamp, the members it mentions, and any
  task it references. Immutable once posted.
- **Task** — A project-scoped unit of tracked work: title, description, status, creator, assignee,
  claimant, acceptance criteria, dependencies, notes, and its handback count. Distinct from an
  **Agent session** — the glossary currently forbids "Task" as a synonym for that, and both terms
  must be disambiguated there.
- **Handback** — One rejection of a task: moved backward from a review status, or failed against
  its acceptance criteria. Counted per task, reset on acceptance. Reaching the configured limit
  escalates that task to the user.
- **Progress** — A recorded change to project work: a task claimed, released, moved between
  statuses, annotated, or an acceptance criterion satisfied. Members run without limit while
  progress continues; its absence is what the backstop measures.
- **Claim** — An exclusive, releasable hold by one member on one task. Whoever holds it is the only
  member that may change the task. Distinct from **assignee**, which is intent rather than
  possession: a task may be assigned to one member and claimed by none, or by another.
- **Note** — A timestamped entry recorded against a task by a member or the user.
- **Snapshot** — A point-in-time consistent copy of one project's team data, taken automatically
  and retained in a bounded set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from an empty project to two members holding a working
  agent-to-agent conversation in under 5 minutes, without using a terminal.
- **SC-002**: For a task requiring two specialists, the human sends one message and reviews the
  result — the number of human messages needed to relay between agents is zero.
- **SC-003**: Opening a channel with 50,000 messages shows the most recent messages as fast as
  opening an empty channel, within one second on a mid-range phone.
- **SC-004**: A message posted by one member appears in another client's open view of that channel
  within two seconds.
- **SC-005**: 100% of members, their descriptions, project assignments, and home workspaces survive
  a daemon restart.
- **SC-006**: 100% of acknowledged messages and task changes survive an unclean shutdown.
- **SC-007**: After a merge removes a worktree, 100% of the project's channels, history, and tasks
  remain accessible, and affected members remain listed and recoverable.
- **SC-007a**: With a project backed by two daemons, a user can always tell which daemon's team
  they are viewing, and taking one daemon offline leaves the other's team fully usable.
- **SC-008**: Every existing channel and message from before the upgrade is present after it —
  zero data loss on adoption.
- **SC-009**: A user can restore a project's team data from an automatic snapshot without editing
  files by hand or using a terminal.
- **SC-010**: The Team view is fully operable on a phone-width screen — every action available on
  desktop can be completed, including moving a task between columns.
- **SC-011**: A user can tell, at a glance in the channel view, which members are working and which
  are idle, without opening any member's detail.
- **SC-011a**: A user can create a staffed team for a new project — several members with distinct
  roles — without writing a single role prompt from scratch, using templates or a member's
  proposal.
- **SC-011b**: A member's memory and home directory survive 100% of daemon restarts, workspace
  archivals, worktree removals, and home-workspace changes.
- **SC-011c**: With automatic archive-on-merge enabled, a member's home workspace survives its
  branch being merged — zero members are stranded by a successful merge.
- **SC-012**: When several members contend for one task, exactly one holds it — duplicated work on
  a claimed task occurs zero times.
- **SC-013**: No task remains claimed by a member that has stopped; claims are released within one
  view refresh of the member stopping.
- **SC-014**: A user can stop all automatically started activity in a project with one action, and
  can attribute every running session to either themselves or a specific mention.
- **SC-015**: A converging review loop between two members completes without human intervention
  regardless of how many rounds it takes — zero productive loops are interrupted by a limit.
- **SC-016**: A non-converging task escalates to the user after the configured number of
  handbacks, and the user can see every attempt and why each failed without leaving the task.
- **SC-017**: Left entirely unattended, members exchanging messages without recording progress
  always stop on their own, and a member wedged inside a single attempt is always stopped by the
  wall-clock limit.
- **SC-017a**: Every escalation reaches the user through a notification, whether or not the app is
  open on the Team view — zero escalations are discoverable only by looking.
- **SC-018**: A user returning to a stopped project can see why it stopped and resume in one
  action, without restarting members individually.

## Clarifications

### Resolved: mentions wake idle members (2026-07-27)

A mention delivered to a member with no running session starts one automatically. Members are
continuously reachable, and a handoff to an idle member completes without the user noticing it was
idle.

This spends model usage without an explicit human instruction, so it needs a bound — but the bound
must not be a cap on turns. A QA member repeatedly rejecting a build and handing it back to an
engineer until it passes is the behaviour this feature exists to enable. A turn cap would terminate
that mid-flight, and would not distinguish it from two members chatting to no effect.

**Members run unbounded while they are making progress.** Progress is a recorded change to project
work: a task claimed, released, moved between statuses, annotated, or an acceptance criterion
satisfied. Conversation that moves work forward is never interrupted.

Two things stop them:

1. **Repeated failure on one task.** Every task counts how many times it has been handed back —
   moved backward from review, or failed against its acceptance criteria. On reaching a configurable
   limit, work on *that task* stops and the user is escalated to by name in the channel where it was
   happening, with the history of attempts readable. This is the QA loop that is not converging, and
   it is the case worth a human's attention. Other tasks and members carry on (FR-035c to FR-035e).

2. **Turns that produce nothing.** A separate, higher limit on consecutive automatic turns with no
   progress event at all. Any progress, or any message from the user, resets it. This exists only to
   catch members talking without accomplishing anything (FR-035f).

In both cases members stop and wait; they never resume themselves. The user resumes with one action
or leaves it stopped, can stop everything at any time without waiting for a limit, and can see which
sessions were started automatically rather than by them (FR-035g to FR-035i).

### Resolved: the board records work, and a claim is a lock (2026-07-27)

The board does not dispatch work — work is started by talking to members. But a task is not a
passive note either: a member **claims** a task to work on it, and the claim is exclusive.

- At most one member holds a task at a time. A second member attempting to claim it is refused and
  told who holds it.
- Only the claimant may move, edit, or annotate the task. The user can always override.
- The claimant releases the task when its part is finished, and the task becomes claimable again.

A task therefore passes between members in sequence rather than being worked by several at once.
A feature needing backend and frontend work is claimed by the backend member first; the frontend
member cannot claim it until that claim is released. Claims are released automatically if a member
stops, is removed, or loses its home workspace, so a task cannot be stranded by a dead claimant
(FR-024a to FR-024f).

This also settles the concurrent-update edge case: simultaneous writes are prevented rather than
reconciled.

### Resolved: the user is a built-in identity (2026-07-27)

The user appears in the roster as a single built-in identity with an editable display name. It
attributes their messages and gives members a stable name to mention when escalating a decision.
It is not an account: no credentials, no roles, no permissions (FR-006a).

## Assumptions

- **Single-user throughout.** No authentication, roles, permissions, invites, or billing. The
  constitution fixes this; the walkthrough's owner/admin/member hierarchy is explicitly excluded.
- **Project is the unit of "team".** One project's channels, tasks, and roster are its own.
  Cross-project channels and a server-wide board across unrelated repositories are out of scope.
- **Excluded from the walkthrough**: the relationship graph, the app marketplace, plan and billing,
  joint channels, threaded replies, saved and pinned messages, and file uploads to channels.
  Threads and file attachments are plausible follow-ups but are not required for the team to work.
- **A team is per project, per daemon.** The app's project model aggregates across daemons — a
  project backed by the same git remote on two machines appears as one project with two host
  entries. Teams do not aggregate that way: each daemon holds its own team for that project, and
  the Team view shows the connected daemon's. This mirrors the walkthrough, where agents are
  grouped under the computer they run on, and it is honest about the underlying constraint —
  members on different machines cannot share a working tree, claim the same task safely, or
  order messages together.
- **Members run on the local daemon.** Distributing members across multiple daemons is out of
  scope; the existing host and Hub relationships are unchanged.
- **No control plane. This is a deliberate simplification with a known ceiling.** The reference
  product puts a control server between the client and the machines running agents, so one project
  can hold members across several computers. Here the daemon is the whole team boundary: the client
  talks to one daemon, and that daemon owns its team's data and members. The ceiling is that a
  project's members cannot span machines.
  The upgrade path, if that becomes worth having, is the existing Hub relationship
  (`docs/hub.md`) — a daemon already enrolls with a Hub and accepts `hub.execution.*` requests,
  which is the same shape as a control server dispatching to computers. Reaching cross-machine
  teams from there needs three things this feature deliberately does not build: more than one Hub
  relationship per daemon, a shared data plane for channels and tasks (today a Hub connection sees
  only its own daemon's agents), and distributed claim locking. Nothing in this feature should
  foreclose that, and nothing in it should anticipate it.
- **Relay independence is a separate feature.** This fork must stop defaulting to getpaseo's hosted
  relay and app URLs, but that work is unrelated to the team surface: team data is daemon-local and
  the Team view works over the relay unchanged. It is specified and planned on its own.
- **Members use the existing agent runtimes and provider configuration.** This feature adds no new
  provider, model, or authentication surface.
- **Notifications reuse existing mechanisms.** Mention and assignment notifications use the app's
  current notification path rather than introducing a new one; a dedicated activity inbox as seen
  in the walkthrough is out of scope for this feature.
- **Agent capability is unchanged.** Members can already read code, run commands, and edit files
  through their runtime. This feature adds coordination, not new agent powers.
- **Existing chat and task code is a foundation, not a constraint.** The current daemon-global
  channel storage and the unused task store are reshaped as needed, provided existing data is
  adopted rather than discarded.
- **This is a fork that must keep merging upstream.** Team functionality is built in fork-owned
  directories. Upstream files are touched only at one-line seams — a registration, a route, a
  capability flag — with all logic in fork-owned files, and every such file is recorded in
  `docs/fork.md`. This constrains implementation, not behaviour: nothing the user sees changes
  because of it.
- **Upstream's chat and loop services are reused in place, not reshaped.** The daemon's existing
  loop service already implements iteration limits, wall-clock limits, worker/verifier rounds,
  shell-command and prompt-based verification, cooperative stop, and recovery across restarts —
  and its guard semantics are what task review cycles need. The existing chat service already
  stores rooms and messages for the `paseo chat` CLI. Both are actively developed upstream, so this
  feature builds its own project-scoped storage and loop control alongside them rather than
  rewriting them. Old rooms are imported once (FR-036); both upstream services keep working
  unchanged for their existing consumers.

## Dependencies

- The existing project and workspace model provides stable project identifiers and workspace
  lifecycle events, including notification when a workspace is archived or a worktree removed.
- The app's existing route structure owns where the Team view mounts. `docs/expo-router.md` governs
  it: layouts register only their direct children, and the Team view is a host-level leaf. Getting
  this wrong fails silently with a blank screen on native rather than raising an error.
- The existing agent runtime provides member sessions, status reporting, and activity signals.
- The existing daemon capability-reporting mechanism carries the flag that lets the app decide
  whether to present the Team view (FR-043).
- The existing loop service provides the iteration and wall-clock guards, verification rounds, and
  crash recovery that task review cycles depend on. Extending it must not regress loops created
  outside the Team view.
- The existing notification path delivers escalations to the user when the app is not open on the
  Team view (FR-035e1).
