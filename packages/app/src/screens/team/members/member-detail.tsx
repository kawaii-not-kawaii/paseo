import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember } from "@getpaseo/protocol/team/types";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { listTeamMemberHomeFiles, readTeamMemberHomeFile } from "@/screens/team/team-client";
import {
  memberHandle,
  memberStatusLabel,
  memberStatusTone,
  type TeamMemberStatusLabels,
} from "@/screens/team/member-status";
import {
  TEAM_CONTENT_MAX_WIDTH,
  TEAM_LINE_HEIGHT,
  TEAM_SPACE,
  TEAM_TITLE_WEIGHT,
} from "@/screens/team/team-layout";
import { TeamStatusPill } from "@/screens/team/ui/status-pill";
import { MemberActions, MemberUnavailableNotice } from "./member-actions";
import type { Theme } from "@/styles/theme";

const ThemedChevronRight = withUnistyles(ChevronRight);
const faintChevron = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

const MEMORY_FILE = "MEMORY.md";

/**
 * The member detail pane: 720px of title, configuration, and memory.
 *
 * Editable Configuration rows open the member edit form. Channel membership is
 * managed from the channel form, so this pane reports the member's real channels.
 */
export function MemberDetail({
  client,
  member,
  channels,
  labels,
  workspaceName,
  projectId,
  onMemberChanged,
  onRemoved,
  onEditMember,
}: {
  client: DaemonClient | null;
  member: TeamMember;
  channels: TeamChannel[];
  labels: TeamMemberStatusLabels;
  workspaceName: string | null;
  projectId: string;
  onMemberChanged?: (member: TeamMember | null) => void;
  onRemoved?: (memberId: string) => void;
  onEditMember: (member: TeamMember) => void;
}) {
  const { t } = useTranslation();
  const [memory, setMemory] = useState<string | null>(null);
  const [memoryBytes, setMemoryBytes] = useState<number | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);

  const tone = memberStatusTone(member);
  const handle = memberHandle(member);
  const channelNames = useMemo(
    () =>
      channels
        .filter((channel) => member.channelIds?.includes(channel.id) === true)
        .map((channel) => `#${channel.name}`),
    [channels, member.channelIds],
  );

  const handleEdit = useCallback(() => onEditMember(member), [member, onEditMember]);

  // MEMORY.md is the one home file the design surfaces. The rest of the home
  // directory stays reachable through the member's workspace, not here.
  useEffect(() => {
    let cancelled = false;
    if (!client || member.kind === "human") {
      setMemory(null);
      setMemoryBytes(null);
      return;
    }
    setIsLoadingMemory(true);
    setMemoryError(null);
    void (async () => {
      try {
        const listing = await listTeamMemberHomeFiles({ client, memberId: member.id, path: "." });
        const entry = listing.entries.find((candidate) => candidate.path.endsWith(MEMORY_FILE));
        if (!entry) {
          if (!cancelled) {
            setMemory(null);
            setMemoryBytes(null);
          }
          return;
        }
        const file = await readTeamMemberHomeFile({
          client,
          memberId: member.id,
          path: entry.path,
        });
        if (!cancelled) {
          setMemory(file.content ?? null);
          // The home-file listing carries no size, so measure the content we
          // already fetched rather than adding a field to the wire format.
          setMemoryBytes(file.content === null ? null : byteLength(file.content));
        }
      } catch (error) {
        if (!cancelled) {
          setMemoryError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMemory(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, member.id, member.kind]);

  const configRows = useMemo(
    () => [
      {
        key: "homeWorkspace",
        editable: true,
        title: t("team.members.form.homeWorkspace"),
        help: t("team.members.detail.homeWorkspaceHelp"),
        // Never the raw `wks_…` id. An id that resolves to no name means the
        // workspace is gone or no longer in this project, which is the same
        // problem as having none — say that instead of printing an opaque key.
        value: workspaceName ?? t("team.members.list.workspaceMissing"),
      },
      {
        key: "runtime",
        editable: true,
        title: t("team.members.form.runtimeAndModel"),
        help: null,
        value: [member.provider, member.model].filter(Boolean).join(" · "),
      },
      {
        key: "rolePrompt",
        editable: true,
        title: t("team.members.detail.rolePrompt"),
        help: t("team.members.detail.rolePromptHelp"),
        value: null,
      },
      {
        key: "channels",
        title: t("team.sections.chat"),
        help: null,
        value: channelNames.join(", ") || t("team.members.list.noChannels"),
        editable: false,
      },
    ],
    [channelNames, member.model, member.provider, t, workspaceName],
  );

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {handle}
          </Text>
          <TeamStatusPill tone={tone} label={memberStatusLabel(member, labels)} />
          <View style={styles.titleSpacer} />
          {member.kind === "human" ? null : (
            <MemberActions
              client={client}
              projectId={projectId}
              member={member}
              onMemberChanged={onMemberChanged}
              onRemoved={onRemoved}
            />
          )}
        </View>

        {member.description ? <Text style={styles.subline}>{member.description}</Text> : null}

        <MemberUnavailableNotice member={member} onRepoint={onEditMember} />

        {member.kind === "human" ? null : (
          <>
            <Text style={styles.groupLabel}>{t("team.members.detail.configuration")}</Text>
            <View style={settingsStyles.card}>
              {configRows.map((row, index) => (
                <MemberConfigRow
                  key={row.key}
                  title={row.title}
                  help={row.help}
                  value={row.value}
                  bordered={index > 0}
                  onPress={row.editable ? handleEdit : undefined}
                />
              ))}
            </View>

            <View style={styles.memoryHeader}>
              <Text style={styles.groupLabelInline}>{t("team.members.detail.memoryLabel")}</Text>
              <Text style={styles.memoryMeta} numberOfLines={1}>
                {t("team.members.detail.memoryMeta", {
                  size: formatBytes(memoryBytes),
                })}
              </Text>
            </View>
            <View style={styles.memoryCard}>
              <Text style={styles.memoryFilename}>{MEMORY_FILE}</Text>
              <Text style={styles.memoryBody}>
                {memoryError ??
                  (isLoadingMemory
                    ? t("common.states.loading")
                    : (memory ?? t("team.members.detail.noMemory")))}
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function MemberConfigRow({
  title,
  help,
  value,
  bordered,
  onPress,
}: {
  title: string;
  help: string | null;
  value: string | null;
  bordered: boolean;
  /** Omitted for rows nothing can currently change — they render inert. */
  onPress?: () => void;
}) {
  const rowStyle = useCallback(
    ({ hovered }: { hovered?: boolean }) => [
      styles.configRow,
      bordered && styles.configRowBordered,
      Boolean(hovered) && styles.configRowHovered,
    ],
    [bordered],
  );

  const body = (
    <>
      <View style={styles.configRowText}>
        <Text style={styles.configTitle}>{title}</Text>
        {help ? <Text style={styles.configHelp}>{help}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.configValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <ThemedChevronRight size={14} uniProps={faintChevron} /> : null}
    </>
  );

  // No chevron and no hover when there is nothing to open — a row that looks
  // actionable and is not is worse than a plain one.
  if (!onPress) {
    return (
      <View style={bordered ? styles.configRowInertBordered : styles.configRowInert}>{body}</View>
    );
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={rowStyle}>
      {body}
    </Pressable>
  );
}

/** UTF-8 byte length, so a file of multibyte characters is not undercounted. */
function byteLength(content: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(content).length;
  }
  return content.length;
}

/** The design shows MEMORY.md's size beside it; an unknown size just drops out. */
function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  body: {
    maxWidth: TEAM_CONTENT_MAX_WIDTH,
    paddingTop: TEAM_SPACE.page,
    paddingHorizontal: theme.spacing[8],
    paddingBottom: 40,
    gap: theme.spacing[2],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TEAM_SPACE.snug,
  },
  title: {
    fontSize: theme.fontSize["2xl"],
    fontWeight: TEAM_TITLE_WEIGHT,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  titleSpacer: {
    flex: 1,
  },
  subline: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  groupLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    marginTop: TEAM_SPACE.message,
    marginLeft: theme.spacing[1],
  },
  groupLabelInline: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  memoryHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    marginTop: TEAM_SPACE.group,
    marginLeft: theme.spacing[1],
  },
  memoryMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
    flexShrink: 1,
  },
  memoryCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  memoryFilename: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * TEAM_LINE_HEIGHT.mono,
    color: theme.colors.foreground,
  },
  memoryBody: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * TEAM_LINE_HEIGHT.mono,
    color: theme.colors.foregroundMuted,
  },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  configRowBordered: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  configRowInert: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  configRowInertBordered: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  configRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  configRowText: {
    flex: 1,
    minWidth: 0,
  },
  configTitle: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  configHelp: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    marginTop: theme.spacing[1],
    lineHeight: theme.fontSize.xs * TEAM_LINE_HEIGHT.help,
  },
  configValue: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flex: 1,
    textAlign: "right",
  },
}));
