import { useCallback, type ReactNode } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

/**
 * The design's ghost icon button: a square tile that tints its background on
 * hover and nothing else. Two sizes — 24px inside rail and channel headers,
 * 28px in the page header and composer toolbar.
 *
 * `surface` picks the hover tint, because the design uses a different one on
 * rail backgrounds (`surfaceSidebarHover`) than on content (`surface1`).
 */
export function TeamIconButton({
  icon,
  onPress,
  size = 28,
  surface = "content",
  accessibilityLabel,
  disabled = false,
  testID,
}: {
  icon: (props: { color: string; size: number }) => ReactNode;
  onPress?: () => void;
  size?: 24 | 28;
  surface?: "content" | "rail";
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}) {
  const buttonStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      size === 24 ? styles.button24 : styles.button28,
      Boolean(hovered) &&
        !disabled &&
        (surface === "rail" ? styles.hoverRail : styles.hoverContent),
      disabled && styles.disabled,
    ],
    [disabled, size, surface],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={buttonStyle}
      testID={testID}
    >
      <ThemedTeamIcon render={icon} iconSize={size === 24 ? 14 : 16} uniProps={faintIconColor} />
    </Pressable>
  );
}

/** Icon color rides a `withUnistyles` leaf — see docs/unistyles.md. */
function TeamIcon({
  render,
  iconSize,
  iconColor,
}: {
  render: (props: { color: string; size: number }) => ReactNode;
  iconSize: number;
  iconColor: string;
}) {
  return <View>{render({ color: iconColor, size: iconSize })}</View>;
}

const ThemedTeamIcon = withUnistyles(TeamIcon);

const faintIconColor = (theme: Theme) => ({ iconColor: theme.colors.foregroundExtraMuted });

const styles = StyleSheet.create((theme) => ({
  button24: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  button28: {
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  hoverContent: {
    backgroundColor: theme.colors.surface1,
  },
  hoverRail: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
}));
