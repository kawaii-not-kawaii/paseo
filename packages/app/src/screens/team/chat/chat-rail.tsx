import { memo, useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";
import { Hash, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  memberHandle,
  memberStatusTone,
  type TeamMemberStatusLabels,
} from "@/screens/team/member-status";
import { TEAM_CHANNEL_COLUMN_WIDTH, TEAM_SPACE } from "@/screens/team/team-layout";
import { TeamIconButton } from "@/screens/team/ui/icon-button";
import { TeamStatusDot } from "@/screens/team/ui/status-dot";
import type { Theme } from "@/styles/theme";

const ThemedHash = withUnistyles(Hash);
const activeHash = (theme: Theme) => ({ color: theme.colors.foreground });
const idleHash = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

/**
 * Chat's 240px left column: channels above, the member roster below.
 *
 * This is a rail — `surfaceSidebar` background, compact rows, a hairline on the
 * right — not a card list. That difference is the whole reason the Team surface
 * used to read as alien: it was assembled from the settings idiom, and Paseo's
 * real chat uses none of it.
 */
export function ChatRail({
  channels,
  members,
  activeChannelId,
  memberLabels,
  canCreateChannel,
  onSelectChannel,
  onCreateChannel,
}: {
  channels: TeamChannel[];
  members: TeamMember[];
  activeChannelId: string | null;
  memberLabels: TeamMemberStatusLabels;
  canCreateChannel: boolean;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: () => void;
}) {
  const { t } = useTranslation();

  const createIcon = useCallback(
    ({ color, size }: { color: string; size: number }) => <Plus color={color} size={size} />,
    [],
  );

  // The human identity sorts last so the agent roster reads as the team.
  const sortedMembers = useMemo(
    () =>
      [...members].sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === "human" ? 1 : -1;
        }
        return left.name.localeCompare(right.name);
      }),
    [members],
  );

  return (
    <View style={styles.rail}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t("team.chat.channels")}</Text>
          <TeamIconButton
            icon={createIcon}
            size={24}
            surface="rail"
            onPress={onCreateChannel}
            disabled={!canCreateChannel}
            accessibilityLabel={t("team.chat.channel.new")}
            testID="team-channel-create-button"
          />
        </View>
        <View style={styles.rows}>
          {channels.length === 0 ? (
            <Text style={styles.empty}>{t("team.chat.emptyChannels")}</Text>
          ) : (
            channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                isActive={channel.id === activeChannelId}
                onSelect={onSelectChannel}
              />
            ))
          )}
        </View>

        <View style={styles.membersHeader}>
          <Text style={styles.sectionLabel}>{t("team.sections.members")}</Text>
        </View>
        <View style={styles.rows}>
          {sortedMembers.map((member) => (
            <MemberRow key={member.id} member={member} labels={memberLabels} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const ChannelRow = memo(function ChannelRow({
  channel,
  isActive,
  onSelect,
}: {
  channel: TeamChannel;
  isActive: boolean;
  onSelect: (channelId: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(channel.id), [channel.id, onSelect]);
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const rowStyle = useCallback(
    ({ hovered }: { hovered?: boolean }) => [
      styles.row,
      isActive && styles.rowActive,
      Boolean(hovered) && !isActive && styles.rowHover,
    ],
    [isActive],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={rowStyle}
      testID={`team-channel-${channel.id}`}
    >
      <ThemedHash size={13} uniProps={isActive ? activeHash : idleHash} />
      <Text style={isActive ? styles.channelNameActive : styles.channelName} numberOfLines={1}>
        {channel.name}
      </Text>
    </Pressable>
  );
});

const MemberRow = memo(function MemberRow({
  member,
  labels,
}: {
  member: TeamMember;
  labels: TeamMemberStatusLabels;
}) {
  const tone = memberStatusTone(member);
  // Only the two states the design calls out get a trailing label; idle members
  // stay quiet so the column reads as a roster, not a status board.
  const stateLabel = railStateLabel(tone, labels);

  return (
    <View style={styles.row}>
      <TeamStatusDot tone={tone} />
      <Text style={styles.memberName} numberOfLines={1}>
        {memberHandle(member)}
      </Text>
      {stateLabel ? (
        <Text style={tone === "stopped" ? styles.memberStateDanger : styles.memberState}>
          {stateLabel}
        </Text>
      ) : null}
    </View>
  );
});

function railStateLabel(
  tone: ReturnType<typeof memberStatusTone>,
  labels: TeamMemberStatusLabels,
): string | null {
  if (tone === "working") {
    return labels.working;
  }
  if (tone === "stopped") {
    return labels.stopped;
  }
  return null;
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    width: TEAM_CHANNEL_COLUMN_WIDTH,
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceSidebar,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing[3],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: TEAM_SPACE.snug,
    paddingRight: theme.spacing[2],
    paddingBottom: theme.spacing[1.5],
    paddingLeft: theme.spacing[4],
  },
  membersHeader: {
    paddingTop: 18,
    paddingRight: theme.spacing[2],
    paddingBottom: theme.spacing[1.5],
    paddingLeft: theme.spacing[4],
  },
  sectionLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  rows: {
    paddingHorizontal: theme.spacing[2],
    gap: TEAM_SPACE.hairline,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minHeight: 30,
    paddingVertical: 7,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  rowActive: {
    backgroundColor: theme.colors.surface2,
  },
  rowHover: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  channelName: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  channelNameActive: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  memberName: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  memberState: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
  },
  memberStateDanger: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
  },
  empty: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
  },
}));
