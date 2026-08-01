import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ChatMessageSchema, ChatRoomSchema } from "@getpaseo/protocol/chat/types";
import { createTeamDatabaseManager } from "./storage/database.js";
import { createProjectStore } from "./storage/project-store.js";

const legacyChatStoreSchema = z.object({
  rooms: z.array(ChatRoomSchema),
  messages: z.array(ChatMessageSchema),
});

const adoptionMarkerSchema = z.object({
  projectId: z.string(),
  adoptedAt: z.string(),
});

export interface LegacyChatAdoptionState {
  status: "none" | "pending" | "adopted";
  roomCount: number;
  messageCount: number;
  projectId: string | null;
}

export interface LegacyChatAdoptionResult {
  adopted: boolean;
  importedRoomCount: number;
  importedMessageCount: number;
  projectId: string;
}

export async function adoptLegacyChatIntoProject(input: {
  paseoHome: string;
  projectId: string;
  now?: () => Date;
}): Promise<LegacyChatAdoptionResult> {
  const markerPath = join(input.paseoHome, "team", "legacy-chat-adoption.json");
  const existingMarker = await readAdoptionMarker(markerPath);
  if (existingMarker) {
    return {
      adopted: false,
      importedRoomCount: 0,
      importedMessageCount: 0,
      projectId: existingMarker.projectId,
    };
  }

  const storePath = join(input.paseoHome, "chat", "rooms.json");
  const payload = legacyChatStoreSchema.parse(JSON.parse(await readFile(storePath, "utf8")));
  const dbManager = createTeamDatabaseManager({ teamDir: join(input.paseoHome, "team") });
  try {
    const projectStore = createProjectStore(dbManager.openProject(input.projectId));
    const memberIds = projectStore.listProjectMembers().map((member) => member.memberId);
    for (const room of payload.rooms) {
      if (!projectStore.getChannel(room.id)) {
        projectStore.createChannel({
          id: room.id,
          name: room.name,
          purpose: room.purpose,
          memberIds,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
          archivedAt: null,
        });
      }
    }
    for (const message of payload.messages) {
      projectStore.createMessage({
        id: message.id,
        channelId: message.roomId,
        authorMemberId: message.authorAgentId,
        body: message.body,
        replyToMessageId: message.replyToMessageId,
        createdAt: message.createdAt,
        autoStarted: false,
      });
      for (const mentionAgentId of message.mentionAgentIds) {
        projectStore.addMessageMention(message.id, mentionAgentId);
      }
    }
  } finally {
    dbManager.closeAll();
  }

  await mkdir(join(input.paseoHome, "team"), { recursive: true });
  await writeFile(
    markerPath,
    JSON.stringify(
      adoptionMarkerSchema.parse({
        projectId: input.projectId,
        adoptedAt: (input.now ?? (() => new Date()))().toISOString(),
      }),
      null,
      2,
    ),
  );

  return {
    adopted: true,
    importedRoomCount: payload.rooms.length,
    importedMessageCount: payload.messages.length,
    projectId: input.projectId,
  };
}

export async function getLegacyChatAdoptionState(
  paseoHome: string,
): Promise<LegacyChatAdoptionState> {
  const markerPath = join(paseoHome, "team", "legacy-chat-adoption.json");
  const storePath = join(paseoHome, "chat", "rooms.json");
  const marker = await readAdoptionMarker(markerPath);
  const payload = await readLegacyChatStore(storePath);
  if (!payload) {
    return {
      status: marker ? "adopted" : "none",
      roomCount: 0,
      messageCount: 0,
      projectId: marker?.projectId ?? null,
    };
  }
  if (marker) {
    return {
      status: "adopted",
      roomCount: payload.rooms.length,
      messageCount: payload.messages.length,
      projectId: marker.projectId,
    };
  }
  return {
    status: payload.rooms.length + payload.messages.length > 0 ? "pending" : "none",
    roomCount: payload.rooms.length,
    messageCount: payload.messages.length,
    projectId: null,
  };
}

async function readAdoptionMarker(
  path: string,
): Promise<z.infer<typeof adoptionMarkerSchema> | null> {
  try {
    return adoptionMarkerSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readLegacyChatStore(
  path: string,
): Promise<z.infer<typeof legacyChatStoreSchema> | null> {
  try {
    return legacyChatStoreSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
