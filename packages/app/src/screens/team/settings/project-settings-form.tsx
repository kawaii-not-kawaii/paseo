import { useCallback, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamProjectSettings } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { FieldControlSize } from "@/components/ui/control-geometry";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { settingsStyles } from "@/styles/settings";
import { updateTeamProjectSettings } from "@/screens/team/team-client";
import { useProjectSettingsFormModel } from "./use-project-settings-form-model";

export function ProjectSettingsForm({
  client,
  projectId,
  settings,
  onSaved,
}: {
  client: DaemonClient | null;
  projectId: string;
  settings: TeamProjectSettings;
  onSaved: (settings: TeamProjectSettings) => void;
}) {
  const { t } = useTranslation();
  const model = useProjectSettingsFormModel({ settings });
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const controlSize: FieldControlSize = useIsCompactFormFactor() ? "md" : "sm";

  const save = useCallback(async () => {
    if (!client || !state.canSubmit) {
      return;
    }
    model.setSubmitError(null);
    try {
      const saved = await updateTeamProjectSettings({
        client,
        projectId,
        settings: model.toSettings(),
      });
      if (saved) {
        onSaved(saved);
      }
    } catch (error) {
      model.setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }, [client, model, onSaved, projectId, state.canSubmit]);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <Field label={t("team.settings.retentionCap")} testID="team-settings-retention-cap-field">
          <FormTextInput
            value={state.messageRetentionCap}
            onChangeText={model.setMessageRetentionCap}
            keyboardType="number-pad"
            size={controlSize}
          />
        </Field>
        <Field label={t("team.settings.handbackLimit")} testID="team-settings-handback-limit-field">
          <FormTextInput
            value={state.handbackLimit}
            onChangeText={model.setHandbackLimit}
            keyboardType="number-pad"
            size={controlSize}
          />
        </Field>
        <Field
          label={t("team.settings.attemptTimeout")}
          testID="team-settings-attempt-timeout-field"
        >
          <FormTextInput
            value={state.attemptTimeoutMinutes}
            onChangeText={model.setAttemptTimeoutMinutes}
            keyboardType="number-pad"
            size={controlSize}
          />
        </Field>
        <Field
          label={t("team.settings.noProgressLimit")}
          testID="team-settings-no-progress-limit-field"
        >
          <FormTextInput
            value={state.noProgressLimit}
            onChangeText={model.setNoProgressLimit}
            keyboardType="number-pad"
            size={controlSize}
          />
        </Field>
      </View>
      {state.showsRetentionWarning ? (
        <Text style={styles.warning} testID="team-settings-retention-warning">
          {t("team.settings.retentionWarning")}
        </Text>
      ) : null}
      {state.submitError ? <Text style={settingsStyles.rowError}>{state.submitError}</Text> : null}
      <Button onPress={save} disabled={!state.canSubmit || !client} testID="team-settings-save">
        {t("common.actions.save")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  grid: {
    gap: theme.spacing[4],
  },
  warning: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
