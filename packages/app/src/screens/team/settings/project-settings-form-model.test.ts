import { describe, expect, it } from "vitest";
import { openProjectSettingsForm } from "./project-settings-form-model";

describe("project settings form model", () => {
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
