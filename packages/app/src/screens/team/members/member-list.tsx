import { memo, useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import {
  memberHandle,
  memberStatusLabel,
  memberStatusTone,
  type TeamMemberStatusLabels,
} from "@/screens/team/member-status";
import { teamColors } from "@/screens/team/team-colors";
import { TEAM_LINE_HEIGHT, TEAM_ROSTER_WIDTH } from "@/screens/team/team-layout";
import { TeamStatusDot } from "@/screens/team/ui/status-dot";
import { TeamStatusPill } from "@/screens/team/ui/status-pill";

const EMPTY_WORKSPACE_NAMES: Record<string, string> = {};

/**
 * The Members roster: a 320px scrolling rail of three-line rows.
 *
 * Each row is dot + handle + status pill, then the member's role, then a meta
 * line of `workspace · runtime · model`. A member that has lost its home
 * workspace shows that in the meta slot in danger tone instead — it is the one
 * thing that stops a member running, so it outranks its own configuration.
 */
export function MemberList({
  members,
  selectedMemberId = null,
  workspaceNamesById = EMPTY_WORKSPACE_NAMES,
  labels,
  onSelect,
  emptyLabel,
}: {
  members: TeamMember[];
  selectedMemberId?: string | null;
  workspaceNamesById?: Record<string, string>;
  labels: TeamMemberStatusLabels;
  onSelect: (member: TeamMember) => void;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();

  // The human identity sorts last — the roster reads as the agent team.
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

  const agentCount = useMemo(
    () => members.filter((member) => member.kind !== "human").length,
    [members],
  );

  return (
    <View style={styles.rail}>
      <ScrollView style={styles.scroll}>
        <Text style={styles.countLabel}>{t("team.members.count", { count: agentCount })}</Text>
        {sortedMembers.length === 0 ? (
          <Text style={styles.empty}>{emptyLabel ?? t("team.members.list.empty")}</Text>
        ) : (
          sortedMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              selected={member.id === selectedMemberId}
              workspaceName={
                member.homeWorkspaceId ? workspaceNamesById[member.homeWorkspaceId] : undefined
              }
              labels={labels}
              onSelect={onSelect}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const MemberRow = memo(function MemberRow({
  member,
  selected,
  workspaceName,
  labels,
  onSelect,
}: {
  member: TeamMember;
  selected: boolean;
  workspaceName: string | undefined;
  labels: TeamMemberStatusLabels;
  onSelect: (member: TeamMember) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onSelect(member), [member, onSelect]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const tone = memberStatusTone(member);

  const rowStyle = useCallback(
    ({ hovered }: { hovered?: boolean }) => [
      styles.row,
      (selected || Boolean(hovered)) && styles.rowActive,
    ],
    [selected],
  );

  const lostWorkspace = member.kind !== "human" && !member.homeWorkspaceId;
  const meta = [workspaceName, member.provider, member.model].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={rowStyle}
      testID={`team-member-${member.id}`}
    >
      <View style={styles.rowTop}>
        <TeamStatusDot tone={tone} />
        <Text style={styles.handle} numberOfLines={1}>
          {memberHandle(member)}
        </Text>
        <View style={styles.pillSlot}>
          <TeamStatusPill tone={tone} label={memberStatusLabel(member, labels)} />
        </View>
      </View>
      {member.description ? (
        <Text style={styles.role} numberOfLines={2}>
          {member.description}
        </Text>
      ) : null}
      <MemberRowMeta
        lostWorkspace={lostWorkspace}
        lostWorkspaceLabel={t("team.members.list.workspaceRemoved")}
        meta={meta}
      />
    </Pressable>
  );
});

/**
 * The row's third line. A missing home workspace replaces the meta line rather
 * than joining it — it is the one thing that stops a member running.
 */
function MemberRowMeta({
  lostWorkspace,
  lostWorkspaceLabel,
  meta,
}: {
  lostWorkspace: boolean;
  lostWorkspaceLabel: string;
  meta: string;
}) {
  if (lostWorkspace) {
    return (
      <Text style={styles.metaDanger} numberOfLines={1}>
        {lostWorkspaceLabel}
      </Text>
    );
  }
  if (meta.length === 0) {
    return null;
  }
  return (
    <Text style={styles.meta} numberOfLines={1}>
      {meta}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    width: TEAM_ROSTER_WIDTH,
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceSidebar,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  scroll: {
    flex: 1,
  },
  countLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    paddingTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  row: {
    gap: theme.spacing[1],
    paddingVertical: 14,
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  handle: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  pillSlot: {
    marginLeft: "auto",
    flexShrink: 0,
  },
  role: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    lineHeight: theme.fontSize.xs * TEAM_LINE_HEIGHT.help,
  },
  meta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
  },
  metaDanger: {
    fontSize: theme.fontSize.xs,
    color: teamColors.dangerText,
  },
  empty: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
    padding: theme.spacing[4],
  },
}));
