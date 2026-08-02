import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FileBackedChatService } from "../chat/chat-service.js";
import { adoptLegacyChatIntoProject } from "./adoption.js";
import { createTeamDatabaseManager } from "./storage/database.js";
import { createProjectStore } from "./storage/project-store.js";

describe("legacy chat adoption", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  test("imports rooms and messages into the chosen project and skips re-import after marking adoption", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "team-adoption-test-"));
    cleanupPaths.push(paseoHome);
    const legacyChatDir = join(paseoHome, "chat");
    await mkdir(legacyChatDir, { recursive: true });
    const roomsPath = join(legacyChatDir, "rooms.json");
    const fixture = {
      rooms: [
        {
          id: "room-build",
          name: "build",
          purpose: "Build coordination",
          createdAt: "2026-07-27T12:00:00.000Z",
          updatedAt: "2026-07-27T12:02:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-1",
          roomId: "room-build",
          authorAgentId: "agent-impl",
          body: "Implemented the build fix",
          replyToMessageId: null,
          mentionAgentIds: ["agent-qa"],
          createdAt: "2026-07-27T12:01:00.000Z",
        },
        {
          id: "message-2",
          roomId: "room-build",
          authorAgentId: "agent-qa",
          body: "Verified the build fix",
          replyToMessageId: "message-1",
          mentionAgentIds: [],
          createdAt: "2026-07-27T12:02:00.000Z",
        },
      ],
    };
    await writeFile(roomsPath, JSON.stringify(fixture, null, 2));

    const first = await adoptLegacyChatIntoProject({
      paseoHome,
      projectId: "project-1",
    });
    expect(first).toMatchObject({
      importedRoomCount: 1,
      importedMessageCount: 2,
      adopted: true,
    });

    const dbManager = createTeamDatabaseManager({ teamDir: join(paseoHome, "team") });
    const store = createProjectStore(dbManager.openProject("project-1"));
    expect(store.listChannels()).toEqual([
      expect.objectContaining({
        id: "room-build",
        name: "build",
        purpose: "Build coordination",
      }),
    ]);
    expect(
      store.listMessages({ channelId: "room-build", limit: 10, cursor: null }).messages,
    ).toEqual([
      expect.objectContaining({
        id: "message-2",
        authorMemberId: "agent-qa",
        replyToMessageId: "message-1",
      }),
      expect.objectContaining({
        id: "message-1",
        authorMemberId: "agent-impl",
      }),
    ]);
    expect(store.listMessageMentionMemberIds("message-1")).toEqual(["agent-qa"]);
    dbManager.closeAll();

    const legacyRoomsAfterImport = await readFile(roomsPath, "utf8");
    expect(JSON.parse(legacyRoomsAfterImport)).toEqual(fixture);

    const second = await adoptLegacyChatIntoProject({
      paseoHome,
      projectId: "project-2",
    });
    expect(second).toEqual({
      adopted: false,
      importedRoomCount: 0,
      importedMessageCount: 0,
      projectId: "project-1",
    });
  });

  test("legacy chat rooms still list and read unchanged after adoption", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "team-adoption-chat-test-"));
    cleanupPaths.push(paseoHome);
    const legacyChatDir = join(paseoHome, "chat");
    await mkdir(legacyChatDir, { recursive: true });
    await writeFile(
      join(legacyChatDir, "rooms.json"),
      JSON.stringify(
        {
          rooms: [
            {
              id: "room-build",
              name: "build",
              purpose: "Build coordination",
              createdAt: "2026-07-27T12:00:00.000Z",
              updatedAt: "2026-07-27T12:02:00.000Z",
            },
          ],
          messages: [
            {
              id: "message-1",
              roomId: "room-build",
              authorAgentId: "agent-impl",
              body: "Implemented the build fix",
              replyToMessageId: null,
              mentionAgentIds: [],
              createdAt: "2026-07-27T12:01:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    await adoptLegacyChatIntoProject({ paseoHome, projectId: "project-1" });

    const chatService = new FileBackedChatService({
      paseoHome,
      logger: createLoggerStub(),
    });
    await chatService.initialize();

    await expect(chatService.listRooms()).resolves.toEqual([
      expect.objectContaining({
        id: "room-build",
        name: "build",
        messageCount: 1,
      }),
    ]);
    await expect(chatService.readMessages({ room: "build", limit: 20 })).resolves.toEqual([
      expect.objectContaining({
        id: "message-1",
        authorAgentId: "agent-impl",
        body: "Implemented the build fix",
      }),
    ]);
  });
});

function createLoggerStub() {
  return {
    child() {
      return this;
    },
    error() {},
  };
}
