/**
 * The handful of design colors that have no theme token.
 *
 * Everything else in the Team design is already a theme token — `#181B1A` is
 * `surface0`, `#141716` is `surfaceSidebar`, `#20744A` is `accent`, `#7ccba0` is
 * `accentBright`, and so on. These five are tints and lightened variants the
 * theme does not carry, so they live here rather than as literals repeated
 * across the chat banner, task cards, and status pills.
 *
 * They are deliberately dark-theme values. The Team design was drawn for
 * Paseo's dark theme only; if Team ever needs a light theme, these become
 * theme tokens rather than gaining a second set of literals here.
 */
export const teamColors = {
  /** #e08b80 — destructive, lightened for text on a dark surface. */
  dangerText: "#e08b80",
  /** rgba(198,79,67,.12) — destructive at 12%, for the "needs a workspace" pill. */
  dangerSurface: "rgba(198, 79, 67, 0.12)",
  /** rgba(198,79,67,.45) — destructive at 45%, the escalation banner/card border. */
  dangerBorder: "rgba(198, 79, 67, 0.45)",
  /** rgba(34,197,94,.1) — green-500 at 10%, the "working" pill background. */
  workingSurface: "rgba(34, 197, 94, 0.1)",
  /** rgba(124,203,160,.35) — accentBright at 35%, the underline under a #NN task ref. */
  referenceUnderline: "rgba(124, 203, 160, 0.35)",
  /**
   * #239956 — the hover state of a primary/accent button.
   *
   * Not `theme.colors.accentBright`: in the dark theme that token is `#7ccba0`,
   * which is the design's link/mention color, a different role. The theme has no
   * accent-hover token, so it lives here.
   */
  accentHover: "#239956",
} as const;
