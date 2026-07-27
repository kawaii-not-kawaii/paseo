import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { TeamChannel } from "@getpaseo/protocol/team/types";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";

interface ChannelListProps {
  channels: TeamChannel[];
  activeChannelId: string | null;
  emptyLabel: string;
  onSelect: (channelId: string) => void;
}

export const ChannelList = memo(function ChannelList({
  channels,
  activeChannelId,
  emptyLabel,
  onSelect,
}: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowHint}>{emptyLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
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
