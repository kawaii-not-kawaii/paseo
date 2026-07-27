import { describe, expect, test } from "vitest";
import { z } from "zod";
import { SessionOutboundMessageSchema } from "../messages.js";
import {
  TeamEventSchemas,
  TeamMemberCreateRequestSchema,
  TeamMemberListResponseSchema,
  TeamMessagePostedSchema,
  TeamMessagePostRequestSchema,
  TeamProjectStoppedSchema,
  TeamRequestSchemas,
  TeamResponseSchemas,
  TeamTaskSetClaimRequestSchema,
} from "./rpc-schemas.js";

function walkSchema(
  schema: z.ZodType,
  visit: (schema: z.ZodType) => void,
  seen = new Set<z.ZodType>(),
) {
  if (seen.has(schema)) {
    return;
  }
  seen.add(schema);
  visit(schema);

  const def = (schema as z.ZodType & { _def?: Record<string, unknown> })._def;
  if (!def) {
    return;
  }

  for (const value of Object.values(def)) {
    if (value instanceof z.ZodType) {
      walkSchema(value, visit, seen);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof z.ZodType) {
          walkSchema(item, visit, seen);
        }
      }
      continue;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        if (nested instanceof z.ZodType) {
          walkSchema(nested, visit, seen);
        }
      }
    }
  }
}

describe("team rpc schemas", () => {
  test("wire schemas stay structural and accept unknown future fields", () => {
    const allSchemas = [...TeamRequestSchemas, ...TeamResponseSchemas, ...TeamEventSchemas];

    for (const schema of allSchemas) {
      walkSchema(schema, (node) => {
        const def = (node as z.ZodType & { _def?: { type?: string } })._def;
        expect(def?.type).not.toBe("pipe");
        expect(def?.type).not.toBe("catch");
      });
    }

    const request = TeamMessagePostRequestSchema.parse({
      type: "team.message.post.request",
      requestId: "req-extra",
      projectId: "project-1",
      channelId: "channel-1",
      body: "hello",
      extraField: "ignored",
    });
    expect(request).not.toHaveProperty("extraField");

    const response = TeamMemberListResponseSchema.parse({
      type: "team.member.list.response",
      payload: {
        requestId: "req-extra",
        members: [],
        error: null,
        extraField: "ignored",
      },
    });
    expect(response.payload).not.toHaveProperty("extraField");
  });

  test("every response carries requestId and nullable error", () => {
    for (const schema of TeamResponseSchemas) {
      const payloadSchema = (schema as z.ZodObject).shape.payload as z.ZodObject;
      const payloadShape = payloadSchema.shape as Record<string, z.ZodType>;

      expect(payloadShape.requestId).toBeDefined();
      expect(payloadShape.error).toBeDefined();
      expect(payloadShape.error.safeParse(null).success).toBe(true);
      expect(payloadShape.error.safeParse("boom").success).toBe(true);
    }
  });

  test("payloads lacking optional team fields still parse", () => {
    const memberCreate = TeamMemberCreateRequestSchema.parse({
      type: "team.member.create.request",
      requestId: "req-member",
      projectId: "project-1",
      name: "qa",
      provider: "codex",
      homeWorkspaceId: "workspace-1",
    });
    expect(memberCreate.description).toBeUndefined();
    expect(memberCreate.model).toBeUndefined();

    const claimOverride = TeamTaskSetClaimRequestSchema.parse({
      type: "team.task.set_claim.request",
      requestId: "req-claim",
      projectId: "project-1",
      taskId: "task-1",
      claimantMemberId: null,
    });
    expect(claimOverride.claimantMemberId).toBeNull();

    const event = TeamMessagePostedSchema.parse({
      type: "team.message.posted",
      payload: {
        projectId: "project-1",
        message: {
          id: "msg-1",
          channelId: "channel-1",
          authorMemberId: "member-1",
          body: "hello",
          replyToMessageId: null,
          createdAt: "2026-07-27T00:00:00.000Z",
        },
      },
    });
    expect(event.payload.message.mentionMemberIds).toBeUndefined();
    expect(event.payload.message.autoStarted).toBeUndefined();
  });

  test("new session union entries do not break old-shaped outbound messages", () => {
    const parsed = SessionOutboundMessageSchema.parse({
      type: "chat/list/response",
      payload: {
        requestId: "req-chat",
        rooms: [],
        error: null,
      },
    });

    expect(parsed.type).toBe("chat/list/response");
  });

  test("project stopped events carry a reason and an optional task", () => {
    const parsed = TeamProjectStoppedSchema.parse({
      type: "team.project.stopped",
      payload: {
        projectId: "project-1",
        reason: "no_progress",
        task: null,
      },
    });

    expect(parsed.payload.reason).toBe("no_progress");
    expect(parsed.payload.task).toBeNull();
  });
});
