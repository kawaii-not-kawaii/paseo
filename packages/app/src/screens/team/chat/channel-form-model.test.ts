import { describe, expect, it } from "vitest";
import { openChannelForm } from "./channel-form-model";

describe("channel form model", () => {
  it("keeps snapshots stable and preserves daemon-accepted channel names", () => {
    const model = openChannelForm({ channels: [], members: [] });

    expect(model.getState()).toBe(model.getState());

    const before = model.getState();
    model.setName("  build room  ");
    model.setPurpose("  Build coordination  ");

    expect(model.getState()).not.toBe(before);
    expect(model.getState()).toBe(model.getState());
    expect(model.toCreateInput()).toEqual({
      name: "  build room  ",
      purpose: "Build coordination",
      memberIds: [],
    });

    model.setPurpose("  ");
    expect(model.toCreateInput()).toEqual({
      name: "  build room  ",
      purpose: undefined,
      memberIds: [],
    });

    model.close();
  });

  it("matches the daemon's exact-name uniqueness rule when editing", () => {
    const model = openChannelForm({
      channel: {
        id: "channel-build",
        name: "build",
        purpose: "Build coordination",
        memberIds: ["member-backend"],
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
        archivedAt: null,
      },
      channels: [
        {
          id: "channel-build",
          name: "build",
          purpose: "Build coordination",
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
          archivedAt: null,
        },
        {
          id: "channel-general",
          name: "general",
          purpose: null,
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
          archivedAt: null,
        },
      ],
      members: [
        { id: "member-backend", kind: "agent" },
        { id: "member-qa", kind: "agent" },
        { id: "member-human", kind: "human" },
      ],
    });

    expect(model.getState()).toMatchObject({
      name: "build",
      purpose: "Build coordination",
      memberIds: ["member-backend"],
    });
    expect(model.hasNameConflict()).toBe(false);

    model.setName("general");
    expect(model.hasNameConflict()).toBe(true);

    model.setName("General");
    model.setMemberEnabled("member-backend", false);
    model.setMemberEnabled("member-qa", true);
    expect(model.hasNameConflict()).toBe(false);
    expect(model.toUpdateInput()).toEqual({
      name: "General",
      purpose: "Build coordination",
      memberIds: ["member-qa"],
    });

    model.setPurpose(" ");
    expect(model.toUpdateInput().purpose).toBeNull();

    model.close();
  });
});
