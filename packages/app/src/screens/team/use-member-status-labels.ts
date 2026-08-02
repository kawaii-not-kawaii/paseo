import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TeamMemberStatusLabels } from "@/screens/team/member-status";

/**
 * The member status strings, memoized so the rail, roster, and detail pane can
 * each ask for them without allocating a fresh object every render.
 */
export function useTeamMemberStatusLabels(): TeamMemberStatusLabels {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      idle: t("team.members.idle"),
      working: t("team.members.working"),
      stopped: t("team.members.stopped"),
      unavailable: t("team.members.list.workspaceMissing"),
      you: t("team.members.builtInIdentity"),
    }),
    [t],
  );
}
