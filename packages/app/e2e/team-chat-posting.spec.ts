import type { Page } from "@playwright/test";
import { buildHostTeamRoute } from "@/utils/host-routes";
import { expect, test } from "./fixtures";
import { daemonWsRoutePattern } from "./helpers/daemon-port";
import { getServerId } from "./helpers/server-id";

type WebSocketMessage = string | Buffer;
type RoutedWebSocket = Parameters<Parameters<Page["routeWebSocket"]>[1]>[0];

interface TeamChannelFixture {
  id: string;
  name: string;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface TeamMemberFixture {
  id: string;
  name: string;
  description: string | null;
  provider: "codex";
  model: string | null;
  kind: "agent";
  status: "idle" | "running";
  createdAt: string;
  archivedAt: string | null;
}

interface TeamMessageFixture {
  id: string;
  channelId: string;
  authorMemberId: string;
  body: string;
  replyToMessageId: string | null;
  mentionMemberIds?: string[];
  createdAt: string;
}

function parseJson(message: WebSocketMessage): unknown {
  const raw = typeof message === "string" ? message : message.toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getSessionMessage(message: WebSocketMessage): Record<string, unknown> | null {
  const envelope = parseJson(message);
  if (!envelope || typeof envelope !== "object") {
    return null;
  }
  const maybeEnvelope = envelope as { type?: unknown; message?: unknown };
  if (maybeEnvelope.type !== "session" || !maybeEnvelope.message) {
    return null;
  }
  if (typeof maybeEnvelope.message !== "object") {
    return null;
  }
  return maybeEnvelope.message as Record<string, unknown>;
}

function withTeamFeature(message: WebSocketMessage): string | null {
  const envelope = parseJson(message);
  if (!envelope || typeof envelope !== "object") {
    return null;
  }
  const maybeEnvelope = envelope as {
    type?: unknown;
    message?: {
      type?: unknown;
      payload?: Record<string, unknown>;
    };
  };
  const payload = maybeEnvelope.message?.payload;
  if (
    maybeEnvelope.type !== "session" ||
    maybeEnvelope.message?.type !== "status" ||
    payload?.status !== "server_info"
  ) {
    return null;
  }
  return JSON.stringify({
    ...maybeEnvelope,
    message: {
      ...maybeEnvelope.message,
      payload: {
        ...payload,
        features: {
          ...(typeof payload.features === "object" && payload.features !== null
            ? payload.features
            : {}),
          team: true,
        },
      },
    },
  });
}

async function installTeamChatFixture(page: Page) {
  const channel: TeamChannelFixture = {
    id: "channel-general",
    name: "general",
    purpose: "Coordinate work",
    createdAt: "2026-07-27T12:00:00.000Z",
    updatedAt: "2026-07-27T12:00:00.000Z",
    archivedAt: null,
  };
  const members: TeamMemberFixture[] = [
    {
      id: "member-alice",
      name: "Alice",
      description: "Planning",
      provider: "codex",
      model: "gpt-5.4-mini",
      kind: "agent",
      status: "running",
      createdAt: "2026-07-27T12:00:00.000Z",
      archivedAt: null,
    },
    {
      id: "member-bob",
      name: "Bob",
      description: "Implementation",
      provider: "codex",
      model: "gpt-5.4-mini",
      kind: "agent",
      status: "idle",
      createdAt: "2026-07-27T12:01:00.000Z",
      archivedAt: null,
    },
  ];
  const messages: TeamMessageFixture[] = [
    {
      id: "message-0",
      channelId: channel.id,
      authorMemberId: members[0]?.id ?? "member-alice",
      body: "Initial planning note",
      replyToMessageId: null,
      createdAt: "2026-07-27T12:02:00.000Z",
    },
  ];
  let postAttempts = 0;

  await page.routeWebSocket(daemonWsRoutePattern(), (ws: RoutedWebSocket) => {
    const server = ws.connectToServer();

    ws.onMessage((message: WebSocketMessage) => {
      const sessionMessage = getSessionMessage(message);
      const requestType = sessionMessage?.type;
      const requestId =
        typeof sessionMessage?.requestId === "string" ? sessionMessage.requestId : null;
      const projectId =
        typeof sessionMessage?.projectId === "string" ? sessionMessage.projectId : null;

      if (!requestType || !requestId || !projectId) {
        server.send(message);
        return;
      }

      if (requestType === "team.channel.list.request") {
        ws.send(
          JSON.stringify({
            type: "session",
            message: {
              type: "team.channel.list.response",
              payload: {
                requestId,
                error: null,
                channels: [channel],
              },
            },
          }),
        );
        return;
      }

      if (requestType === "team.member.list.request") {
        ws.send(
          JSON.stringify({
            type: "session",
            message: {
              type: "team.member.list.response",
              payload: {
                requestId,
                error: null,
                members,
              },
            },
          }),
        );
        return;
      }

      if (requestType === "team.message.list.request") {
        ws.send(
          JSON.stringify({
            type: "session",
            message: {
              type: "team.message.list.response",
              payload: {
                requestId,
                error: null,
                messages,
                nextCursor: null,
              },
            },
          }),
        );
        return;
      }

      if (requestType === "team.message.post.request") {
        const body = typeof sessionMessage.body === "string" ? sessionMessage.body : "";
        postAttempts += 1;
        if (postAttempts === 2) {
          ws.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "team.message.post.response",
                payload: {
                  requestId,
                  error: "Post failed. Retry the message.",
                  message: null,
                },
              },
            }),
          );
          return;
        }

        const nextMessage: TeamMessageFixture = {
          id: `message-${postAttempts}`,
          channelId: channel.id,
          authorMemberId: members[1]?.id ?? "member-bob",
          body,
          replyToMessageId: null,
          createdAt: `2026-07-27T12:0${postAttempts + 2}:00.000Z`,
        };
        messages.push(nextMessage);
        ws.send(
          JSON.stringify({
            type: "session",
            message: {
              type: "team.message.post.response",
              payload: {
                requestId,
                error: null,
                message: nextMessage,
              },
            },
          }),
        );
        ws.send(
          JSON.stringify({
            type: "session",
            message: {
              type: "team.message.posted",
              payload: {
                projectId,
                message: nextMessage,
              },
            },
          }),
        );
        return;
      }

      server.send(message);
    });

