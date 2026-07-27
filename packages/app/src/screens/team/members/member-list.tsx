import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { StatusBadge } from "@/components/ui/status-badge";
import { settingsStyles } from "@/styles/settings";

const EMPTY_WORKSPACE_NAMES: Record<string, string> = {};

interface MemberListProps {
  members: TeamMember[];
  channels: TeamChannel[];
  selectedMemberId?: string | null;
  workspaceNamesById?: Record<string, string>;
  onSelect: (member: TeamMember) => void;
  emptyLabel?: string;
}

export const MemberList = memo(function MemberList({
  members,
  channels,
  selectedMemberId = null,
  workspaceNamesById = EMPTY_WORKSPACE_NAMES,
  onSelect,
  emptyLabel,
}: MemberListProps) {
  const { t } = useTranslation();
  const channelNameById = useMemo(
    () => Object.fromEntries(channels.map((channel) => [channel.id, `#${channel.name}`])),
    [channels],
  );

  if (members.length === 0) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowHint}>{emptyLabel ?? t("team.members.list.empty")}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={settingsStyles.card}>
      {members.map((member, index) => (
        <MemberRow
          key={member.id}
          member={member}
          bordered={index > 0}
          selected={member.id === selectedMemberId}
          workspaceNameById={workspaceNamesById}
          channelNameById={channelNameById}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
});

function MemberRow({
  member,
  bordered,
  selected,
  workspaceNameById,
  channelNameById,
  onSelect,
}: {
  member: TeamMember;
  bordered: boolean;
  selected: boolean;
  workspaceNameById: Record<string, string>;
  channelNameById: Record<string, string>;
  onSelect: (member: TeamMember) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    onSelect(member);
  }, [member, onSelect]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
      settingsStyles.row,
      bordered ? settingsStyles.rowBorder : null,
      selected ? styles.rowSelected : null,
      !selected && hovered ? styles.rowHovered : null,
      !selected && pressed ? styles.rowPressed : null,
    ],
    [bordered, selected],
  );

  const channelsLabel = useMemo(() => {
    const names = (member.channelIds ?? [])
      .map((channelId) => channelNameById[channelId] ?? channelId)
      .filter((value) => value.trim().length > 0);
    if (names.length === 0) {
      return t("team.members.list.noChannels");
    }
    return names.join(", ");
  }, [channelNameById, member.channelIds, t]);

  const workspaceLabel = useMemo(() => {
    if (!member.homeWorkspaceId) {
      return t("team.members.list.workspaceMissing");
    }
    return workspaceNameById[member.homeWorkspaceId] ?? member.homeWorkspaceId;
  }, [member.homeWorkspaceId, t, workspaceNameById]);

  const badge = getStatusBadge(member.status, t);

  return (
    <Pressable
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      testID={`team-member-row-${member.id}`}
    >
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={settingsStyles.rowTitle}>{member.name}</Text>
          <StatusBadge label={badge.label} variant={badge.variant} />
        </View>
        {member.description ? (
          <Text style={settingsStyles.rowHint}>{member.description}</Text>
        ) : null}
        <Text style={settingsStyles.rowHint}>
          {t("team.members.list.homeWorkspace", { workspace: workspaceLabel })}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("team.members.list.channels", { channels: channelsLabel })}
        </Text>
      </View>
    </Pressable>
  );
}

function getStatusBadge(
  status: TeamMember["status"] | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): { label: string; variant: "success" | "error" | "muted" } {
  if (status === "running") {
    return { label: t("team.members.working"), variant: "success" };
  }
  if (status === "unavailable") {
    return { label: t("team.members.unavailable"), variant: "error" };
  }
  if (status === "stopped") {
    return { label: t("team.members.stopped"), variant: "muted" };
  }
  return { label: t("team.members.idle"), variant: "muted" };
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flex: 1,
    gap: theme.spacing[1],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
}));
