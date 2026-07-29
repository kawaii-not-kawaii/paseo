import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel } from "@getpaseo/protocol/team/types";
import { MoreHorizontal, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteTeamChannel } from "@/screens/team/team-client";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";
import { ChannelForm } from "./channel-form";

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface ChannelListProps {
  client: DaemonClient | null;
  projectId: string;
  channels: TeamChannel[];
  activeChannelId: string | null;
  emptyLabel: string;
  onSelect: (channelId: string) => void;
  onChannelsChanged: () => void | Promise<void>;
}

export const ChannelList = memo(function ChannelList({
  client,
  projectId,
  channels,
  activeChannelId,
  emptyLabel,
  onSelect,
  onChannelsChanged,
}: ChannelListProps) {
  const { t } = useTranslation();
  const [createVisible, setCreateVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<TeamChannel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels],
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
      onSelect(channel.id);
      await onChannelsChanged();
    },
    [onChannelsChanged, onSelect],
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
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }, [activeChannel, client, isDeleting, onChannelsChanged, projectId, t]);

  const channelRows =
    channels.length === 0 ? (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowHint}>{emptyLabel}</Text>
          </View>
        </View>
      </View>
    ) : (
      <View style={settingsStyles.card}>
        {channels.map((channel, index) => {
          const isActive = channel.id === activeChannelId;
          return (
            <ChannelRow
              key={channel.id}
              channel={channel}
              bordered={index > 0}
              isActive={isActive}
              onSelect={onSelect}
            />
          );
        })}
      </View>
    );

  return (
    <View style={styles.container}>
      <View style={styles.actionsRow}>
        <DropdownMenu>
          <DropdownMenuTrigger
            style={styles.manageTrigger}
            disabled={!client || !activeChannel || isDeleting}
            accessibilityLabel={t("team.chat.channel.manage")}
            testID="team-channel-manage-button"
          >
            <ThemedMoreHorizontal size={18} uniProps={mutedIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onSelect={handleOpenEdit} testID="team-channel-edit-action">
              {t("team.chat.channel.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={handleDelete}
              destructive
              testID="team-channel-delete-action"
            >
              {t("team.chat.channel.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={Plus}
          onPress={handleOpenCreate}
          disabled={!client}
          testID="team-channel-create-button"
        >
          {t("team.chat.channel.new")}
        </Button>
      </View>
      {actionError ? (
        <Text style={settingsStyles.rowError} testID="team-channel-action-error">
          {actionError}
        </Text>
      ) : null}
      {channelRows}
      <ChannelForm
        visible={createVisible}
        mode="create"
        client={client}
        projectId={projectId}
        channels={channels}
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
        onClose={handleCloseEdit}
        onSaved={handleSaved}
      />
    </View>
  );
});

const ChannelRow = memo(function ChannelRow({
  channel,
  bordered,
  isActive,
  onSelect,
}: {
  channel: TeamChannel;
  bordered: boolean;
  isActive: boolean;
  onSelect: (channelId: string) => void;
}) {
  const handlePress = useCallback(() => {
    onSelect(channel.id);
  }, [channel.id, onSelect]);
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
      settingsStyles.row,
      bordered ? settingsStyles.rowBorder : null,
      isActive ? styles.activeRow : null,
      hovered && !isActive ? styles.hoverRow : null,
      pressed && !isActive ? styles.pressedRow : null,
    ],
    [bordered, isActive],
  );

  return (
    <Pressable
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      testID={`team-channel-${channel.id}`}
    >
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>#{channel.name}</Text>
        {channel.purpose ? <Text style={settingsStyles.rowHint}>{channel.purpose}</Text> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[2],
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  manageTrigger: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface3,
  },
  activeRow: {
    backgroundColor: theme.colors.surface2,
  },
  hoverRow: {
    backgroundColor: theme.colors.surface2,
  },
  pressedRow: {
    backgroundColor: theme.colors.surface3,
  },
}));
