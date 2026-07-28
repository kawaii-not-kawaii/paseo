import { describe, expect, it } from "vitest";
import { openProjectSettingsForm } from "./project-settings-form-model";

describe("project settings form model", () => {
  // `getState` is consumed as a useSyncExternalStore getSnapshot. React compares snapshots with
  // Object.is during render, so returning a fresh clone per call makes every render look like a
  // store change and the form loops until React throws "Maximum update depth exceeded".
  it("returns a stable snapshot reference until something changes", () => {
    const model = openProjectSettingsForm({
      settings: {
        messageRetentionCap: 50_000,
        handbackLimit: 3,
        attemptTimeoutMs: 1_800_000,
        noProgressLimit: 12,
        autoStartEnabled: true,
      },
    });

    expect(model.getState()).toBe(model.getState());

    const before = model.getState();
    model.setHandbackLimit("4");
    expect(model.getState()).not.toBe(before);
    expect(model.getState()).toBe(model.getState());

    model.close();
  });

  it("seeds editable values from the current settings", () => {
    const model = openProjectSettingsForm({
      settings: {
        messageRetentionCap: 50_000,
        handbackLimit: 3,
        attemptTimeoutMs: 1_800_000,
        noProgressLimit: 12,
        autoStartEnabled: true,
      },
    });

    expect(model.getState()).toMatchObject({
      messageRetentionCap: "50000",
      handbackLimit: "3",
      attemptTimeoutMinutes: "30",
      noProgressLimit: "12",
      showsRetentionWarning: false,
      canSubmit: true,
    });

    model.close();
  });

  it("warns when lowering the retention cap and disables submit for invalid values", () => {
    const model = openProjectSettingsForm({
      settings: {
        messageRetentionCap: 50_000,
        handbackLimit: 3,
        attemptTimeoutMs: 1_800_000,
        noProgressLimit: 12,
        autoStartEnabled: true,
      },
    });

    model.setMessageRetentionCap("1000");
    expect(model.getState()).toMatchObject({
      showsRetentionWarning: true,
      canSubmit: true,
    });

    model.setAttemptTimeoutMinutes("0");
    expect(model.getState()).toMatchObject({
      attemptTimeoutMinutes: "0",
      canSubmit: false,
    });

    model.close();
  });
});
