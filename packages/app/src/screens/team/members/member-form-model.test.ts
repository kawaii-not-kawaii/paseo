import { describe, expect, it } from "vitest";
import { openMemberForm } from "./member-form-model";

function openEmptyForm() {
  return openMemberForm({
    mode: "create",
    currentProjectId: "prj_test",
    projects: [],
    assignments: [],
    templates: [],
    providerEntries: [],
  });
}

describe("member form model", () => {
  // `getState` is consumed as a useSyncExternalStore getSnapshot. React compares snapshots with
  // Object.is during render, so returning a fresh clone per call makes every render look like a
  // store change and the form loops until React throws "Maximum update depth exceeded".
  it("returns a stable snapshot reference until something changes", () => {
    const model = openEmptyForm();

    expect(model.getState()).toBe(model.getState());

    const before = model.getState();
    model.setName("impl");
    expect(model.getState()).not.toBe(before);
    expect(model.getState()).toBe(model.getState());

    model.close();
  });

  it("publishes a new snapshot when a re-applied collection changes", () => {
    const model = openEmptyForm();
    const before = model.getState();

    model.applyTemplates([]);

    expect(model.getState()).not.toBe(before);
    model.close();
  });
});
