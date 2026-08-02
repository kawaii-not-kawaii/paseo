import { useCallback, useMemo, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TEAM_SPACE } from "@/screens/team/team-layout";
import type { Theme } from "@/styles/theme";

/**
 * A segmented control drawn as a filled shell with a raised active pill.
 *
 * This is deliberately not `@/components/ui/segmented-control`. That one is a
 * pill control — transparent shell, fully-rounded segments, a `foreground`
 * (white) active segment. The Team design uses the opposite idiom: a `surface1`
 * shell with a `surface3` active segment on rounded rectangles. Adding a variant
 * prop to the shared control would mean editing an upstream-owned file for a
 * fork feature, which docs/fork.md rules out, so the fork owns this shape.
 *
 * Two sizes, both from the design: `md` is the 28/24 section switcher, `sm` is
 * the 26/22 Board/List switcher in the tasks toolbar.
 */
export interface SegmentedShellOption<T extends string> {
  value: T;
  label: string;
  icon?: (props: { color: string; size: number }) => ReactNode;
  testID?: string;
}

export function SegmentedShell<T extends string>({
  options,
  value,
  onValueChange,
  size = "md",
  testID,
}: {
  options: SegmentedShellOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  size?: "sm" | "md";
  testID?: string;
}) {
  return (
    <View style={size === "sm" ? styles.shellSm : styles.shellMd} testID={testID}>
      {options.map((option) => (
        <SegmentedShellItem
          key={option.value}
          option={option}
          size={size}
          selected={option.value === value}
          onValueChange={onValueChange}
        />
      ))}
    </View>
  );
}

function SegmentedShellItem<T extends string>({
  option,
  size,
  selected,
  onValueChange,
}: {
  option: SegmentedShellOption<T>;
  size: "sm" | "md";
  selected: boolean;
  onValueChange: (value: T) => void;
}) {
  const handlePress = useCallback(() => {
    if (!selected) {
      onValueChange(option.value);
    }
  }, [onValueChange, option.value, selected]);

  // Self-styling hover through the render prop — the preferred form in
  // docs/hover.md, and safe here because nothing pressable nests inside.
  const segmentStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      size === "sm" ? styles.segmentSm : styles.segmentMd,
      selected && styles.segmentSelected,
      Boolean(hovered) && !selected && styles.segmentHover,
    ],
    [selected, size],
  );

  const accessibilityState = useMemo(() => ({ selected }), [selected]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      aria-selected={selected}
      onPress={handlePress}
      style={segmentStyle}
      testID={option.testID}
    >
      {option.icon ? (
        <ThemedSegmentedShellIcon
          render={option.icon}
          uniProps={selected ? selectedIconColor : mutedIconColor}
        />
      ) : null}
      <Text style={labelStyle(size, selected)} numberOfLines={1}>
        {option.label}
      </Text>
    </Pressable>
  );
}

/** Read at render time so the style keeps its Unistyles theme tracking. */
function labelStyle(size: "sm" | "md", selected: boolean) {
  if (size === "sm") {
    return selected ? styles.labelSmSelected : styles.labelSm;
  }
  return selected ? styles.labelMdSelected : styles.labelMd;
}

/**
 * Icons take their color as a React prop, which is off the Unistyles native
 * update path. `withUnistyles` re-renders just this leaf on a theme change —
 * the pattern docs/unistyles.md prescribes for exactly this case.
 */
function SegmentedShellIcon({
  render,
  iconColor,
}: {
  render: (props: { color: string; size: number }) => ReactNode;
  iconColor: string;
}) {
  return <View style={styles.icon}>{render({ color: iconColor, size: SEGMENT_ICON_SIZE })}</View>;
}

const ThemedSegmentedShellIcon = withUnistyles(SegmentedShellIcon);

const selectedIconColor = (theme: Theme) => ({ iconColor: theme.colors.foreground });
const mutedIconColor = (theme: Theme) => ({ iconColor: theme.colors.foregroundMuted });

const SEGMENT_ICON_SIZE = 14;

const styles = StyleSheet.create((theme) => ({
  shellMd: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    height: 28,
    padding: 2,
    gap: 2,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  shellSm: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    height: 26,
    padding: 2,
    gap: 2,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  segmentMd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 24,
    gap: theme.spacing[1.5],
    paddingHorizontal: TEAM_SPACE.snug,
    borderRadius: theme.borderRadius.md,
  },
  segmentSm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
    gap: theme.spacing[1.5],
    paddingHorizontal: TEAM_SPACE.snug,
    borderRadius: theme.borderRadius.base,
  },
  segmentSelected: {
    backgroundColor: theme.colors.surface3,
  },
  segmentHover: {
    backgroundColor: theme.colors.surface2,
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelMd: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  labelMdSelected: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  labelSm: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  labelSmSelected: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foreground,
  },
}));
