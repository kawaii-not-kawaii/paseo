import { describe, expect, it } from "vitest";
import { openChannelForm } from "./channel-form-model";

describe("channel form model", () => {
  it("keeps snapshots stable and preserves daemon-accepted channel names", () => {
    const model = openChannelForm();

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
});
