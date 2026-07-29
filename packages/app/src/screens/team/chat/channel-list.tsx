import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel } from "@getpaseo/protocol/team/types";
import { Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { ChannelForm } from "./channel-form";

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
  const handleOpenCreate = useCallback(() => setCreateVisible(true), []);
  const handleCloseCreate = useCallback(() => setCreateVisible(false), []);
  const handleCreated = useCallback(
    async (channel: TeamChannel) => {
      onSelect(channel.id);
      await onChannelsChanged();
    },
    [onChannelsChanged, onSelect],
  );

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
      {channelRows}
      <ChannelForm
        visible={createVisible}
        client={client}
        projectId={projectId}
        onClose={handleCloseCreate}
        onCreated={handleCreated}
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
