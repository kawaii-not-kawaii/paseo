import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, Hash, Settings, SquareKanban, Users } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember, TeamProjectSettings } from "@getpaseo/protocol/team/types";
import { MenuHeader } from "@/components/headers/menu-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTranslation } from "react-i18next";
import { useHostRouteServerId } from "@/navigation/host-route-context";
import { useProjects } from "@/hooks/use-projects";
import { useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { ChannelList } from "@/screens/team/chat/channel-list";
import { MemberActivityStrip } from "@/screens/team/chat/member-activity-strip";
import { MessageComposer } from "@/screens/team/chat/message-composer";
import { MessageList } from "@/screens/team/chat/message-list";
import { TeamMembersSection } from "@/screens/team/members/member-section";
import { TeamTasksSection } from "@/screens/team/tasks/task-section";
import { useTeamCapability } from "@/screens/team/team-capability";
import { ProjectSettingsForm } from "@/screens/team/settings/project-settings-form";
import {
  adoptLegacyTeamChat,
  getTeamProjectSettingsState,
  listTeamChannels,
  listTeamMembers,
  type TeamLegacyChatAdoptionState,
} from "@/screens/team/team-client";
import { buildHostTeamRoute } from "@/utils/host-routes";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { settingsStyles } from "@/styles/settings";

const TEAM_SECTION_VALUES = ["chat", "members", "tasks", "settings"] as const;
type TeamSection = (typeof TEAM_SECTION_VALUES)[number];

const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedChevron = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function isTeamSection(value: string): value is TeamSection {
  return (TEAM_SECTION_VALUES as readonly string[]).includes(value);
}

function mergeMembersByName(current: TeamMember[], member: TeamMember): TeamMember[] {
  const next = new Map(current.map((entry) => [entry.id, entry] as const));
  next.set(member.id, member);
  return Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function TeamScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const serverId = useHostRouteServerId();
  const hosts = useHosts();
  const teamEnabled = useTeamCapability(serverId);
  const projectsResult = useProjects({ enabled: Boolean(serverId) });
  const client = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.client ?? null) : null,
  );
  const hostLabel = hosts.find((host) => host.serverId === serverId)?.label ?? serverId ?? "";
  const routeSection = typeof params.section === "string" ? params.section : "chat";
  const section: TeamSection = isTeamSection(routeSection) ? routeSection : "chat";

  const hostProjects = useMemo(
    () =>
      projectsResult.projects.filter((project) =>
        project.hosts.some((host) => host.serverId === serverId),
      ),
    [projectsResult.projects, serverId],
  );
  const [projectId, setProjectId] = useState<string | null>(hostProjects[0]?.projectKey ?? null);
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isTeamSection(routeSection) || !serverId) {
      return;
    }
    router.replace(buildHostTeamRoute(serverId, "chat"));
  }, [routeSection, router, serverId]);

  useEffect(() => {
    if (!projectId && hostProjects[0]) {
      setProjectId(hostProjects[0].projectKey);
      return;
    }
    if (projectId && !hostProjects.some((project) => project.projectKey === projectId)) {
      setProjectId(hostProjects[0]?.projectKey ?? null);
    }
  }, [hostProjects, projectId]);

  const selectedProject = useMemo(
    () => hostProjects.find((project) => project.projectKey === projectId) ?? null,
    [hostProjects, projectId],
  );

  const refreshRosterAndChannels = useCallback(async () => {
    if (!client || !projectId) {
      setChannels([]);
      setMembers([]);
      setActiveChannelId(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [nextChannels, nextMembers] = await Promise.all([
        listTeamChannels(client, projectId),
        listTeamMembers(client, projectId),
      ]);
      setChannels(nextChannels);
      setMembers(nextMembers);
      setActiveChannelId((current) =>
        current && nextChannels.some((channel) => channel.id === current)
          ? current
          : (nextChannels[0]?.id ?? null),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    void refreshRosterAndChannels();
  }, [refreshRosterAndChannels]);

  const handleMembersChanged = useCallback(() => {
    void refreshRosterAndChannels();
  }, [refreshRosterAndChannels]);

  useEffect(() => {
    if (!client || !projectId) {
      return;
    }
    const unsubMember = client.on("team.member.changed", (event) => {
      if (event.payload.projectId !== projectId) {
        return;
      }
      setMembers((current) => mergeMembersByName(current, event.payload.member));
    });
    return () => {
      unsubMember();
    };
  }, [client, projectId]);

  const sectionOptions = useMemo(
    () => [
      {
        value: "chat",
        label: t("team.sections.chat"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <Hash color={color} size={size} />
        ),
      },
      {
        value: "members",
        label: t("team.sections.members"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <Users color={color} size={size} />
        ),
      },
      {
        value: "tasks",
        label: t("team.sections.tasks"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <SquareKanban color={color} size={size} />
        ),
      },
      {
        value: "settings",
        label: t("team.sections.settings"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <Settings color={color} size={size} />
        ),
      },
    ],
    [t],
  );

  const memberLabels = useMemo(
    () => ({
      idle: t("team.members.idle"),
      working: t("team.members.working"),
      stopped: t("team.members.stopped"),
      unavailable: t("team.members.unavailable"),
    }),
    [t],
  );

  const switchSection = useCallback(
    (nextSection: string) => {
      if (!serverId || !isTeamSection(nextSection)) {
        return;
      }
      router.replace(buildHostTeamRoute(serverId, nextSection));
    },
    [router, serverId],
  );

  const renderProjectMenuItem = useCallback(
    (projectKey: string, projectName: string, selected: boolean) => (
      <TeamProjectMenuItem
        key={projectKey}
        projectKey={projectKey}
        projectName={projectName}
        selected={selected}
        onSelectProject={setProjectId}
      />
    ),
    [],
  );

  if (!serverId) {
    return null;
  }

  if (!teamEnabled) {
    return (
      <View style={styles.screen} testID="team-screen">
        <MenuHeader title={t("team.title")} />
        <View style={styles.centered} testID="team-screen-gate-fallback">
          <Text style={styles.muted}>{t("message.actions.forkUnavailable")}</Text>
        </View>
      </View>
    );
  }

  const routeBody = (
    <TeamSectionBody
      section={section}
      selectedProject={selectedProject}
      isLoading={projectsResult.isLoading || isLoading}
      client={client}
      serverId={serverId}
      members={members}
      channels={channels}
      activeChannelId={activeChannelId}
      error={error}
      memberLabels={memberLabels}
      onSelectChannel={setActiveChannelId}
      onMembersChanged={handleMembersChanged}
    />
  );

  return (
    <View style={styles.screen} testID="team-screen">
      <MenuHeader title={t("team.title")} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.topCard}>
          <View style={styles.topRow}>
            <DropdownMenu>
              <DropdownMenuTrigger
                style={styles.projectTrigger}
                testID="team-project-picker-trigger"
              >
                <Text style={styles.projectTriggerText} numberOfLines={1}>
                  {selectedProject?.projectName ?? t("team.project.none")}
                </Text>
                <ThemedChevronDown size={16} uniProps={mutedChevron} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="start" width={260}>
                {hostProjects.map((project) =>
                  renderProjectMenuItem(
                    project.projectKey,
                    project.projectName,
                    project.projectKey === projectId,
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <StatusBadge label={`${t("team.daemon")}: ${hostLabel}`} />
          </View>
          <SegmentedControl
            options={sectionOptions}
            value={section}
            onValueChange={switchSection}
            size="sm"
            testID="team-section-switcher"
          />
          {selectedProject ? (
            <Text style={styles.projectHint}>
              {selectedProject.hosts.find((host) => host.serverId === serverId)?.repoRoot ??
                selectedProject.projectKey}
            </Text>
          ) : null}
        </View>

        {routeBody}
      </ScrollView>
    </View>
  );
}

function TeamProjectMenuItem({
  projectKey,
  projectName,
  selected,
  onSelectProject,
}: {
  projectKey: string;
  projectName: string;
  selected: boolean;
  onSelectProject: (projectId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelectProject(projectKey);
  }, [onSelectProject, projectKey]);

  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {projectName}
    </DropdownMenuItem>
  );
}

/**
 * Which section the Team route is showing.
 *
 * Extracted from TeamScreen so that adding a section does not push that component past the
 * complexity limit — the switcher grows, this stays a flat dispatch.
 */
function TeamSectionBody({
  section,
  selectedProject,
  isLoading,
  client,
  serverId,
  members,
  channels,
  activeChannelId,
  error,
  memberLabels,
  onSelectChannel,
  onMembersChanged,
}: {
  section: TeamSection;
  selectedProject: { projectKey: string } | null;
  isLoading: boolean;
  client: DaemonClient | null;
  serverId: string | null;
  members: TeamMember[];
  channels: TeamChannel[];
  activeChannelId: string | null;
  error: string | null;
  memberLabels: {
    idle: string;
    working: string;
    stopped: string;
    unavailable: string;
  };
  onSelectChannel: (channelId: string) => void;
  onMembersChanged: () => void;
}) {
  const { t } = useTranslation();

  if (!selectedProject) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          {isLoading ? t("common.states.loading") : t("team.project.none")}
        </Text>
      </View>
    );
  }

  if (section === "members") {
    return (
      <TeamMembersSection
        client={client}
        serverId={serverId}
        projectId={selectedProject.projectKey}
        members={members}
        channels={channels}
        onMembersChanged={onMembersChanged}
      />
    );
  }

  if (section === "tasks") {
    return <TeamTasksSection client={client} projectId={selectedProject.projectKey} />;
  }

  if (section === "settings") {
    return <TeamSettingsSection client={client} projectId={selectedProject.projectKey} />;
  }

  if (section === "chat") {
    return (
      <TeamChatSection
        client={client}
        projectId={selectedProject.projectKey}
        channelId={activeChannelId}
        channels={channels}
        members={members}
        error={error}
        memberLabels={memberLabels}
        onSelectChannel={onSelectChannel}
      />
    );
  }

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.muted}>{t("team.sections.pending")}</Text>
    </View>
  );
}

