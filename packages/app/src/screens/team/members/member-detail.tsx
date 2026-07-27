import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamHomeFileEntry, TeamMember } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { ScrollableCodeSurface } from "@/components/ui/scrollable-code-surface";
import { settingsStyles } from "@/styles/settings";
import {
  listTeamMemberHomeFiles,
  readTeamMemberHomeFile,
  updateTeamMember,
} from "@/screens/team/team-client";

interface MemberDetailProps {
  client: DaemonClient | null;
  member: TeamMember;
  onMemberChanged?: (member: TeamMember | null) => void;
}

export function MemberDetail({ client, member, onMemberChanged }: MemberDetailProps) {
  const { t } = useTranslation();
  const [rolePrompt, setRolePrompt] = useState(member.rolePrompt ?? "");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<TeamHomeFileEntry[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>("MEMORY.md");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setRolePrompt(member.rolePrompt ?? "");
    setPromptError(null);
  }, [member.id, member.rolePrompt]);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!client) {
        return;
      }
      setIsLoadingFiles(true);
      setFileError(null);
      try {
        const result = await listTeamMemberHomeFiles({ client, memberId: member.id, path });
        setCurrentPath(result.path);
        setEntries(result.entries);
        const memoryEntry = result.entries.find((entry) => entry.path.endsWith("MEMORY.md"));
        const nextSelection =
          memoryEntry?.path ?? result.entries.find((entry) => entry.kind === "file")?.path;
        if (nextSelection) {
          setSelectedFilePath(nextSelection);
        } else {
          setSelectedFilePath("");
          setFileContent(null);
        }
      } catch (error) {
        setFileError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [client, member.id],
  );

  const loadFile = useCallback(
    async (path: string) => {
      if (!client || !path) {
        return;
      }
      setIsLoadingContent(true);
      setFileError(null);
      try {
        const result = await readTeamMemberHomeFile({ client, memberId: member.id, path });
        setSelectedFilePath(result.path);
        setFileContent(result.content);
      } catch (error) {
        setFileError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoadingContent(false);
      }
    },
    [client, member.id],
  );

  useEffect(() => {
    void loadDirectory(".");
  }, [loadDirectory, member.id]);

  useEffect(() => {
    if (!selectedFilePath) {
      return;
    }
    void loadFile(selectedFilePath);
  }, [loadFile, selectedFilePath]);

  const handleSavePrompt = useCallback(async () => {
    if (!client || isSavingPrompt) {
      return;
    }
    setIsSavingPrompt(true);
    setPromptError(null);
    try {
      const nextMember = await updateTeamMember({
        client,
        memberId: member.id,
        rolePrompt,
      });
      onMemberChanged?.(nextMember);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingPrompt(false);
    }
  }, [client, isSavingPrompt, member.id, onMemberChanged, rolePrompt]);

  const handleOpenEntry = useCallback(
    (entry: TeamHomeFileEntry) => {
      if (entry.kind === "directory") {
        void loadDirectory(entry.path);
        return;
      }
      setSelectedFilePath(entry.path);
    },
    [loadDirectory],
  );

  const handleUp = useCallback(() => {
    if (currentPath === "." || currentPath.length === 0) {
      return;
    }
    const nextPath = currentPath.includes("/")
      ? currentPath.slice(0, currentPath.lastIndexOf("/"))
      : ".";
    void loadDirectory(nextPath.length > 0 ? nextPath : ".");
  }, [currentPath, loadDirectory]);

  const promptDirty = useMemo(
    () => rolePrompt !== (member.rolePrompt ?? ""),
    [member.rolePrompt, rolePrompt],
  );
  const contentLabel = useMemo(() => {
    if (fileError) {
      return fileError;
    }
    if (isLoadingFiles || isLoadingContent) {
      return t("common.states.loading");
    }
    return fileContent ?? t("team.members.detail.emptyFile");
  }, [fileContent, fileError, isLoadingContent, isLoadingFiles, t]);

  return (
    <View style={styles.container}>
      <View style={settingsStyles.section}>
        <Text style={settingsStyles.sectionTitle}>{t("team.members.detail.rolePrompt")}</Text>
        <Field
          label={t("team.members.detail.rolePrompt")}
          error={promptError}
          testID="team-member-role-prompt-field"
        >
          <FormTextInput
            initialValue={member.rolePrompt ?? ""}
            resetKey={`${member.id}:${member.rolePrompt ?? ""}`}
            onChangeText={setRolePrompt}
            editable={!isSavingPrompt}
            multiline
            style={styles.promptInput}
            textAlignVertical="top"
            testID="team-member-role-prompt-input"
          />
        </Field>
        <Button
          variant="default"
          onPress={handleSavePrompt}
          disabled={!promptDirty || isSavingPrompt}
          loading={isSavingPrompt}
          testID="team-member-role-prompt-save"
        >
          {t("common.actions.save")}
        </Button>
      </View>

      <View style={settingsStyles.section}>
        <Text style={settingsStyles.sectionTitle}>{t("team.members.detail.memory")}</Text>
        <View style={styles.browserHeader}>
          <Text style={settingsStyles.rowHint}>
            {t("team.members.detail.path", { path: currentPath })}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={handleUp}
            disabled={currentPath === "."}
            testID="team-member-home-up"
          >
            {t("team.members.detail.up")}
          </Button>
        </View>
        <View style={settingsStyles.card}>
          {entries.map((entry, index) => (
            <MemberFileEntryButton
              key={entry.path}
              entry={entry}
              bordered={index > 0}
              label={
                entry.kind === "directory"
                  ? t("team.members.detail.directoryLabel", { name: entry.name })
                  : entry.name
              }
              onOpenEntry={handleOpenEntry}
            />
          ))}
          {entries.length === 0 && !isLoadingFiles ? (
            <View style={settingsStyles.row}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowHint}>{t("team.members.detail.noFiles")}</Text>
              </View>
            </View>
          ) : null}
        </View>
        <ScrollableCodeSurface
          horizontal={false}
          maxHeight={360}
          testID="team-member-memory-content"
        >
          {contentLabel}
        </ScrollableCodeSurface>
      </View>
    </View>
  );
}

const MemberFileEntryButton = memo(function MemberFileEntryButton({
  entry,
  bordered,
  label,
  onOpenEntry,
}: {
  entry: TeamHomeFileEntry;
  bordered: boolean;
  label: string;
  onOpenEntry: (entry: TeamHomeFileEntry) => void;
}) {
  const handlePress = useCallback(() => {
    onOpenEntry(entry);
  }, [entry, onOpenEntry]);

  return (
    <Button
      variant="ghost"
      onPress={handlePress}
      style={[styles.fileRow, bordered ? styles.fileRowBorder : null]}
      testID={`team-member-home-entry-${entry.path}`}
    >
      {label}
    </Button>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[6],
  },
  promptInput: {
    minHeight: 180,
  },
  browserHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  fileRow: {
    justifyContent: "flex-start",
    borderRadius: 0,
  },
  fileRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
}));
