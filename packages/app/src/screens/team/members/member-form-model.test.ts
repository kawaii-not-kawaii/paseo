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
    repoRoot: "/repo",
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

describe("provider selection round-trip", () => {
  const entries = [
    {
      provider: "claude",
      enabled: true,
      models: [
        { id: "opus", label: "Opus", isDefault: true },
        { id: "haiku", label: "Haiku" },
      ],
      modes: [{ id: "default", label: "Default" }],
    },
  ] as never;

  const openEditing = (model: string) =>
    openMemberForm({
      mode: "edit",
      currentProjectId: "prj_test",
      member: {
        id: "m1",
        name: "test",
        description: null,
        provider: "claude",
        model,
        kind: "agent",
        rolePrompt: "does the work",
        createdAt: "2026-01-01T00:00:00.000Z",
        archivedAt: null,
      } as never,
      projects: [],
      assignments: [],
      templates: [],
      providerEntries: [],
    });

  // The provider list loads async, so the form is constructed with an empty
  // one. Normalizing against that empty list used to clear the member's model,
  // and the real list then resolved the cleared value to the provider default —
  // so opening the edit form rewrote haiku to opus, and saving persisted it.
  it("keeps the member's model while the provider list is still loading", () => {
    const model = openEditing("haiku");

    expect(model.getState().selectedModel).toBe("haiku");
    expect(model.getState().selectedProvider).toBe("claude");

    model.applyProviderEntries(entries);

    expect(model.getState().selectedModel).toBe("haiku");
    expect(model.getState().selectedProvider).toBe("claude");
    model.close();
  });

  it("falls back to the default once a model is genuinely unavailable", () => {
    const model = openEditing("retired-model");
    model.applyProviderEntries(entries);

    expect(model.getState().selectedModel).toBe("opus");
    model.close();
  });
});
