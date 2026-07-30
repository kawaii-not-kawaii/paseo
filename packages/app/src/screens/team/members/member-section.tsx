import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useTeamMemberStatusLabels } from "@/screens/team/use-member-status-labels";
import { MemberDetail } from "./member-detail";
import { MemberList } from "./member-list";

/**
 * The Members section: 320px roster on the left, detail pane on the right.
 *
 * Composition only. The create/edit form lives at shell level, because the
 * "Add member" button sits in the section switcher above every section.
 */
export function TeamMembersSection({
  client,
  projectId,
  members,
  channels,
  workspaceNamesById,
  onMembersChanged,
  onEditMember,
}: {
  client: DaemonClient | null;
  projectId: string;
  members: TeamMember[];
  channels: TeamChannel[];
  workspaceNamesById?: Record<string, string>;
  onMembersChanged: () => void;
  onEditMember: (member: TeamMember) => void;
}) {
  const { t } = useTranslation();
  const labels = useTeamMemberStatusLabels();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Falling back keeps the detail pane populated on arrival, but it has to land
  // on the same row the roster shows first — an agent, not the human identity,
  // whose detail is a name and one line. `members` arrives unsorted, so picking
  // `members[0]` here would open whichever row the daemon happened to return.
  const selected = useMemo(() => {
    const match = members.find((member) => member.id === selectedMemberId);
    if (match) {
      return match;
    }
    const agents = members.filter((member) => member.kind !== "human");
    const firstAgent = [...agents].sort((left, right) => left.name.localeCompare(right.name))[0];
    return firstAgent ?? members[0] ?? null;
  }, [members, selectedMemberId]);

  const handleSelect = useCallback((member: TeamMember) => setSelectedMemberId(member.id), []);
  const handleRemoved = useCallback(() => {
    setSelectedMemberId(null);
    onMembersChanged();
  }, [onMembersChanged]);
  const handleMemberChanged = useCallback(() => onMembersChanged(), [onMembersChanged]);

  const workspaceName = useMemo(() => {
    if (!selected?.homeWorkspaceId) {
      return null;
    }
    return workspaceNamesById?.[selected.homeWorkspaceId] ?? null;
  }, [selected?.homeWorkspaceId, workspaceNamesById]);

  return (
    <View style={styles.section}>
      <MemberList
        members={members}
        selectedMemberId={selected?.id ?? null}
        workspaceNamesById={workspaceNamesById}
        labels={labels}
        onSelect={handleSelect}
      />
      <View style={styles.detail}>
        {selected ? (
          <MemberDetail
            key={selected.id}
            client={client}
            member={selected}
            channels={channels}
            labels={labels}
            workspaceName={workspaceName}
            projectId={projectId}
            onMemberChanged={handleMemberChanged}
            onRemoved={handleRemoved}
            onEditMember={onEditMember}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t("team.members.list.empty")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
  detail: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
