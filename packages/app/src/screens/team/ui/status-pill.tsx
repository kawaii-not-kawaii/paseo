import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { teamColors } from "@/screens/team/team-colors";
import type { TeamStatusTone } from "@/screens/team/ui/status-dot";

/**
 * The 20px status pill from the design's Members section.
 *
 * `you` renders as plain faint text rather than a pill — the human identity
 * carries a label ("built-in identity"), not a runtime state.
 */
export function TeamStatusPill({ tone, label }: { tone: TeamStatusTone; label: string }) {
  if (tone === "you") {
    return <Text style={styles.plain}>{label}</Text>;
  }

  return (
    <View style={pillStyle(tone)}>
      <Text style={textStyle(tone)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Read at render time so the style keeps its Unistyles theme tracking. */
function pillStyle(tone: TeamStatusTone) {
  switch (tone) {
    case "working":
      return styles.pillWorking;
    case "stopped":
      return styles.pillDanger;
    default:
      return styles.pillIdle;
  }
}

function textStyle(tone: TeamStatusTone) {
  switch (tone) {
    case "working":
      return styles.textWorking;
    case "stopped":
      return styles.textDanger;
    default:
      return styles.textIdle;
  }
}

const PILL_HEIGHT = 20;

const styles = StyleSheet.create((theme) => ({
  pillWorking: {
    height: PILL_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: teamColors.workingSurface,
  },
  pillIdle: {
    height: PILL_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  pillDanger: {
    height: PILL_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: teamColors.dangerSurface,
  },
  textWorking: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.palette.green[400],
  },
  textIdle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  textDanger: {
    fontSize: theme.fontSize.xs,
    color: teamColors.dangerText,
  },
  plain: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
  },
}));
