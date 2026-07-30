import { describe, expect, it } from "vitest";
import { describeSubmitBlocker, openMemberForm } from "./member-form-model";

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

describe("describeSubmitBlocker", () => {
  const assignment = (
    over: Partial<Parameters<typeof describeSubmitBlocker>[0]["assignments"][number]> = {},
  ) => ({
    projectId: "prj_test",
    projectName: "test",
    required: true,
    enabled: true,
    homeWorkspaceId: "wks_1",
    workspaceLabel: "main",
    workspaceOptions: [{ id: "wks_1", label: "main" }],
    error: null,
    ...over,
  });
  const complete = {
    name: "impl",
    rolePrompt: "does the work",
    selectedProvider: "codex" as const,
    assignments: [assignment()],
  };

  it("reports nothing when every requirement is met", () => {
    expect(describeSubmitBlocker(complete)).toBeNull();
  });

  it("asks for the missing field, in the order the form reads", () => {
    expect(describeSubmitBlocker({ ...complete, name: "  " })?.key).toBe(
      "team.members.form.blockedName",
    );
    expect(describeSubmitBlocker({ ...complete, rolePrompt: "" })?.key).toBe(
      "team.members.form.blockedRolePrompt",
    );
    expect(describeSubmitBlocker({ ...complete, selectedProvider: null })?.key).toBe(
      "team.members.form.blockedRuntime",
    );
  });

  // The reported bug: a freshly created project has no workspaces, so the
  // button was disabled with nothing on screen explaining why.
  it("names the project when it has no workspaces to choose from", () => {
    const blocker = describeSubmitBlocker({
      ...complete,
      assignments: [assignment({ homeWorkspaceId: null, workspaceOptions: [] })],
    });

    expect(blocker?.key).toBe("team.members.form.blockedNoWorkspaces");
    expect(blocker?.params).toEqual({ project: "test" });
  });

  it("asks for a workspace when the project has some but none is chosen", () => {
    expect(
      describeSubmitBlocker({
        ...complete,
        assignments: [assignment({ homeWorkspaceId: null })],
      })?.key,
    ).toBe("team.members.form.workspaceRequired");
  });

  it("ignores a disabled project that has no workspaces", () => {
    expect(
      describeSubmitBlocker({
        ...complete,
        assignments: [
          assignment(),
          assignment({
            projectId: "prj_other",
            enabled: false,
            homeWorkspaceId: null,
            workspaceOptions: [],
          }),
        ],
      }),
    ).toBeNull();
  });
});
