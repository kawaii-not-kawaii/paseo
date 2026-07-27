import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/utils/confirm-dialog";
import { removeTeamMember, startTeamMember, stopTeamMember } from "@/screens/team/team-client";
import { settingsStyles } from "@/styles/settings";

interface MemberActionsProps {
  client: DaemonClient | null;
  projectId: string;
  member: TeamMember;
  onMemberChanged?: (member: TeamMember | null) => void;
  onRemoved?: (memberId: string) => void;
  onRepoint?: (member: TeamMember) => void;
}

export function MemberActions({
  client,
  projectId,
  member,
  onMemberChanged,
  onRemoved,
  onRepoint,
}: MemberActionsProps) {
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState<"start" | "stop" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unavailableReason = useMemo(() => {
    if (member.status !== "unavailable") {
      return null;
    }
    return member.homeWorkspaceId
      ? t("team.members.actions.workspaceUnavailable", { workspace: member.homeWorkspaceId })
      : t("team.members.actions.workspaceMissingReason");
  }, [member.homeWorkspaceId, member.status, t]);

  const handleStart = useCallback(async () => {
    if (!client || isPending) {
      return;
    }
    setIsPending("start");
    setError(null);
    try {
      const nextMember = await startTeamMember({ client, projectId, memberId: member.id });
      onMemberChanged?.(nextMember);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsPending(null);
    }
  }, [client, isPending, member.id, onMemberChanged, projectId]);

  const handleStop = useCallback(async () => {
    if (!client || isPending) {
      return;
    }
    setIsPending("stop");
    setError(null);
    try {
      const nextMember = await stopTeamMember({ client, projectId, memberId: member.id });
      onMemberChanged?.(nextMember);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsPending(null);
    }
  }, [client, isPending, member.id, onMemberChanged, projectId]);

  const handleRemove = useCallback(async () => {
    if (!client || isPending) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("team.members.actions.removeTitle", { name: member.name }),
      message: t("team.members.actions.removeMessage", { name: member.name }),
      confirmLabel: t("team.members.actions.removeConfirm"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setIsPending("remove");
    setError(null);
    try {
      const removedMemberId = await removeTeamMember({ client, projectId, memberId: member.id });
      if (removedMemberId) {
        onRemoved?.(removedMemberId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsPending(null);
    }
  }, [client, isPending, member.id, member.name, onRemoved, projectId, t]);

  const handleRepoint = useCallback(() => {
    onRepoint?.(member);
  }, [member, onRepoint]);

  return (
    <View style={styles.container}>
      {unavailableReason ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>{t("team.members.actions.unavailableTitle")}</Text>
          <Text style={settingsStyles.rowHint}>{unavailableReason}</Text>
          <Button
            variant="secondary"
            size="sm"
            onPress={handleRepoint}
            testID="team-member-repoint-button"
          >
            {t("team.members.actions.repoint")}
          </Button>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Button
          variant="default"
          style={styles.actionButton}
          onPress={handleStart}
          loading={isPending === "start"}
          testID="team-member-start-button"
        >
          {t("team.members.actions.start")}
        </Button>
        <Button
          variant="secondary"
          style={styles.actionButton}
          onPress={handleStop}
          loading={isPending === "stop"}
          testID="team-member-stop-button"
        >
          {t("team.members.actions.stop")}
        </Button>
      </View>

      <Button
        variant="outline"
        onPress={handleRemove}
        loading={isPending === "remove"}
        testID="team-member-remove-button"
      >
        {t("team.members.actions.remove")}
      </Button>

      {error ? (
        <Text style={styles.errorText} testID="team-member-actions-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  actionButton: {
    flex: 1,
  },
  warningCard: {
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.statusWarning,
    backgroundColor: theme.colors.surface1,
  },
  warningTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  errorText: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
  },
}));
