import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { TeamProjectMaintenance } from "@getpaseo/protocol/team/types";

export function TeamRecovery({
  maintenance,
  isRestoring,
  restoreError,
  onRestore,
}: {
  maintenance: TeamProjectMaintenance | null;
  isRestoring: boolean;
  restoreError: string | null;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const retentionCount = maintenance?.retention?.lastPrunedMessageCount ?? 0;
  const recovery = maintenance?.recovery ?? null;

  return (
    <>
      {retentionCount > 0 ? (
        <Alert
          testID="team-retention-alert"
          variant="info"
          title={t("team.settings.retentionPrunedTitle")}
          description={t("team.settings.retentionPrunedBody", { count: retentionCount })}
        />
      ) : null}
      {recovery?.isCorrupt ? (
        <Alert
          testID="team-recovery-alert"
          variant="error"
          title={t("team.settings.recovery.title")}
          description={t("team.settings.recovery.body")}
        >
          <Button
            onPress={onRestore}
            variant="outline"
            size="sm"
            disabled={!recovery.canRestore || isRestoring}
            testID="team-recovery-restore-button"
          >
            {isRestoring
              ? t("team.settings.recovery.restoringAction")
              : t("team.settings.recovery.restoreAction")}
          </Button>
        </Alert>
      ) : null}
      {restoreError ? (
        <Alert
          testID="team-recovery-error-alert"
          variant="error"
          title={t("team.settings.recovery.failedTitle")}
          description={restoreError}
        />
      ) : null}
    </>
  );
}
