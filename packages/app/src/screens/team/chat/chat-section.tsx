import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import { Settings } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteTeamChannel, resumeTeamProject } from "@/screens/team/team-client";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useTeamMemberStatusLabels } from "@/screens/team/use-member-status-labels";
import {
  TEAM_SPACE,
  TEAM_MESSAGE_MAX_WIDTH,
  TEAM_STATUS_DOT_SIZE,
  TEAM_SUBHEADER_HEIGHT,
} from "@/screens/team/team-layout";
import { memberHandle } from "@/screens/team/member-status";
import { TeamStatusDot } from "@/screens/team/ui/status-dot";
import { EscalationBanner } from "./escalation-banner";
import { ChannelForm } from "./channel-form";
import { ChatRail } from "./chat-rail";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

/**
 * The Chat section: rail on the left, channel header + messages + composer on
 * the right.
 *
 * The right-hand column is a flex column with `minHeight: 0`, so the message
 * list scrolls inside the remaining space and the composer stays pinned to the
 * bottom. Scrolling the section as a whole would push the composer off-screen.
 */
export function TeamChatSection({
  client,
  projectId,
  channelId,
  channels,
  members,
  channelMembershipEnabled,
  error,
  escalatedTask,
  handbackLimit,
  onSelectChannel,
  onChannelsChanged,
  onOpenTasks,
  onEscalationResolved,
}: {
  client: DaemonClient | null;
  serverId: string | null;
  projectId: string;
  channelId: string | null;
  channels: TeamChannel[];
  members: TeamMember[];
  channelMembershipEnabled: boolean;
  error: string | null;
  escalatedTask: TeamTask | null;
  handbackLimit: number | null;
  onSelectChannel: (channelId: string) => void;
  onChannelsChanged: () => void | Promise<void>;
  onOpenTasks: () => void;
  onEscalationResolved: () => void;
}) {
  const { t } = useTranslation();
  const memberLabels = useTeamMemberStatusLabels();
  const [createVisible, setCreateVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<TeamChannel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const handleResume = useCallback(
    async (taskId: string) => {
      if (!client || isResuming) {
        return;
      }
      setIsResuming(true);
      setActionError(null);
      try {
        await resumeTeamProject({ client, projectId, taskId });
        onEscalationResolved();
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        setIsResuming(false);
      }
    },
    [client, isResuming, onEscalationResolved, projectId],
  );

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === channelId) ?? null,
    [channelId, channels],
  );
  const workingMember = useMemo(
    () => members.find((member) => member.kind === "agent" && member.status === "running") ?? null,
    [members],
  );
  const channelMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.kind === "human" || member.channelIds?.includes(activeChannel?.id ?? "") === true,
      ),
    [activeChannel?.id, members],
  );

  const handleOpenCreate = useCallback(() => setCreateVisible(true), []);
  const handleCloseCreate = useCallback(() => setCreateVisible(false), []);
  const handleOpenEdit = useCallback(() => {
    if (activeChannel) {
      setEditingChannel(activeChannel);
    }
  }, [activeChannel]);
  const handleCloseEdit = useCallback(() => setEditingChannel(null), []);

  const handleSaved = useCallback(
    async (channel: TeamChannel) => {
      setActionError(null);
      onSelectChannel(channel.id);
      await onChannelsChanged();
    },
    [onChannelsChanged, onSelectChannel],
  );

  const handleDelete = useCallback(async () => {
    if (!client || !activeChannel || isDeleting) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("team.chat.channel.deleteTitle", { name: activeChannel.name }),
      message: t("team.chat.channel.deleteMessage", { name: activeChannel.name }),
      confirmLabel: t("team.chat.channel.deleteConfirm"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setIsDeleting(true);
    setActionError(null);
    try {
      const deletedId = await deleteTeamChannel({
        client,
        projectId,
        channelId: activeChannel.id,
      });
      if (!deletedId) {
        throw new Error(t("team.chat.channel.unableToDelete"));
      }
      await onChannelsChanged();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsDeleting(false);
    }
  }, [activeChannel, client, isDeleting, onChannelsChanged, projectId, t]);

  const visibleError =
    actionError ?? error ?? (channelMembershipEnabled ? null : t("team.needsHostUpgrade"));

  return (
    <View style={styles.section}>
      <ChatRail
        channels={channels}
        members={members}
        activeChannelId={channelId}
        memberLabels={memberLabels}
        canCreateChannel={Boolean(client) && channelMembershipEnabled}
        onSelectChannel={onSelectChannel}
        onCreateChannel={handleOpenCreate}
      />

      <View style={styles.main}>
        <ChannelHeader
          channel={activeChannel}
          canManage={
            Boolean(client) && channelMembershipEnabled && activeChannel !== null && !isDeleting
          }
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
        />

        {visibleError ? (
          <View style={styles.errorRow}>
            <Text style={settingsStyles.rowError}>{visibleError}</Text>
          </View>
        ) : null}

        <MessageList
          client={client}
          projectId={projectId}
          channelId={channelId}
          emptyLabel={t("team.chat.emptyMessages")}
          loadOlderLabel={t("team.chat.loadOlder")}
          loadingLabel={t("common.states.loading")}
          retryLabel={t("common.actions.retry")}
        />

        {escalatedTask ? (
          <View style={styles.bannerSlot}>
            <EscalationBanner
              task={escalatedTask}
              handbackLimit={handbackLimit}
              onOpenTask={onOpenTasks}
              onResume={handleResume}
              isResuming={isResuming}
            />
          </View>
        ) : null}

        {workingMember ? <PresenceLine member={workingMember} /> : null}

        <MessageComposer
          client={client}
          projectId={projectId}
          channelId={channelId}
          members={channelMembers}
          placeholder={
            activeChannel
              ? t("team.chat.composerPlaceholder", { channel: activeChannel.name })
              : t("team.chat.placeholder")
          }
          submitLabel={t("team.chat.send")}
          sentLabel={t("team.chat.sent")}
          sendingLabel={t("team.chat.sending")}
          retryLabel={t("common.actions.retry")}
          dismissLabel={t("common.actions.dismiss")}
          mentionEmptyLabel={t("team.chat.noMentions")}
          mentionLoadingLabel={t("common.states.loading")}
          enterToSendLabel={t("team.chat.enterToSend")}
          mentionActionLabel={t("team.chat.insertMention")}
        />
      </View>

      <ChannelForm
        visible={createVisible}
        mode="create"
        client={client}
        projectId={projectId}
        channels={channels}
        members={members}
        onClose={handleCloseCreate}
        onSaved={handleSaved}
      />
      <ChannelForm
        visible={editingChannel !== null}
        mode="edit"
        client={client}
        projectId={projectId}
        channel={editingChannel}
        channels={channels}
        members={members}
        onClose={handleCloseEdit}
        onSaved={handleSaved}
      />
    </View>
  );
}