function TeamSettingsSection({
  client,
  projectId,
}: {
  client: DaemonClient | null;
  projectId: string;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TeamProjectSettings | null>(null);
  const [adoption, setAdoption] = useState<TeamLegacyChatAdoptionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) {
      setSettings(null);
      setAdoption(null);
      return;
    }
    try {
      const nextState = await getTeamProjectSettingsState(client, projectId);
      setSettings(nextState.settings);
      setAdoption(nextState.legacyChatAdoption);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdoptLegacyChat = useCallback(async () => {
    if (!client) {
      return;
    }
    try {
      const nextAdoption = await adoptLegacyTeamChat({ client, projectId });
      setAdoption(nextAdoption);
      setError(null);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [client, projectId, refresh]);

  if (!settings && !error) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.muted}>{t("common.states.loading")}</Text>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.sectionCard}>
        <Text style={settingsStyles.rowError}>{error ?? t("message.actions.forkUnavailable")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionLabel}>{t("team.sections.settings")}</Text>
      {adoption?.status === "pending" ? (
        <View style={styles.adoptionCard}>
          <Text style={styles.adoptionTitle}>{t("team.settings.adoption.title")}</Text>
          <Text style={styles.muted}>
            {t("team.settings.adoption.body", {
              roomCount: adoption.roomCount,
              messageCount: adoption.messageCount,
            })}
          </Text>
          <Button onPress={handleAdoptLegacyChat} testID="team-adopt-legacy-chat-button">
            {t("team.settings.adoption.action")}
          </Button>
        </View>
      ) : null}
      <ProjectSettingsForm
        client={client}
        projectId={projectId}
        settings={settings}
        onSaved={setSettings}
      />
    </View>
  );
}

