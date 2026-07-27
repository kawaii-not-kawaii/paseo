import { useCallback, useState } from "react";
import { View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { MemberActions } from "./member-actions";
import { MemberDetail } from "./member-detail";
import { MemberForm } from "./member-form";
import { MemberList } from "./member-list";

/**
 * The Members section: roster, detail, lifecycle actions, and the create/edit form.
 *
 * Composition only — every piece it arranges owns its own behaviour.
 */
export function TeamMembersSection({
  client,
  serverId,
  projectId,
  members,
  channels,
  onMembersChanged,
}: {
  client: DaemonClient | null;
  serverId: string | null;
  projectId: string;
  members: TeamMember[];
  channels: TeamChannel[];
  onMembersChanged: () => void;
}) {
  const { t } = useTranslation();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" | "edit"; member: TeamMember | null } | null>(
    null,
  );

  const selected = members.find((member) => member.id === selectedMemberId) ?? null;

  const closeForm = useCallback(() => setForm(null), []);
  const openCreate = useCallback(() => setForm({ mode: "create", member: null }), []);
  const openEdit = useCallback((member: TeamMember) => setForm({ mode: "edit", member }), []);

  const handleSaved = useCallback(() => {
    setForm(null);
    onMembersChanged();
  }, [onMembersChanged]);

  const handleRemoved = useCallback(() => {
    setSelectedMemberId(null);
    onMembersChanged();
  }, [onMembersChanged]);

  const handleSelect = useCallback((member: TeamMember) => setSelectedMemberId(member.id), []);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button onPress={openCreate} testID="team-member-create-button">
          {t("team.members.actions.create")}
        </Button>
      </View>
      <MemberList
        members={members}
        channels={channels}
        selectedMemberId={selectedMemberId}
        onSelect={handleSelect}
      />
      {selected ? (
        <View style={styles.detail}>
          <MemberActions
            client={client}
            projectId={projectId}
            member={selected}
            onMemberChanged={onMembersChanged}
            onRemoved={handleRemoved}
            onRepoint={openEdit}
          />
          <MemberDetail client={client} member={selected} onMemberChanged={onMembersChanged} />
        </View>
      ) : null}
      <MemberForm
        visible={form !== null}
        mode={form?.mode ?? "create"}
        client={client}
        serverId={serverId}
        currentProjectId={projectId}
        member={form?.member ?? null}
        onClose={closeForm}
        onSaved={handleSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  toolbar: {
    alignItems: "flex-end",
  },
  detail: {
    gap: theme.spacing[4],
  },
}));
