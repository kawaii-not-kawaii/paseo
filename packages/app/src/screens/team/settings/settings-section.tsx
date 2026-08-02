import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamProjectMaintenance, TeamProjectSettings } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import {
  adoptLegacyTeamChat,
  getTeamProjectSettingsState,
  restoreTeamProjectSnapshot,
  type TeamLegacyChatAdoptionState,
} from "@/screens/team/team-client";
import { TeamRecovery } from "@/screens/team/team-recovery";
import { TEAM_CONTENT_MAX_WIDTH, TEAM_SPACE, TEAM_TITLE_WEIGHT } from "@/screens/team/team-layout";
import { ProjectSettingsForm } from "./project-settings-form";

/**
 * Project team settings: a single 720px column that owns its own scrolling.
 *
 * The card + row pattern here is `settingsStyles`, deliberately. Unlike Chat,
 * this section really is a settings surface, and the shared styles already
 * match the design's card exactly — `surface1`, radius 8, 1px border, 16px rows
 * with hairline dividers.
 */
export function TeamSettingsSection({
  client,
  projectId,
  projectName,
}: {
  client: DaemonClient | null;
  projectId: string;
  projectName: string;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TeamProjectSettings | null>(null);
  const [adoption, setAdoption] = useState<TeamLegacyChatAdoptionState | null>(null);
  const [maintenance, setMaintenance] = useState<TeamProjectMaintenance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const refresh = useCallback(async () => {
    if (!client) {
      setSettings(null);
      setAdoption(null);
      return;
    }
    try {
      const nextState = await getTeamProjectSettingsState(client, projectId);
      setSettings(nextState.settings);
      setAdoption(nextState.legacyChatAdoption);
      setMaintenance(nextState.maintenance);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdoptLegacyChat = useCallback(async () => {
    if (!client) {
      return;
    }
    try {
      const nextAdoption = await adoptLegacyTeamChat({ client, projectId });
      setAdoption(nextAdoption);
      setError(null);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId, refresh]);

  const handleRestoreSnapshot = useCallback(async () => {
    if (!client) {
      return;
    }
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const nextMaintenance = await restoreTeamProjectSnapshot({ client, projectId });
      setMaintenance(nextMaintenance);
      await refresh();
    } catch (nextError) {
      setRestoreError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsRestoring(false);
    }
  }, [client, projectId, refresh]);

  const isLoading = !settings && !error && !maintenance?.recovery?.isCorrupt;

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.body}>
        <Text style={styles.title}>{t("team.settings.pageTitle")}</Text>
        <Text style={styles.subtitle}>
          {t("team.settings.pageSubtitle", { project: projectName })}
        </Text>

        <TeamRecovery
          maintenance={maintenance}
          isRestoring={isRestoring}
          restoreError={restoreError}
          onRestore={handleRestoreSnapshot}
        />

        {adoption?.status === "pending" ? (
          <View style={styles.adoptionCard}>
            <Text style={styles.adoptionTitle}>{t("team.settings.adoption.title")}</Text>
            <Text style={styles.muted}>
              {t("team.settings.adoption.body", {
                roomCount: adoption.roomCount,
                messageCount: adoption.messageCount,
              })}
            </Text>
            <Button onPress={handleAdoptLegacyChat} testID="team-adopt-legacy-chat-button">
              {t("team.settings.adoption.action")}
            </Button>
          </View>
        ) : null}

        {isLoading ? <Text style={styles.muted}>{t("common.states.loading")}</Text> : null}

        {!settings && !isLoading ? (
          <Text style={settingsStyles.rowError}>{error ?? t("team.needsHostUpgrade")}</Text>
        ) : null}

        {settings ? (
          /*
            The form model is opened once per mount and seeded from `settings`,
            so switching projects while this section stays mounted would leave
            the previous project's values in the fields. Keying on the project
            rebuilds the model with the settings that were just fetched.
          */
          <ProjectSettingsForm
            key={projectId}
            client={client}
            projectId={projectId}
            settings={settings}
            onSaved={setSettings}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  body: {
    maxWidth: TEAM_CONTENT_MAX_WIDTH,
    paddingTop: TEAM_SPACE.page,
    paddingHorizontal: theme.spacing[8],
    paddingBottom: 40,
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.fontSize["2xl"],
    fontWeight: TEAM_TITLE_WEIGHT,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  adoptionCard: {
    gap: theme.spacing[3],
    marginTop: TEAM_SPACE.message,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
  },
  adoptionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
