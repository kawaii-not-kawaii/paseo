import { createProjectStore } from "./storage/project-store.js";
import type { TeamDatabaseHandle } from "./storage/database.js";

export interface TeamRetentionResult {
  projectId: string;
  prunedMessageCount: number;
}

export function applyTeamMessageRetention(input: {
  listProjectIds: () => string[];
  openProject: (projectId: string) => TeamDatabaseHandle;
  now?: () => Date;
  onProjectError?: (input: { projectId: string; error: unknown }) => void;
}): TeamRetentionResult[] {
  const prunedAt = (input.now ?? (() => new Date()))().toISOString();
  const results: TeamRetentionResult[] = [];

  for (const projectId of input.listProjectIds()) {
    try {
      const store = createProjectStore(input.openProject(projectId));
      const prunedMessageCount = store.pruneMessagesBeyondRetentionCap(
        store.getProjectSettings().messageRetentionCap,
      );
      store.recordRetentionPrune(prunedMessageCount, prunedAt);
      results.push({ projectId, prunedMessageCount });
    } catch (error) {
      input.onProjectError?.({ projectId, error });
    }
  }

  return results;
}
