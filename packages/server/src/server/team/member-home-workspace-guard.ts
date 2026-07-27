import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { createTeamDatabaseManager } from "./storage/database.js";
import { createProjectStore } from "./storage/project-store.js";
import { createRosterStore } from "./storage/roster-store.js";

export interface MemberHomeWorkspaceOwner {
  projectId: string;
  memberId: string;
  memberName: string | null;
}

export function findMemberHomeWorkspaceOwner(input: {
  paseoHome: string;
  workspaceId: string;
}): MemberHomeWorkspaceOwner | null {
  const teamDir = join(input.paseoHome, "team");
  const dbManager = createTeamDatabaseManager({ teamDir });

  try {
    const rosterStore = createRosterStore(dbManager.openRoster());
    for (const entry of readdirSync(teamDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".db") || entry.name === "roster.db") {
        continue;
      }
      const projectId = basename(entry.name, ".db");
      const assignment = createProjectStore(
        dbManager.openProject(projectId),
      ).getProjectMemberByHomeWorkspaceId(input.workspaceId);
      if (!assignment) {
        continue;
      }
      const member = rosterStore.getMember(assignment.memberId);
      return {
        projectId,
        memberId: assignment.memberId,
        memberName: member?.name ?? null,
      };
    }
    return null;
  } finally {
    dbManager.closeAll();
  }
}
