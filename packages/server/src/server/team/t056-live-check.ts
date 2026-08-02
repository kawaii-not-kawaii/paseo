/**
 * T056 / SC-002 live check — the MVP thesis, run against real models.
 *
 *   Two members. One human message. A multi-turn agent-to-agent exchange happens in the channel,
 *   and work gets done, without the human relaying anything.
 *
 * Everything else in the team test suite stops at a service boundary or a fake provider. This is
 * the only thing that answers "will two real models actually talk to each other", and it answers it
 * as a boolean rather than a chat log somebody reads and feels good about.
 *
 *   npx tsx packages/server/src/server/team/t056-live-check.ts
 *
 * Environment:
 *   T056_IMPL_PROVIDER   default codex/gpt-5.3-codex-spark
 *   T056_QA_PROVIDER     default claude/sonnet
 *   T056_TIMEOUT_MS      default 600000
 *   T056_KEEP            keep the temp dirs for inspection
 */
import type { LiveVerdict } from "./live-check-harness.js";
import { reportVerdict, startLiveTeam } from "./live-check-harness.js";

const IMPL_PROVIDER = process.env.T056_IMPL_PROVIDER ?? "codex/gpt-5.3-codex-spark";
const QA_PROVIDER = process.env.T056_QA_PROVIDER ?? "claude/sonnet";
const TIMEOUT_MS = Number(process.env.T056_TIMEOUT_MS ?? 600_000);

const CALC = "function add(a, b) {\n  return a + b;\n}\n\nmodule.exports = { add };\n";

// Mentions ONLY @impl. If the human names @qa too, the daemon starts both from that one message and
// impl's handoff never has to start anything — the human did the routing, which is the thing SC-002
// says should not be necessary. impl learns to involve qa from its role prompt, not from the human.
const HUMAN_MESSAGE = "@impl please add a subtract(a, b) function to calc.js.";

async function main(): Promise<void> {
  const team = await startLiveTeam({
    prefix: "t056",
    channelName: "build",
    files: { "calc.js": CALC },
    keep: Boolean(process.env.T056_KEEP),
    members: [
      {
        name: "impl",
        description: "Implements changes",
        spec: IMPL_PROVIDER,
        rolePrompt:
          "You are impl. You implement code changes in this repository. When your change is done, " +
          "hand it to @qa in the channel for verification. Do not verify your own work.",
      },
      {
        name: "qa",
        description: "Verifies changes",
        spec: QA_PROVIDER,
        rolePrompt:
          "You are qa. You verify changes that @impl makes, by reading and running them. Post the " +
          "verdict in the channel. Do not implement the change yourself.",
      },
    ],
  });

  console.log(`repo: ${team.repo}\nimpl: ${IMPL_PROVIDER}\nqa:   ${QA_PROVIDER}\n`);

  try {
    await team.post(HUMAN_MESSAGE);

    const impl = team.members.impl;
    const qa = team.members.qa;
    if (!impl || !qa) {
      throw new Error("expected impl and qa members");
    }

    const evaluate = (): LiveVerdict => {
      const messages = team.teamService.listMessages({
        projectId: team.projectId,
        channelId: team.channel.id,
        limit: 500,
      }).messages;

      const humanMessages = messages.filter((m) => m.authorMemberId === team.human.id);
      const agentAuthors = new Set(
        messages.filter((m) => m.authorMemberId !== team.human.id).map((m) => m.authorMemberId),
      );
      const implHandoff = messages.some(
        (m) => m.authorMemberId === impl.id && (m.mentionMemberIds ?? []).includes(qa.id),
      );
      const qaPosted = messages.some((m) => m.authorMemberId === qa.id);
      const qaStartedByAgent =
        implHandoff && !(humanMessages[0]?.mentionMemberIds ?? []).includes(qa.id);

      const checks = [
        { label: "exactly one human message (no relaying)", ok: humanMessages.length === 1 },
        { label: "at least two distinct agent authors", ok: agentAuthors.size >= 2 },
        { label: "impl posted a message mentioning qa", ok: implHandoff },
        { label: "qa posted in the channel", ok: qaPosted },
        // The point of the whole feature: qa was brought in by impl, not by the human.
        { label: "qa was started by a mention, not by the human", ok: qaStartedByAgent },
      ];

      return {
        pass: checks.every((check) => check.ok),
        checks,
        detail: `messages: ${messages.length} (human ${humanMessages.length}, agents ${agentAuthors.size})`,
      };
    };

    const verdict = await team.watch(evaluate, TIMEOUT_MS);
    if (!reportVerdict("T056", verdict)) {
      process.exitCode = 1;
    }
  } finally {
    await team.stop();
  }
}

await main().catch((error: unknown) => {
  console.error("\nT056: ERROR");
  console.error(error);
  process.exitCode = 1;
});
