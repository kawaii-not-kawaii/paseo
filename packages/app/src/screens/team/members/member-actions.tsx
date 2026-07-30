import { useCallback, useState } from "react";
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
}

export function MemberActions({
  client,
  projectId,
  member,
  onMemberChanged,
  onRemoved,
}: MemberActionsProps) {
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState<"start" | "stop" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const isRunning = member.status === "running";

  return (
    <View style={styles.actions}>
      <View style={styles.actionsRow}>
        {/*
          One lifecycle button, not two. The design shows "Stop" beside a working
          member; offering Start and Stop at once makes the reader work out which
          one is live.
        */}
        <Button
          variant="outline"
          size="sm"
          onPress={isRunning ? handleStop : handleStart}
          loading={isPending === "start" || isPending === "stop"}
          testID={isRunning ? "team-member-stop-button" : "team-member-start-button"}
        >
          {isRunning ? t("team.members.actions.stop") : t("team.members.actions.start")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={handleRemove}
          loading={isPending === "remove"}
          testID="team-member-remove-button"
        >
          {t("team.members.actions.remove")}
        </Button>
      </View>
      {error ? (
        <Text style={styles.errorText} testID="team-member-actions-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The "this member cannot run" callout, shown under the detail sub-line rather
 * than in the title row so a long reason does not push the actions around.
 */
export function MemberUnavailableNotice({
  member,
  onRepoint,
}: {
  member: TeamMember;
  onRepoint?: (member: TeamMember) => void;
}) {
  const { t } = useTranslation();
  const handleRepoint = useCallback(() => onRepoint?.(member), [member, onRepoint]);

  if (member.status !== "unavailable") {
    return null;
  }

  const reason = member.homeWorkspaceId
    ? t("team.members.actions.workspaceUnavailable", { workspace: member.homeWorkspaceId })
    : t("team.members.actions.workspaceMissingReason");

  return (
    <View style={styles.warningCard}>
      <Text style={styles.warningTitle}>{t("team.members.actions.unavailableTitle")}</Text>
      <Text style={settingsStyles.rowHint}>{reason}</Text>
      <Button
        variant="secondary"
        size="sm"
        onPress={handleRepoint}
        testID="team-member-repoint-button"
      >
        {t("team.members.actions.repoint")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: {
    alignItems: "flex-end",
    gap: theme.spacing[1],
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
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
