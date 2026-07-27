import { memo } from "react";
import { Text, View } from "react-native";
import type { TeamMember } from "@getpaseo/protocol/team/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { StyleSheet } from "react-native-unistyles";

interface MemberActivityStripProps {
  members: TeamMember[];
  labels: {
    idle: string;
    working: string;
    stopped: string;
    unavailable: string;
  };
}

export const MemberActivityStrip = memo(function MemberActivityStrip({
  members,
  labels,
}: MemberActivityStripProps) {
  return (
    <View style={styles.container}>
      {members.map((member) => {
        const presentation = getMemberPresentation(member, labels);

        return (
          <View key={member.id} style={styles.item}>
            <Text style={styles.name} numberOfLines={1}>
              {member.name}
            </Text>
            <StatusBadge label={presentation.label} variant={presentation.variant} />
          </View>
        );
      })}
    </View>
  );
});

function getMemberPresentation(
  member: TeamMember,
  labels: MemberActivityStripProps["labels"],
): { label: string; variant: "success" | "error" | "muted" } {
  if (member.status === "running") {
    return { label: labels.working, variant: "success" };
  }
  if (member.status === "unavailable") {
    return { label: labels.unavailable, variant: "error" };
  }
  if (member.status === "stopped") {
    return { label: labels.stopped, variant: "muted" };
  }
  return { label: labels.idle, variant: "muted" };
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  name: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    maxWidth: 140,
  },
}));
