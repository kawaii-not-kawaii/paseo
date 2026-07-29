import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import type { FieldControlSize } from "@/components/ui/control-geometry";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { useIsCompactFormFactor } from "@/constants/layout";
import { createTeamChannel } from "@/screens/team/team-client";
import { openChannelForm } from "./channel-form-model";

interface ChannelFormProps {
  visible: boolean;
  client: DaemonClient | null;
  projectId: string;
  onClose: () => void;
  onCreated: (channel: TeamChannel) => void | Promise<void>;
}

function OpenChannelForm({ client, projectId, onClose, onCreated }: ChannelFormProps) {
  const { t } = useTranslation();
  const controlSize: FieldControlSize = useIsCompactFormFactor() ? "md" : "sm";
  const [model] = useState(openChannelForm);
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const [isPending, setIsPending] = useState(false);

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
    setIsPending(true);
    model.setSubmitError(null);
    try {
      const created = await createTeamChannel({
        client,
        projectId,
        ...model.toCreateInput(),
      });
      if (!created) {
        throw new Error(t("common.errors.unableToSave"));
      }
      await onCreated(created);
      onClose();
    } catch (error) {
      model.setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPending(false);
    }
  }, [client, isPending, model, onClose, onCreated, projectId, t]);

  const sheetHeader = useMemo<SheetHeader>(
    () => ({ title: t("team.chat.channel.createTitle") }),
    [t],
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
            resetKey={`${projectId}:create:name`}
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
            resetKey={`${projectId}:create:purpose`}
            onChangeText={model.setPurpose}
            size={controlSize}
            editable={!isPending}
            multiline
            style={styles.purposeInput}
            textAlignVertical="top"
            testID="team-channel-purpose-input"
          />
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
            {t("team.chat.channel.create")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

export function ChannelForm(props: ChannelFormProps) {
  if (!props.visible) {
    return null;
  }
  return <OpenChannelForm key={props.projectId} {...props} />;
}

const styles = StyleSheet.create((theme) => ({
  formBody: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  purposeInput: {
    minHeight: 96,
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
