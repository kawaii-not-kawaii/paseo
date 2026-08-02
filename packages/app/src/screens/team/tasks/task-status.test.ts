import { describe, expect, test } from "vitest";
import { getCrossColumnDropStatus } from "./task-status";

describe("task board drops", () => {
  test("moves only when a task crosses into another status column", () => {
    expect(getCrossColumnDropStatus("todo", "in_review")).toBe("in_review");
    expect(getCrossColumnDropStatus("todo", "todo")).toBeNull();
    expect(getCrossColumnDropStatus("todo", undefined)).toBeNull();
  });
});
