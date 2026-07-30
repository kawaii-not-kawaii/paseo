import { useEffect } from "react";
import { StyleSheet as RNStyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { TEAM_STATUS_DOT_SIZE } from "@/screens/team/team-layout";

/**
 * The four dot tones in the design. `you` is the human identity — a ring rather
 * than a filled dot, because the human is never "running".
 */
export type TeamStatusTone = "working" | "idle" | "stopped" | "you";

/**
 * The design's only animation: `@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`
 * at 2s on a member status dot, 1.4s on the "is running a command" presence dot.
 */
const PULSE_MIN_OPACITY = 0.35;
const PULSE_DURATION_MS = 2000;
const PULSE_FAST_DURATION_MS = 1400;

export function TeamStatusDot({
  tone,
  size = TEAM_STATUS_DOT_SIZE,
  fast = false,
}: {
  tone: TeamStatusTone;
  size?: number;
  fast?: boolean;
}) {
  const dot = <View style={toneStyle(tone)} />;

  if (tone !== "working") {
    return <View style={sizing(size)}>{dot}</View>;
  }

  return (
    <PulseWrapper size={size} fast={fast}>
      {dot}
    </PulseWrapper>
  );
}

/**
 * Reanimated and Unistyles both mutate the same native node, and applying a
 * themed `StyleSheet.create` style to an `Animated.View` crashes on theme change
 * (see docs/unistyles.md). So the animated wrapper carries plain RN styles and
 * opacity only — every themed value stays on the inner `View`.
 */
function PulseWrapper({
  size,
  fast,
  children,
}: {
  size: number;
  fast: boolean;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(PULSE_MIN_OPACITY, {
        duration: (fast ? PULSE_FAST_DURATION_MS : PULSE_DURATION_MS) / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [fast, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[sizing(size), animatedStyle]}>{children}</Animated.View>;
}

/**
 * Read at render time, never hoisted to module scope — a module-level read can
 * materialize the style under the wrong theme (see docs/unistyles.md).
 */
function toneStyle(tone: TeamStatusTone) {
  switch (tone) {
    case "working":
      return styles.working;
    case "stopped":
      return styles.stopped;
    case "you":
      return styles.you;
    default:
      return styles.idle;
  }
}

/**
 * Plain RN styles, cached per size. Kept off the Unistyles path so the animated
 * wrapper never carries a theme-dependent style.
 */
const sizingCache = new Map<number, { width: number; height: number }>();
function sizing(size: number) {
  let cached = sizingCache.get(size);
  if (!cached) {
    cached = RNStyleSheet.create({ dot: { width: size, height: size } }).dot;
    sizingCache.set(size, cached);
  }
  return cached;
}

const styles = StyleSheet.create((theme) => ({
  working: {
    flex: 1,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  idle: {
    flex: 1,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  stopped: {
    flex: 1,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.destructive,
  },
  you: {
    flex: 1,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.surface3,
  },
}));
