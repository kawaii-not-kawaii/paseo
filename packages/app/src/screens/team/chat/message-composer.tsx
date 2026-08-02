import { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { ArrowUp, AtSign } from "lucide-react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamMember, TeamMessage } from "@getpaseo/protocol/team/types";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { AutocompletePopover } from "@/components/ui/autocomplete-popover";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { postTeamMessage } from "@/screens/team/team-client";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { teamColors } from "@/screens/team/team-colors";
import { TEAM_MESSAGE_MAX_WIDTH, TEAM_SPACE } from "@/screens/team/team-layout";
import { TeamIconButton } from "@/screens/team/ui/icon-button";
import type { Theme } from "@/styles/theme";

const renderAtSign = ({ color, size }: { color: string; size: number }) => (
  <AtSign color={color} size={size} />
);

const ThemedArrowUp = withUnistyles(ArrowUp);
const sendIconColor = (theme: Theme) => ({ color: theme.colors.accentForeground });

/** 32x32 accent square with an arrow — the design's send affordance. */
function SendButton({
  onPress,
  disabled,
  accessibilityLabel,
}: {
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
}) {
  const buttonStyle = useCallback(
    ({ hovered }: { hovered?: boolean }) => [
      styles.send,
      Boolean(hovered) && !disabled && styles.sendHovered,
      disabled && styles.sendDisabled,
    ],
    [disabled],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={buttonStyle}
      testID="team-message-composer-send"
    >
      <ThemedArrowUp size={16} uniProps={sendIconColor} />
    </Pressable>
  );
}

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
  enterToSendLabel: string;
  mentionActionLabel: string;
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
  enterToSendLabel,
  mentionActionLabel,
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

  /**
   * Enter sends, Shift+Enter breaks the line — the behaviour the composer's own
   * "Enter to send" hint promises. `key` is only present on web; on native the
   * TextInput keeps its newline and the send button is the only path.
   */
  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const nativeEvent = event.nativeEvent as TextInputKeyPressEventData & {
        shiftKey?: boolean;
        preventDefault?: () => void;
      };
      if (nativeEvent.key !== "Enter" || nativeEvent.shiftKey) {
        return;
      }
      nativeEvent.preventDefault?.();
      void handlePost(text);
    },
    [handlePost, text],
  );

  /** Types the `@` that opens the mention autocomplete. */
  const handleInsertMention = useCallback(() => {
    setText((current) => {
      const needsSpace = current.length > 0 && !/\s$/.test(current);
      return `${current}${needsSpace ? " " : ""}@`;
    });
    setSelectionStart((current) => current + 1);
    inputRef.current?.focus();
  }, []);

  // The focus ring moves from the input to the box. A raw TextInput renders the
  // platform focus outline tight around itself, which reads as a stray
  // rectangle inside the composer rather than as the composer being focused —
  // the same reason `FormTextInput` zeroes it and styles its wrapper instead.
  const [isFocused, setIsFocused] = useState(false);
  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const disabled =
    !client || !projectId || !channelId || text.trim().length === 0 || status.kind === "pending";

  return (
    <View style={styles.container}>
      <View ref={anchorRef} collapsable={false} style={isFocused ? styles.boxFocused : styles.box}>
        <TextInput
          ref={inputRef}
          multiline
          value={text}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          onKeyPress={handleKeyPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={undefined}
          style={styles.input}
          testID="team-message-composer-input"
        />
        <View style={styles.toolbar}>
          <TeamIconButton
            icon={renderAtSign}
            size={28}
            onPress={handleInsertMention}
            accessibilityLabel={mentionActionLabel}
            testID="team-message-composer-mention"
          />
          <View style={styles.toolbarSpacer} />
          <View style={styles.statusRow}>
            {status.kind === "pending" ? <StatusBadge label={sendingLabel} /> : null}
            {status.kind === "success" ? (
              <StatusBadge label={status.label} variant="success" />
            ) : null}
          </View>
          <Text style={styles.hint}>{enterToSendLabel}</Text>
          <SendButton onPress={handleSubmit} disabled={disabled} accessibilityLabel={submitLabel} />
        </View>
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
    flexShrink: 0,
    paddingTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    paddingBottom: TEAM_SPACE.list,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  box: {
    width: "100%",
    maxWidth: TEAM_MESSAGE_MAX_WIDTH,
    alignSelf: "center",
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  boxFocused: {
    width: "100%",
    maxWidth: TEAM_MESSAGE_MAX_WIDTH,
    alignSelf: "center",
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface1,
  },
  input: {
    outlineWidth: 0,
    outlineColor: "transparent",
    minHeight: 44,
    maxHeight: 200,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingTop: 14,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[1.5],
    textAlignVertical: "top",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[1.5],
    paddingRight: TEAM_SPACE.snug,
    paddingBottom: TEAM_SPACE.snug,
    paddingLeft: theme.spacing[3],
  },
  toolbarSpacer: {
    flex: 1,
  },
  hint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
  },
  send: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.accent,
  },
  sendHovered: {
    backgroundColor: teamColors.accentHover,
  },
  sendDisabled: {
    opacity: theme.opacity[50],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
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
