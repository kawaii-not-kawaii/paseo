import { describe, expect, it } from "vitest";
import { openChannelForm } from "./channel-form-model";

describe("channel form model", () => {
  it("keeps snapshots stable and preserves daemon-accepted channel names", () => {
    const model = openChannelForm({ channels: [] });

    expect(model.getState()).toBe(model.getState());

    const before = model.getState();
    model.setName("  build room  ");
    model.setPurpose("  Build coordination  ");

    expect(model.getState()).not.toBe(before);
    expect(model.getState()).toBe(model.getState());
    expect(model.toCreateInput()).toEqual({
      name: "  build room  ",
      purpose: "Build coordination",
    });

    model.setPurpose("  ");
    expect(model.toCreateInput()).toEqual({
      name: "  build room  ",
      purpose: undefined,
    });

    model.close();
  });

  it("matches the daemon's exact-name uniqueness rule when editing", () => {
    const model = openChannelForm({
      channel: {
        id: "channel-build",
        name: "build",
        purpose: "Build coordination",
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
    });

    expect(model.getState()).toMatchObject({
      name: "build",
      purpose: "Build coordination",
    });
    expect(model.hasNameConflict()).toBe(false);

    model.setName("general");
    expect(model.hasNameConflict()).toBe(true);

    model.setName("General");
    expect(model.hasNameConflict()).toBe(false);
    expect(model.toUpdateInput()).toEqual({
      name: "General",
      purpose: "Build coordination",
    });

    model.setPurpose(" ");
    expect(model.toUpdateInput().purpose).toBeNull();

    model.close();
  });
});
