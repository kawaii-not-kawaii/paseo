import { useCallback } from "react";
import { Text, View } from "react-native";
import type { TeamTask } from "@getpaseo/protocol/team/types";
import { TriangleAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { teamColors } from "@/screens/team/team-colors";
import { TEAM_LINE_HEIGHT, TEAM_MESSAGE_MAX_WIDTH, TEAM_SPACE } from "@/screens/team/team-layout";

/**
 * The in-channel escalation banner.
 *
 * One escalation, three surfaces — this banner, the task card, and (not built
 * here) the sidebar callout. There is deliberately no separate inbox: an
 * escalation appears where the work is already being read.
 *
 * It renders at the foot of the message list rather than pinned above it,
 * because it is a thing that just happened in the conversation, not a
 * persistent chrome element.
 */
export function EscalationBanner({
  task,
  handbackLimit,
  onOpenTask,
  onResume,
  isResuming,
}: {
  task: TeamTask;
  handbackLimit: number | null;
  onOpenTask: (taskId: string) => void;
  onResume: (taskId: string) => void;
  isResuming: boolean;
}) {
  const { t } = useTranslation();
  const handleOpen = useCallback(() => onOpenTask(task.id), [onOpenTask, task.id]);
  const handleResume = useCallback(() => onResume(task.id), [onResume, task.id]);

  return (
    <View style={styles.banner} testID={`team-escalation-banner-${task.id}`}>
      <View style={styles.icon}>
        <TriangleAlert size={16} color={iconStyles.danger.color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{t("team.escalation.bannerTitle", { ref: task.seq })}</Text>
        <Text style={styles.body}>
          {t("team.escalation.bannerBody", {
            count: task.handbackCount,
            limit: handbackLimit ?? task.handbackCount,
          })}
        </Text>
        <View style={styles.actions}>
          <Button variant="outline" size="sm" onPress={handleOpen}>
            {t("team.escalation.readAttempts")}
          </Button>
          <Button variant="default" size="sm" onPress={handleResume} loading={isResuming}>
            {t("team.escalation.resume")}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  banner: {
    maxWidth: TEAM_MESSAGE_MAX_WIDTH,
    flexDirection: "row",
    gap: theme.spacing[3],
    paddingVertical: 14,
    paddingHorizontal: theme.spacing[4],
    borderWidth: 1,
    borderColor: teamColors.dangerBorder,
    borderRadius: theme.borderRadius.xl,
  },
  icon: {
    flexShrink: 0,
    marginTop: 2,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
  },
  body: {
    marginTop: theme.spacing[1],
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * TEAM_LINE_HEIGHT.help,
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
    marginTop: TEAM_SPACE.hairline * 6,
  },
}));

const iconStyles = StyleSheet.create((theme) => ({
  danger: {
    color: theme.colors.destructive,
  },
}));
