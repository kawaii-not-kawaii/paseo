/**
 * Fixed measurements for the Team surface, from the design handoff
 * (`design_handoff_paseo_team_tab/README.md`, drawn at 1440x900).
 *
 * Values that already exist as app-wide constants are re-exported rather than
 * redeclared — the design was drawn from Paseo's real numbers, so the header,
 * sub-header, message width and roster width all match what the app already
 * uses. Only the measurements with no existing home are declared here.
 *
 * Colors deliberately do NOT live here. Every color in the design is already a
 * theme token (`#181B1A` is `surface0`, `#141716` is `surfaceSidebar`, and so
 * on), so styles read them from the theme and this file stays layout-only.
 */

import {
  HEADER_INNER_HEIGHT,
  MAX_CONTENT_WIDTH,
  SETTINGS_DESKTOP_SIDEBAR_WIDTH,
  WORKSPACE_SECONDARY_HEADER_HEIGHT,
} from "@/constants/layout";

/** 48px. Header row, and the sidebar's top spacer that aligns with it. */
export const TEAM_HEADER_HEIGHT = HEADER_INNER_HEIGHT;

/** 36px. Section switcher, channel header, and the tasks toolbar. */
export const TEAM_SUBHEADER_HEIGHT = WORKSPACE_SECONDARY_HEADER_HEIGHT;

/** 820px. Message bodies and the composer wrap here. */
export const TEAM_MESSAGE_MAX_WIDTH = MAX_CONTENT_WIDTH;

/** Keep following chat output while the viewport is within 64px of the bottom. */
export const TEAM_CHAT_AUTO_SCROLL_THRESHOLD = 64;

/** 320px. Members roster column. */
export const TEAM_ROSTER_WIDTH = SETTINGS_DESKTOP_SIDEBAR_WIDTH;

/** 240px. Chat's channel + member column. */
export const TEAM_CHANNEL_COLUMN_WIDTH = 240;

/** 280px. One Kanban column on the tasks board. */
export const TEAM_TASK_COLUMN_WIDTH = 280;

/** 720px. Members detail pane and the settings body. */
export const TEAM_CONTENT_MAX_WIDTH = 720;

/** Status dot beside a member handle or workspace name. */
export const TEAM_STATUS_DOT_SIZE = 7;

/** Unread / activity dot pinned to the right of a row. */
export const TEAM_UNREAD_DOT_SIZE = 6;

/**
 * Spacing steps the design uses that the theme's scale does not carry.
 * The theme covers 4/6/8/12/16/24/32; these fill the gaps rather than rounding
 * the design to the nearest token and losing the rhythm.
 */
export const TEAM_SPACE = {
  /** Gap between stacked rows in a rail column. */
  hairline: 2,
  /** Button gap inside the sidebar callout, and card action rows. */
  snug: 10,
  /** Vertical padding of the message list. */
  list: 20,
  /** Gap between messages in the list. */
  message: 22,
  /** Space above a group label that follows a card. */
  group: 26,
  /** Top/left padding of the members detail and settings bodies. */
  page: 28,
} as const;

/**
 * The design sets page and header titles in a light weight. The theme's
 * `fontWeight` scale starts at `normal`, so this is declared locally.
 */
export const TEAM_TITLE_WEIGHT = "300" as const;

/** Line heights the design specifies as ratios. */
export const TEAM_LINE_HEIGHT = {
  /** Task card titles. */
  cardTitle: 1.45,
  /** Help and sub-text under a row title. */
  help: 1.5,
  /** Message bodies. */
  message: 1.6,
  /** MEMORY.md preview. */
  mono: 1.8,
} as const;
