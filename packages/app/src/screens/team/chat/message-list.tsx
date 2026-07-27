import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamMessage } from "@getpaseo/protocol/team/types";
import type { TeamMessagePosted } from "@getpaseo/protocol/team/rpc-schemas";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { listTeamMessages } from "@/screens/team/team-client";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";

const PAGE_SIZE = 40;

interface MessageListProps {
  client: DaemonClient | null;
  projectId: string | null;
  channelId: string | null;
  emptyLabel: string;
  loadOlderLabel: string;
  loadingLabel: string;
  retryLabel: string;
}

function compareMessages(left: TeamMessage, right: TeamMessage): number {
  const time = left.createdAt.localeCompare(right.createdAt);
  if (time !== 0) {
    return time;
  }
  return left.id.localeCompare(right.id);
}

function mergeMessages(current: TeamMessage[], incoming: TeamMessage[]): TeamMessage[] {
  const byId = new Map(current.map((message) => [message.id, message] as const));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort(compareMessages);
}

export function MessageList({
  client,
  projectId,
  channelId,
  emptyLabel,
  loadOlderLabel,
  loadingLabel,
  retryLabel,
}: MessageListProps) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (before?: string) => {
      if (!client || !projectId || !channelId) {
        setMessages([]);
        setNextCursor(null);
        return;
      }
      const response = await listTeamMessages({
        client,
        projectId,
        channelId,
        before,
        limit: PAGE_SIZE,
      });
      setNextCursor(response.nextCursor);
      setMessages((current) =>
        before ? mergeMessages(current, response.messages) : response.messages,
      );
    },
    [channelId, client, projectId],
  );

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadPage();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [loadPage]);

  const handleLoadOlder = useCallback(async () => {
    if (!nextCursor) {
      return;
    }
    setIsLoadingOlder(true);
    setError(null);
    try {
      await loadPage(nextCursor);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsLoadingOlder(false);
    }
  }, [loadPage, nextCursor]);

  const handleRetry = useCallback(() => {
    void loadInitial();
  }, [loadInitial]);

  const handleLoadOlderPress = useCallback(() => {
    void handleLoadOlder();
  }, [handleLoadOlder]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!client || !projectId || !channelId) {
      return;
    }
    return client.on("team.message.posted", (event: TeamMessagePosted) => {
      if (event.payload.projectId !== projectId || event.payload.message.channelId !== channelId) {
        return;
      }
      setMessages((current) => mergeMessages(current, [event.payload.message]));
    });
  }, [channelId, client, projectId]);

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <LoadingSpinner size="large" color={stylesTheme.spinner.color} />
          <Text style={styles.muted}>{loadingLabel}</Text>
        </View>
      );
    }
    if (error && messages.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={settingsStyles.rowError}>{error}</Text>
          <Button variant="ghost" onPress={handleRetry}>
            {retryLabel}
          </Button>
        </View>
      );
    }
    if (messages.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.muted}>{emptyLabel}</Text>
        </View>
      );
    }
    return (
      <>
        {nextCursor ? (
          <View style={styles.loadOlderRow}>
            <Button variant="ghost" onPress={handleLoadOlderPress} loading={isLoadingOlder}>
              {loadOlderLabel}
            </Button>
          </View>
        ) : null}
        {messages.map((message) => (
          <View key={message.id} style={styles.messageCard}>
            <View style={styles.messageMetaRow}>
              <Text style={styles.author}>{message.authorMemberId}</Text>
              <Text style={styles.timestamp}>{new Date(message.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={styles.body}>{message.body}</Text>
          </View>
        ))}
      </>
    );
  }, [
    emptyLabel,
    error,
    handleLoadOlderPress,
    handleRetry,
    isLoading,
    isLoadingOlder,
    loadOlderLabel,
    loadingLabel,
    messages,
    nextCursor,
    retryLabel,
  ]);

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scrollView: {
    flex: 1,
  },
  content: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[4],
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    minHeight: 220,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  loadOlderRow: {
    alignItems: "center",
  },
  messageCard: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  messageMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  author: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  timestamp: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
}));

const stylesTheme = StyleSheet.create((theme) => ({
  spinner: {
    color: theme.colors.foregroundMuted,
  },
}));
