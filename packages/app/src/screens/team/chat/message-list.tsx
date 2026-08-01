/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember, TeamMessage, TeamTask } from "@getpaseo/protocol/team/types";
import type {
  TeamMemberChanged,
  TeamMessagePosted,
  TeamTaskChanged,
} from "@getpaseo/protocol/team/rpc-schemas";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { listTeamChannels, listTeamMembers, listTeamMessages } from "@/screens/team/team-client";
import { memberHandle } from "@/screens/team/member-status";
import {
  TEAM_CHAT_AUTO_SCROLL_THRESHOLD,
  TEAM_MESSAGE_MAX_WIDTH,
  TEAM_SPACE,
} from "@/screens/team/team-layout";
import { InlineReferenceText } from "@/screens/team/tasks/inline-reference-text";
import { ReferenceSheet } from "@/screens/team/tasks/reference-sheet";
import { TaskDetailSheet } from "@/screens/team/tasks/task-detail";
import { listTeamTasks } from "@/screens/team/tasks/team-tasks-client";
import { useTranslation } from "react-i18next";
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
  scrollToMessageId: string | null;
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
  scrollToMessageId,
}: MessageListProps) {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const shouldStickToBottomRef = useRef(true);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [referenceSheetState, setReferenceSheetState] = useState<{
    title: string;
    subtitle: string;
    body: string | null;
  } | null>(null);

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

  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: false });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    shouldStickToBottomRef.current =
      contentSize.height - layoutMeasurement.height - contentOffset.y <=
      TEAM_CHAT_AUTO_SCROLL_THRESHOLD;
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [scrollToBottom]);

  const loadReferences = useCallback(async () => {
    if (!client || !projectId) {
      setChannels([]);
      setMembers([]);
      setTasks([]);
      return;
    }
    try {
      const [nextChannels, nextMembers, nextTasks] = await Promise.all([
        listTeamChannels(client, projectId),
        listTeamMembers(client, projectId),
        listTeamTasks({ client, projectId }),
      ]);
      setChannels(nextChannels);
      setMembers(nextMembers);
      setTasks(nextTasks);
    } catch {
      // Keep message history readable even if one reference dataset fails.
    }
  }, [client, projectId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    scrollToBottom();
  }, [channelId, scrollToBottom]);

  useEffect(() => {
    if (!scrollToMessageId) {
      return;
    }
    shouldStickToBottomRef.current = true;
    scrollToBottom();
  }, [scrollToBottom, scrollToMessageId]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

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

  useEffect(() => {
    if (!client || !projectId) {
      return;
    }
    const unsubTask = client.on("team.task.changed", (event: TeamTaskChanged) => {
      if (event.payload.projectId !== projectId) {
        return;
      }
      setTasks((current) => upsertTask(current, event.payload.task));
    });
    const unsubMember = client.on("team.member.changed", (event: TeamMemberChanged) => {
      if (event.payload.projectId !== projectId) {
        return;
      }
      setMembers((current) => upsertMember(current, event.payload.member));
    });
    return () => {
      unsubTask();
      unsubMember();
    };
  }, [client, projectId]);

  const handleReferencePress = useCallback(
    (
      target:
        | { kind: "task"; taskId: string }
        | { kind: "channel"; channelId: string }
        | { kind: "member"; memberId: string },
    ) => {
      if (target.kind === "task") {
        setSelectedTaskId(target.taskId);
        return;
      }
      if (target.kind === "channel") {
        const channel = channels.find((entry) => entry.id === target.channelId);
        setReferenceSheetState({
          title: channel ? `#${channel.name}` : "#channel",
          subtitle: t("team.tasks.references.channel"),
          body: channel?.purpose ?? null,
        });
        return;
      }
      const member = members.find((entry) => entry.id === target.memberId);
      setReferenceSheetState({
        title: member ? `@${member.name}` : "@member",
        subtitle: t("team.tasks.references.member"),
        body: member?.description ?? null,
      });
    },
    [channels, members, t],
  );

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
            <Button
              variant="ghost"
              size="xs"
              onPress={handleLoadOlderPress}
              loading={isLoadingOlder}
            >
              {loadOlderLabel}
            </Button>
          </View>
        ) : null}
        {messages.map((message) => (
          <View key={message.id} style={styles.message}>
            {/*
              Author and time share a baseline, so the 12px timestamp sits on the
              same line as the 14px author rather than centering against it.
            */}
            <View style={styles.messageMetaRow}>
              <Text style={styles.author}>{formatAuthor(members, message.authorMemberId)}</Text>
              <Text style={styles.timestamp}>{formatMessageTime(message.createdAt)}</Text>
            </View>
            <InlineReferenceText
              text={message.body}
              channels={channels}
              members={members}
              tasks={tasks}
              onPressReference={handleReferencePress}
            />
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
    members,
    nextCursor,
    retryLabel,
    channels,
    tasks,
    handleReferencePress,
  ]);

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        testID="team-message-list"
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        // Without this, iOS fires onScroll once per gesture rather than continuously, so the
        // stick-to-bottom decision below would be made from a stale offset.
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
      >
        {content}
      </ScrollView>
      <TaskDetailSheet
        visible={selectedTaskId !== null}
        client={client}
        projectId={projectId}
        taskId={selectedTaskId}
        tasks={tasks}
        members={members}
        onClose={() => setSelectedTaskId(null)}
        onTaskChange={(task) => {
          setTasks((current) => upsertTask(current, task));
        }}
      />
      <ReferenceSheet
        visible={referenceSheetState !== null}
        title={referenceSheetState?.title ?? ""}
        subtitle={referenceSheetState?.subtitle ?? ""}
        body={referenceSheetState?.body ?? null}
        onClose={() => setReferenceSheetState(null)}
      />
    </>
  );
}

/** Members render as `@handle` throughout the Team surface. */
function formatAuthor(members: TeamMember[], authorMemberId: string): string {
  const member = members.find((entry) => entry.id === authorMemberId);
  if (!member) {
    return authorMemberId;
  }
  return memberHandle(member);
}

/**
 * The design shows a bare wall-clock time ("11:01") beside the author, not a
 * full timestamp — messages are grouped by channel, not by day, so the date
 * adds noise to every row.
 */
function formatMessageTime(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function upsertTask(current: TeamTask[], task: TeamTask): TeamTask[] {
  const next = new Map(current.map((entry) => [entry.id, entry] as const));
  next.set(task.id, task);
  return Array.from(next.values()).sort(compareTasksBySeq);
}

function compareTasksBySeq(left: TeamTask, right: TeamTask): number {
  return left.seq - right.seq;
}

function upsertMember(current: TeamMember[], member: TeamMember): TeamMember[] {
  const next = new Map(current.map((entry) => [entry.id, entry] as const));
  next.set(member.id, member);
  return Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
}

const styles = StyleSheet.create((theme) => ({
  scrollView: {
    flex: 1,
  },
  content: {
    gap: TEAM_SPACE.message,
    paddingVertical: TEAM_SPACE.list,
    paddingHorizontal: theme.spacing[6],
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
  message: {
    // Centred, matching `streamItemWrapper` in agent-stream. Capping without
    // centring strands the column against one edge on a wide window and makes
    // collapsing the sidebar look like it did nothing.
    width: "100%",
    maxWidth: TEAM_MESSAGE_MAX_WIDTH,
    alignSelf: "center",
    gap: 5,
  },
  messageMetaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[2],
  },
  author: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  timestamp: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
}));

const stylesTheme = StyleSheet.create((theme) => ({
  spinner: {
    color: theme.colors.foregroundMuted,
  },
}));
