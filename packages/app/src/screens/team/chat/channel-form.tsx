import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Switch, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import type { FieldControlSize } from "@/components/ui/control-geometry";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { useIsCompactFormFactor } from "@/constants/layout";
import { createTeamChannel, updateTeamChannel } from "@/screens/team/team-client";
import { openChannelForm } from "./channel-form-model";

interface ChannelFormProps {
  visible: boolean;
  mode: "create" | "edit";
  client: DaemonClient | null;
  projectId: string;
  channel?: TeamChannel | null;
  channels: TeamChannel[];
  members: TeamMember[];
  onClose: () => void;
  onSaved: (channel: TeamChannel) => void | Promise<void>;
}

function OpenChannelForm({
  mode,
  client,
  projectId,
  channel,
  channels,
  members,
  onClose,
  onSaved,
}: ChannelFormProps) {
  const { t } = useTranslation();
  const controlSize: FieldControlSize = useIsCompactFormFactor() ? "md" : "sm";
  const [model] = useState(() => openChannelForm({ channel, channels, members }));
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const [isPending, setIsPending] = useState(false);
  const agentMembers = useMemo(
    () =>
      members
        .filter((member) => member.kind !== "human")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [members],
  );

  useEffect(
    () => () => {
      model.close();
    },
    [model],
  );

  const handleSubmit = useCallback(async () => {
    if (!client || isPending) {
      return;
    }
    if (model.hasNameConflict()) {
      model.setSubmitError(t("team.chat.channel.nameExists", { name: state.name }));
      return;
    }
    setIsPending(true);
    model.setSubmitError(null);
    try {
      const saved =
        mode === "create"
          ? await createTeamChannel({
              client,
              projectId,
              ...model.toCreateInput(),
            })
          : await updateTeamChannel({
              client,
              projectId,
              channelId: channel?.id ?? "",
              ...model.toUpdateInput(),
            });
      if (!saved) {
        throw new Error(t("common.errors.unableToSave"));
      }
      await onSaved(saved);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      model.setSubmitError(
        /UNIQUE constraint failed: channels\.name/i.test(message)
          ? t("team.chat.channel.nameExists", { name: state.name })
          : message,
      );
    } finally {
      setIsPending(false);
    }
  }, [channel?.id, client, isPending, mode, model, onClose, onSaved, projectId, state.name, t]);

  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: t(mode === "create" ? "team.chat.channel.createTitle" : "team.chat.channel.editTitle"),
    }),
    [mode, t],
  );

  return (
    <AdaptiveModalSheet
      visible
      header={sheetHeader}
      onClose={onClose}
      desktopMaxWidth={560}
      testID="team-channel-form"
    >
      <View style={styles.formBody}>
        <Field label={t("team.chat.channel.name")} testID="team-channel-name-field">
          <FormTextInput
            initialValue={state.name}
            resetKey={`${projectId}:${mode}:${channel?.id ?? "new"}:name`}
            onChangeText={model.setName}
            size={controlSize}
            editable={!isPending}
            autoCapitalize="none"
            autoCorrect={false}
            testID="team-channel-name-input"
          />
        </Field>
        <Field label={t("team.chat.channel.purpose")} testID="team-channel-purpose-field">
          <FormTextInput
            initialValue={state.purpose}
            resetKey={`${projectId}:${mode}:${channel?.id ?? "new"}:purpose`}
            onChangeText={model.setPurpose}
            size={controlSize}
            editable={!isPending}
            multiline
            style={styles.purposeInput}
            textAlignVertical="top"
            testID="team-channel-purpose-input"
          />
        </Field>
        <Field label={t("team.sections.members")} testID="team-channel-members-field">
          <View style={styles.memberList}>
            {agentMembers.length === 0 ? (
              <Text style={styles.emptyMembers}>{t("team.members.list.empty")}</Text>
            ) : (
              agentMembers.map((member) => (
                <ChannelMemberToggle
                  key={member.id}
                  member={member}
                  enabled={state.memberIds.includes(member.id)}
                  disabled={isPending}
                  onChange={model.setMemberEnabled}
                />
              ))
            )}
          </View>
        </Field>
        {state.submitError ? (
          <Text style={styles.submitError} testID="team-channel-form-submit-error">
            {state.submitError}
          </Text>
        ) : null}
        <View style={styles.actionsRow}>
          <Button
            variant="secondary"
            style={styles.actionButton}
            onPress={onClose}
            disabled={isPending}
          >
            {t("common.actions.cancel")}
          </Button>
          <Button
            style={styles.actionButton}
            onPress={handleSubmit}
            loading={isPending}
            disabled={!client || isPending}
            testID="team-channel-form-submit"
          >
            {t(mode === "create" ? "team.chat.channel.create" : "common.actions.save")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

function ChannelMemberToggle({
  member,
  enabled,
  disabled,
  onChange,
}: {
  member: TeamMember;
  enabled: boolean;
  disabled: boolean;
  onChange: (memberId: string, enabled: boolean) => void;
}) {
  const handleChange = useCallback(
    (nextEnabled: boolean) => onChange(member.id, nextEnabled),
    [member.id, onChange],
  );
  return (
    <View style={styles.memberRow}>
      <Text style={styles.memberName}>{member.name}</Text>
      <Switch
        value={enabled}
        onValueChange={handleChange}
        disabled={disabled}
        testID={`team-channel-member-toggle-${member.id}`}
      />
    </View>
  );
}

export function ChannelForm(props: ChannelFormProps) {
  if (!props.visible || (props.mode === "edit" && !props.channel)) {
    return null;
  }
  return (
    <OpenChannelForm
      key={`${props.projectId}:${props.mode}:${props.channel?.id ?? "new"}`}
      {...props}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  formBody: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  purposeInput: {
    minHeight: 96,
  },
  memberList: {
    gap: theme.spacing[2],
  },
  memberRow: {
    minHeight: theme.spacing[8],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  memberName: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  emptyMembers: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  submitError: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  actionButton: {
    minWidth: 120,
  },
}));
