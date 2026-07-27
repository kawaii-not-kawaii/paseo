import { useCallback, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamMember, TeamMessage } from "@getpaseo/protocol/team/types";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { AutocompletePopover } from "@/components/ui/autocomplete-popover";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { postTeamMessage } from "@/screens/team/team-client";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";

type ComposerStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; label: string }
  | { kind: "failure"; label: string; failedText: string };

interface MessageComposerProps {
  client: DaemonClient | null;
  projectId: string | null;
  channelId: string | null;
  members: TeamMember[];
  placeholder: string;
  submitLabel: string;
  sentLabel: string;
  sendingLabel: string;
  retryLabel: string;
  dismissLabel: string;
  mentionEmptyLabel: string;
  mentionLoadingLabel: string;
  onPosted?: (message: TeamMessage) => void;
}

interface MentionRange {
  start: number;
  end: number;
  query: string;
}

function findMentionRange(text: string, cursor: number): MentionRange | null {
  if (cursor < 0 || cursor > text.length) {
    return null;
  }
  const prefix = text.slice(0, cursor);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(prefix);
  if (!match || match.index < 0) {
    return null;
  }
  const query = match[1] ?? "";
  return {
    start: match.index + match[0].lastIndexOf("@"),
    end: cursor,
    query,
  };
}

function replaceMention(text: string, mention: MentionRange, memberName: string): string {
  return `${text.slice(0, mention.start)}@${memberName} ${text.slice(mention.end)}`;
}

export function MessageComposer({
  client,
  projectId,
  channelId,
  members,
  placeholder,
  submitLabel,
  sentLabel,
  sendingLabel,
  retryLabel,
  dismissLabel,
  mentionEmptyLabel,
  mentionLoadingLabel,
  onPosted,
}: MessageComposerProps) {
  const anchorRef = useRef<View | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const [text, setText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [status, setStatus] = useState<ComposerStatus>({ kind: "idle" });
  const activeMention = useMemo(
    () => findMentionRange(text, selectionStart),
    [selectionStart, text],
  );
  const mentionOptions = useMemo<AutocompleteOption[]>(() => {
    if (!activeMention) {
      return [];
    }
    const query = activeMention.query.trim().toLowerCase();
    return members
      .filter((member) => query.length === 0 || member.name.toLowerCase().includes(query))
      .map((member) => ({
        id: member.id,
        label: member.name,
        description: member.description ?? undefined,
      }));
  }, [activeMention, members]);

  const resetSuccess = useCallback(() => {
    setStatus((current) => (current.kind === "success" ? { kind: "idle" } : current));
  }, []);

  const handlePost = useCallback(
    async (draftText: string) => {
      const nextBody = draftText.trim();
      if (!client || !projectId || !channelId || nextBody.length === 0) {
        return;
      }
      setStatus({ kind: "pending" });
      try {
        const message = await postTeamMessage({
          client,
          projectId,
          channelId,
          body: nextBody,
        });
        setText("");
        setSelectionStart(0);
        setStatus({ kind: "success", label: sentLabel });
        if (message) {
          onPosted?.(message);
        }
      } catch (error) {
        setStatus({
          kind: "failure",
          label: error instanceof Error ? error.message : String(error),
          failedText: draftText,
        });
      }
    },
    [channelId, client, onPosted, projectId, sentLabel],
  );

  const handleSubmit = useCallback(() => {
    void handlePost(text);
  }, [handlePost, text]);

  const handleRetry = useCallback(() => {
    if (status.kind !== "failure") {
      return;
    }
    void handlePost(status.failedText);
  }, [handlePost, status]);

  const handleSelectMention = useCallback(
    (option: AutocompleteOption) => {
      if (!activeMention) {
        return;
      }
      const nextText = replaceMention(text, activeMention, option.label);
      setText(nextText);
      const nextSelection = activeMention.start + option.label.length + 2;
      setSelectionStart(nextSelection);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setNativeProps({
          selection: { start: nextSelection, end: nextSelection },
        });
      });
    },
    [activeMention, text],
  );

  const handleChangeText = useCallback(
    (nextText: string) => {
      setText(nextText);
      resetSuccess();
    },
    [resetSuccess],
  );

  const handleSelectionChange = useCallback(
    (event: { nativeEvent: { selection: { start: number } } }) => {
      setSelectionStart(event.nativeEvent.selection.start);
    },
    [],
  );

  const handleDismissError = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  const disabled =
    !client || !projectId || !channelId || text.trim().length === 0 || status.kind === "pending";

  return (
    <View style={styles.container}>
      <View ref={anchorRef} collapsable={false} style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          multiline
          value={text}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          placeholder={placeholder}
          style={styles.input}
          testID="team-message-composer-input"
        />
      </View>
      <View style={styles.footerRow}>
        <View style={styles.statusRow}>
          {status.kind === "pending" ? <StatusBadge label={sendingLabel} /> : null}
          {status.kind === "success" ? (
            <StatusBadge label={status.label} variant="success" />
          ) : null}
        </View>
        <Button
          variant="default"
          onPress={handleSubmit}
          disabled={disabled}
          loading={status.kind === "pending"}
          testID="team-message-composer-send"
        >
          {submitLabel}
        </Button>
      </View>
      {status.kind === "failure" ? (
        <View style={styles.errorCard} testID="team-message-post-error">
          <Text style={settingsStyles.rowError}>{status.label}</Text>
          <View style={styles.errorActions}>
            <Button variant="ghost" onPress={handleRetry}>
              {retryLabel}
            </Button>
            <Button variant="ghost" onPress={handleDismissError}>
              {dismissLabel}
            </Button>
          </View>
        </View>
      ) : null}
      <AutocompletePopover
        visible={Boolean(activeMention)}
        anchorRef={anchorRef}
        options={mentionOptions}
        selectedIndex={mentionOptions.length > 0 ? 0 : -1}
        onSelect={handleSelectMention}
        loadingText={mentionLoadingLabel}
        emptyText={mentionEmptyLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  inputWrap: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    minHeight: 120,
    padding: theme.spacing[3],
  },
  input: {
    minHeight: 96,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    textAlignVertical: "top",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 28,
  },
  errorCard: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.palette.red[800],
    backgroundColor: theme.colors.palette.red[900],
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  errorActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
