/* eslint-disable react/no-array-index-key, react-perf/jsx-no-new-function-as-prop */
import { Fragment, useMemo } from "react";
import { Text } from "react-native";
import type { TeamChannel, TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import { StyleSheet } from "react-native-unistyles";

type ReferenceTarget =
  | { kind: "task"; taskId: string }
  | { kind: "channel"; channelId: string }
  | { kind: "member"; memberId: string };

const REFERENCE_PATTERN = /([#@][A-Za-z0-9._-]+)/g;

export function InlineReferenceText({
  text,
  channels,
  members,
  tasks,
  onPressReference,
}: {
  text: string;
  channels: TeamChannel[];
  members: TeamMember[];
  tasks: TeamTask[];
  onPressReference: (target: ReferenceTarget) => void;
}) {
  const channelsByName = useMemo(
    () => new Map(channels.map((channel) => [channel.name.toLowerCase(), channel] as const)),
    [channels],
  );
  const membersByName = useMemo(
    () => new Map(members.map((member) => [member.name.toLowerCase(), member] as const)),
    [members],
  );
  const tasksBySeq = useMemo(
    () => new Map(tasks.map((task) => [String(task.seq), task] as const)),
    [tasks],
  );
  const segments = useMemo(() => text.split(REFERENCE_PATTERN), [text]);

  return (
    <Text style={styles.body}>
      {segments.map((segment, index) => {
        const target = resolveReferenceTarget(segment, channelsByName, membersByName, tasksBySeq);
        if (!target) {
          return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
        }
        return (
          <Text
            key={`${segment}-${index}`}
            style={styles.link}
            onPress={() => onPressReference(target)}
          >
            {segment}
          </Text>
        );
      })}
    </Text>
  );
}

function resolveReferenceTarget(
  token: string,
  channelsByName: Map<string, TeamChannel>,
  membersByName: Map<string, TeamMember>,
  tasksBySeq: Map<string, TeamTask>,
): ReferenceTarget | null {
  if (token.startsWith("#")) {
    const identifier = token.slice(1);
    if (/^\d+$/.test(identifier)) {
      const task = tasksBySeq.get(identifier);
      return task ? { kind: "task", taskId: task.id } : null;
    }
    const channel = channelsByName.get(identifier.toLowerCase());
    return channel ? { kind: "channel", channelId: channel.id } : null;
  }
  if (token.startsWith("@")) {
    const member = membersByName.get(token.slice(1).toLowerCase());
    return member ? { kind: "member", memberId: member.id } : null;
  }
  return null;
}

const styles = StyleSheet.create((theme) => ({
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
  link: {
    color: theme.colors.accent,
  },
}));