function PresenceLine({ member }: { member: TeamMember }) {
  const { t } = useTranslation();
  return (
    <View style={styles.presence}>
      <TeamStatusDot tone="working" size={TEAM_STATUS_DOT_SIZE - 1} fast />
      <Text style={styles.presenceText}>
        {t("team.chat.memberWorking", { member: memberHandle(member) })}
      </Text>
    </View>
  );
}

/**
 * The 36px channel header.
 *
 * The manage menu hangs off the settings icon here rather than off a per-row
 * kebab in the rail. That matches the design, and it removes the trap where a
 * kebab looks per-row but acts on whichever channel is selected.
 */
function ChannelHeader({
  channel,
  canManage,
  onEdit,
  onDelete,
}: {
  channel: TeamChannel | null;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.channelHeader}>
      <Text style={styles.channelName} numberOfLines={1}>
        {channel ? `#${channel.name}` : ""}
      </Text>
      {channel?.purpose ? (
        <Text style={styles.channelPurpose} numberOfLines={1}>
          {channel.purpose}
        </Text>
      ) : null}
      <View style={styles.channelHeaderSpacer} />
      <DropdownMenu>
        <DropdownMenuTrigger
          style={styles.manageTrigger}
          disabled={!canManage}
          accessibilityLabel={t("team.chat.channel.manage")}
          testID="team-channel-manage-button"
        >
          <ChannelManageIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem onSelect={onEdit} testID="team-channel-edit-action">
            {t("team.chat.channel.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete} destructive testID="team-channel-delete-action">
            {t("team.chat.channel.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function ChannelManageIcon() {
  return <ThemedSettings size={14} uniProps={faintIcon} />;
}

const ThemedSettings = withUnistyles(Settings);
const faintIcon = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

const styles = StyleSheet.create((theme) => ({
  section: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "column",
  },
  channelHeader: {
    height: TEAM_SUBHEADER_HEIGHT,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: TEAM_SPACE.snug,
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  channelName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  channelPurpose: {
    flexShrink: 1,
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
  },
  channelHeaderSpacer: {
    flex: 1,
  },
  manageTrigger: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  manageIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorRow: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  bannerSlot: {
    flexShrink: 0,
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[3],
  },
  presence: {
    maxWidth: TEAM_MESSAGE_MAX_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[2],
  },
  presenceText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