    server.onMessage((message: WebSocketMessage) => {
      const serverInfo = typeof message === "string" ? withTeamFeature(message) : null;
      ws.send(serverInfo ?? message);
    });
  });
}

test.describe("Team chat posting", () => {
  test.describe.configure({ timeout: 240_000 });

  test("shows post success and keeps a failed post actionable until retry", async ({
    page,
    withWorkspace,
  }) => {
    const workspace = await withWorkspace({ prefix: "team-chat-posting-" });
    const serverId = getServerId();

    await installTeamChatFixture(page);
    await workspace.navigateTo();
    await page.goto(buildHostTeamRoute(serverId, "chat"));

    await expect(page.getByTestId("team-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("team-project-picker-trigger")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("team-channel-channel-general")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Initial planning note", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const composer = page.getByTestId("team-message-composer-input");
    const sendButton = page.getByTestId("team-message-composer-send");

    await composer.fill("First team message");
    await sendButton.click();
    await expect(page.getByText("Sent", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("First team message", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await composer.fill("Second team message");
    await sendButton.click();
    const errorCard = page.getByTestId("team-message-post-error");
    await expect(errorCard).toBeVisible({ timeout: 30_000 });
    await expect(errorCard).toContainText("Post failed. Retry the message.");
    await expect(errorCard.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(errorCard.getByRole("button", { name: "Dismiss" })).toBeVisible();
    await expect(composer).toHaveValue("Second team message");

    await errorCard.getByRole("button", { name: "Retry" }).click();
    await expect(errorCard).toHaveCount(0);
    await expect(page.getByText("Second team message", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
});