function TeamChatSection({
  client,
  projectId,
  channelId,
  channels,
  members,
  error,
  memberLabels,
  onSelectChannel,
}: {
  client: DaemonClient | null;
  projectId: string;
  channelId: string | null;
  channels: TeamChannel[];
  members: TeamMember[];
  error: string | null;
  memberLabels: {
    idle: string;
    working: string;
    stopped: string;
    unavailable: string;
  };
  onSelectChannel: (channelId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.chatLayout}>
      <View style={styles.sidebarColumn}>
        <Text style={styles.sectionLabel}>{t("team.chat.channels")}</Text>
        <ChannelList
          channels={channels}
          activeChannelId={channelId}
          emptyLabel={t("team.chat.emptyChannels")}
          onSelect={onSelectChannel}
        />
      </View>
      <View style={styles.mainColumn}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>{t("team.chat.activity")}</Text>
          <MemberActivityStrip members={members} labels={memberLabels} />
        </View>
        {error ? (
          <View style={styles.sectionCard}>
            <Text style={settingsStyles.rowError}>{error}</Text>
          </View>
        ) : null}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>{t("team.chat.messages")}</Text>
          <View style={styles.messageListWrap}>
            <MessageList
              client={client}
              projectId={projectId}
              channelId={channelId}
              emptyLabel={t("team.chat.emptyMessages")}
              loadOlderLabel={t("team.chat.loadOlder")}
              loadingLabel={t("common.states.loading")}
              retryLabel={t("common.actions.retry")}
            />
          </View>
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>{t("team.chat.compose")}</Text>
          <MessageComposer
            client={client}
            projectId={projectId}
            channelId={channelId}
            members={members}
            placeholder={t("team.chat.placeholder")}
            submitLabel={t("team.chat.send")}
            sentLabel={t("team.chat.sent")}
            sendingLabel={t("team.chat.sending")}
            retryLabel={t("common.actions.retry")}
            dismissLabel={t("common.actions.dismiss")}
            mentionEmptyLabel={t("team.chat.noMentions")}
            mentionLoadingLabel={t("common.states.loading")}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  topCard: {
    gap: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing[3],
    flexWrap: "wrap",
  },
  projectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    maxWidth: 360,
  },
  projectTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  projectHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  chatLayout: {
    gap: theme.spacing[4],
    flexDirection: {
      xs: "column",
      md: "row",
    },
  },
  sidebarColumn: {
    width: {
      xs: "100%",
      md: 280,
    },
    gap: theme.spacing[3],
  },
  mainColumn: {
    flex: 1,
    gap: theme.spacing[4],
  },
  sectionCard: {
    gap: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
  },
  adoptionCard: {
    gap: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[4],
  },
  adoptionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  sectionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  messageListWrap: {
    minHeight: 320,
  },
  centered: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
