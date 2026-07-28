/**
 * T101 / SC-012 live check — can real members actually drive the task board?
 *
 * `claims.test.ts` and `review-cycle.test.ts` cover exclusivity, the converging loop, and
 * escalation thoroughly — but they drive `TeamService` directly. That is exactly the shape of
 * coverage that stayed green while members were starting with no `team_*` tools at all.
 *
 * T056 proved `team_post` reaches a live runtime. It says nothing about `team_tasks` and
 * `team_task_update`, which are the other half of the feature and share the same plumbing. This
 * closes that gap: a real member has to find the task, claim it, work it, and move it — through
 * MCP, with nothing driving the service on its behalf.
 *
 *   npx tsx packages/server/src/server/team/t101-live-check.ts
 *
 * Environment:
 *   T101_IMPL_PROVIDER   default codex/gpt-5.3-codex-spark
 *   T101_QA_PROVIDER     default claude/sonnet
 *   T101_TIMEOUT_MS      default 600000
 *   T101_KEEP            keep the temp dirs for inspection
 */
import type { LiveVerdict } from "./live-check-harness.js";
import { reportVerdict, startLiveTeam } from "./live-check-harness.js";

const IMPL_PROVIDER = process.env.T101_IMPL_PROVIDER ?? "codex/gpt-5.3-codex-spark";
const QA_PROVIDER = process.env.T101_QA_PROVIDER ?? "claude/sonnet";
const TIMEOUT_MS = Number(process.env.T101_TIMEOUT_MS ?? 600_000);

const CALC = "function add(a, b) {\n  return a + b;\n}\n\nmodule.exports = { add };\n";

async function main(): Promise<void> {
  const team = await startLiveTeam({
    prefix: "t101",
    channelName: "build",
    files: { "calc.js": CALC },
    keep: Boolean(process.env.T101_KEEP),
    members: [
      {
        name: "impl",
        description: "Implements changes",
        spec: IMPL_PROVIDER,
        rolePrompt:
          "You are impl. Work is tracked on the team task board. Before you start, claim the task " +
          "with team_task_update so nobody else takes it — a claim is an exclusive lock. Do the " +
          "work, then move the task to in_review and hand it to @qa in the channel. Do not verify " +
          "your own work and do not mark it done yourself.",
      },
      {
        name: "qa",
        description: "Verifies changes",
        spec: QA_PROVIDER,
        rolePrompt:
          "You are qa. You verify changes @impl makes by reading and running them. When a task is " +
          "in review, claim it, check it against its acceptance criteria, and then either move it " +
          "to done or hand it back to @impl. Post the verdict in the channel. Never implement the " +
          "change yourself.",
      },
    ],
  });

  console.log(`repo: ${team.repo}\nimpl: ${IMPL_PROVIDER}\nqa:   ${QA_PROVIDER}\n`);

  try {
    const task = team.teamService.createTask({
      projectId: team.projectId,
      title: "Add subtract(a, b) to calc.js",
      body: "calc.js currently exports only add. Add subtract and export it alongside.",
      creatorMemberId: team.human.id,
      acceptanceCriteria: [
        { position: 0, text: "calc.js defines subtract(a, b) returning a - b", satisfiedAt: null },
        { position: 1, text: "calc.js exports subtract alongside add", satisfiedAt: null },
      ],
    });
    console.log(`created task ${task.seq}: ${task.title}\n`);

    // The task is never named by id. A member that cannot list the board cannot find it, which is
    // the point — this exercises team_tasks, not a hardcoded lookup.
    await team.post("@impl there is a task on the board. Claim it and take it through review.");

    const impl = team.members.impl;
    const qa = team.members.qa;
    if (!impl || !qa) {
      throw new Error("expected impl and qa members");
    }

    // Claim history is not persisted as an event log, so watch the live task and remember what we
    // observed: a claim that has already been released is still evidence the tool was callable.
    const observed = {
      implClaimed: false,
      qaClaimed: false,
      leftTodo: false,
      reachedReview: false,
    };

    const evaluate = (): LiveVerdict => {
      const current = team.teamService.getTask(team.projectId, task.id);
      observed.implClaimed ||= current?.claimantMemberId === impl.id;
      observed.qaClaimed ||= current?.claimantMemberId === qa.id;
      observed.leftTodo ||= current?.status !== "todo";
      observed.reachedReview ||= current?.status === "in_review" || current?.status === "done";

      const messages = team.teamService.listMessages({
        projectId: team.projectId,
        channelId: team.channel.id,
        limit: 500,
      }).messages;
      const implHandoff = messages.some(
        (m) => m.authorMemberId === impl.id && (m.mentionMemberIds ?? []).includes(qa.id),
      );
      const qaPosted = messages.some((m) => m.authorMemberId === qa.id);

      const checks = [
        // The discriminating one: a member reached team_task_update through MCP and it worked.
        { label: "impl claimed the task via team_task_update", ok: observed.implClaimed },
        { label: "the task left todo", ok: observed.leftTodo },
        { label: "the task reached in_review or done", ok: observed.reachedReview },
        { label: "impl handed off to qa in the channel", ok: implHandoff },
        { label: "qa engaged (posted, or claimed the task)", ok: qaPosted || observed.qaClaimed },
      ];

      return {
        pass: checks.every((check) => check.ok),
        checks,
        detail:
          `task status=${current?.status} claimant=` +
          `${current?.claimantMemberId ? (team.teamService.getMemberDisplayName(current.claimantMemberId) ?? "?") : "none"} ` +
          `handbacks=${current?.handbackCount ?? 0} escalated=${current?.escalatedAt ? "yes" : "no"}`,
      };
    };

    const verdict = await team.watch(evaluate, TIMEOUT_MS);
    if (!reportVerdict("T101", verdict)) {
      process.exitCode = 1;
    }
  } finally {
    await team.stop();
  }
}

await main().catch((error: unknown) => {
  console.error("\nT101: ERROR");
  console.error(error);
  process.exitCode = 1;
});
