import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { TeamChannel, TeamMember, TeamTask } from "@getpaseo/protocol/team/types";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { MenuHeader } from "@/components/headers/menu-header";
import { useHostRouteServerId } from "@/navigation/host-route-context";
import { useProjects } from "@/hooks/use-projects";
import { useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { TeamChatSection } from "@/screens/team/chat/chat-section";
import { MemberForm } from "@/screens/team/members/member-form";
import { TeamMembersSection } from "@/screens/team/members/member-section";
import { TeamTasksSection } from "@/screens/team/tasks/task-section";
import { TeamSettingsSection } from "@/screens/team/settings/settings-section";
import {
  useTeamCapability,
  useTeamChannelMembershipCapability,
  useTeamChannelReadsCapability,
} from "@/screens/team/team-capability";
import { TeamHeader } from "@/screens/team/team-header";
import {
  isTeamSection,
  TeamSectionSwitcher,
  type TeamSection,
} from "@/screens/team/team-section-switcher";
import {
  getTeamProjectSettings,
  listTeamChannels,
  listTeamMembers,
  markTeamChannelRead,
  stopAllTeamActivity,
} from "@/screens/team/team-client";
import { listTeamTasks } from "@/screens/team/tasks/team-tasks-client";
import { buildHostTeamRoute } from "@/utils/host-routes";

function mergeMembersByName(current: TeamMember[], member: TeamMember): TeamMember[] {
  const next = new Map(current.map((entry) => [entry.id, entry] as const));
  next.set(member.id, member);
  return Array.from(next.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function incrementChannelUnread(channels: TeamChannel[], channelId: string): TeamChannel[] {
  return channels.map((channel) =>
    channel.id === channelId
      ? { ...channel, unreadCount: (channel.unreadCount ?? 0) + 1 }
      : channel,
  );
}

/**
 * The Team surface.
 *
 * The frame is fixed rather than scrolled: a 48px header, a 36px section
 * switcher, then a section body at `flex: 1` with `minHeight: 0`. Each section
 * owns its own scrolling, which is what lets Chat keep a pinned composer and
 * Tasks scroll its board horizontally. Scrolling the whole screen instead —
 * which is what this did before — makes both impossible.
 */
export function TeamScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const serverId = useHostRouteServerId();
  const hosts = useHosts();
  const teamEnabled = useTeamCapability(serverId);
  const channelReadsEnabled = useTeamChannelReadsCapability(serverId);
  const channelMembershipEnabled = useTeamChannelMembershipCapability(serverId);
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
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const [escalatedTask, setEscalatedTask] = useState<TeamTask | null>(null);
  const [handbackLimit, setHandbackLimit] = useState<number | null>(null);
  const [memberForm, setMemberForm] = useState<{
    mode: "create" | "edit";
    member: TeamMember | null;
  } | null>(null);

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

  /**
   * Workspace ids to human names. Without this the member roster and detail
   * fall back to showing the raw `wks_…` id, which tells the reader nothing.
   */
  const workspaceNamesById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const project of hostProjects) {
      for (const host of project.hosts) {
        if (host.serverId !== serverId) {
          continue;
        }
        for (const workspace of host.workspaces) {
          names[workspace.id] = workspace.title ?? workspace.name;
        }
      }
    }
    return names;
  }, [hostProjects, serverId]);

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

  const markViewedChannel = useCallback(
    async (channelId: string) => {
      if (!channelReadsEnabled || !client || !projectId) {
        return;
      }
      try {
        await markTeamChannelRead({ client, projectId, channelId });
        setChannels((current) =>
          current.map((channel) =>
            channel.id === channelId ? { ...channel, unreadCount: 0 } : channel,
          ),
        );
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    },
    [channelReadsEnabled, client, projectId],
  );

  useEffect(() => {
    if (section === "chat" && activeChannelId) {
      void markViewedChannel(activeChannelId);
    }
  }, [activeChannelId, markViewedChannel, section]);

  useEffect(() => {
    if (!channelReadsEnabled || !client || !projectId) {
      return;
    }
    return client.on("team.message.posted", (event) => {
      if (event.payload.projectId !== projectId) {
        return;
      }
      const messageChannelId = event.payload.message.channelId;
      if (section === "chat" && messageChannelId === activeChannelId) {
        void markViewedChannel(messageChannelId);
        return;
      }
      setChannels((current) => incrementChannelUnread(current, messageChannelId));
    });
  }, [activeChannelId, channelReadsEnabled, client, markViewedChannel, projectId, section]);

  const handleMembersChanged = useCallback(() => {
    void refreshRosterAndChannels();
  }, [refreshRosterAndChannels]);

  /**
   * The design shows one escalation at a time, in the channel and on the board.
   * The daemon marks an escalated task with `escalatedAt`, so the banner is a
   * read of task state — there is no separate escalation record to fetch.
   */
  const refreshEscalation = useCallback(async () => {
    if (!client || !projectId) {
      setEscalatedTask(null);
      setHandbackLimit(null);
      return;
    }
    try {
      const [tasks, settings] = await Promise.all([
        listTeamTasks({ client, projectId }),
        getTeamProjectSettings(client, projectId),
      ]);
      const escalated = tasks
        .filter((task) => task.escalatedAt !== null)
        .sort((left, right) => (left.escalatedAt ?? "").localeCompare(right.escalatedAt ?? ""));
      setEscalatedTask(escalated.at(-1) ?? null);
      setHandbackLimit(settings?.handbackLimit ?? null);
    } catch {
      // An escalation banner is additive — failing to read it must not take the
      // channel down with it.
    }
  }, [client, projectId]);

  useEffect(() => {
    void refreshEscalation();
  }, [refreshEscalation]);

  useEffect(() => {
    if (!client || !projectId) {
      return;
    }
    return client.on("team.task.changed", (event) => {
      if (event.payload.projectId === projectId) {
        void refreshEscalation();
      }
    });
  }, [client, projectId, refreshEscalation]);

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

  const switchSection = useCallback(
    (nextSection: TeamSection) => {
      if (!serverId) {
        return;
      }
      router.replace(buildHostTeamRoute(serverId, nextSection));
    },
    [router, serverId],
  );

  const goToTasks = useCallback(() => {
    switchSection("tasks");
  }, [switchSection]);

  const openCreateMember = useCallback(() => {
    setMemberForm({ mode: "create", member: null });
  }, []);
  const openEditMember = useCallback((member: TeamMember) => {
    setMemberForm({ mode: "edit", member });
  }, []);
  const closeMemberForm = useCallback(() => setMemberForm(null), []);
  const handleMemberFormSaved = useCallback(() => {
    setMemberForm(null);
    handleMembersChanged();
  }, [handleMembersChanged]);

  const handleStopAll = useCallback(async () => {
    if (!client || !projectId || isStoppingAll) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("team.header.stopAllTitle"),
      message: t("team.header.stopAllMessage"),
      confirmLabel: t("team.header.stopAllConfirm"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setIsStoppingAll(true);
    setError(null);
    try {
      await stopAllTeamActivity({ client, projectId });
      await refreshRosterAndChannels();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsStoppingAll(false);
    }
  }, [client, isStoppingAll, projectId, refreshRosterAndChannels, t]);

  const agentMemberCount = useMemo(
    () => members.filter((member) => member.kind !== "human").length,
    [members],
  );

  const contextLabel = useMemo(() => {
    if (!selectedProject) {
      return null;
    }
    return t("team.header.context", { daemon: hostLabel, count: agentMemberCount });
  }, [agentMemberCount, hostLabel, selectedProject, t]);

  if (!serverId) {
    return null;
  }

  if (!teamEnabled) {
    return (
      <View style={styles.screen} testID="team-screen">
        <MenuHeader title={t("team.title")} />
        <View style={styles.centered} testID="team-screen-gate-fallback">
          <Text style={styles.muted}>{t("team.needsHostUpgrade")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="team-screen">
      <TeamHeader
        title={t("team.title")}
        projects={hostProjects}
        selectedProjectKey={projectId}
        contextLabel={contextLabel}
        onSelectProject={setProjectId}
        onStopAll={handleStopAll}
        isStoppingAll={isStoppingAll}
      />
      <TeamSectionSwitcher
        section={section}
        onSectionChange={switchSection}
        onAddMember={openCreateMember}
        canAddMember={Boolean(selectedProject)}
      />
      <View style={styles.body}>
        <TeamSectionBody
          section={section}
          selectedProject={selectedProject}
          isLoading={projectsResult.isLoading || isLoading}
          client={client}
          serverId={serverId}
          members={members}
          channels={channels}
          channelMembershipEnabled={channelMembershipEnabled}
          activeChannelId={activeChannelId}
          error={error}
          escalatedTask={escalatedTask}
          handbackLimit={handbackLimit}
          onSelectChannel={setActiveChannelId}
          onChannelsChanged={refreshRosterAndChannels}
          workspaceNamesById={workspaceNamesById}
          onMembersChanged={handleMembersChanged}
          onEditMember={openEditMember}
          onOpenTasks={goToTasks}
          onEscalationResolved={refreshEscalation}
        />
      </View>
      {/*
        The member form lives at shell level because "Add member" sits in the
        section switcher, which is above the sections — it must open from any
        section, not just Members.
      */}
      <MemberForm
        visible={memberForm !== null}
        mode={memberForm?.mode ?? "create"}
        client={client}
        serverId={serverId}
        currentProjectId={selectedProject?.projectKey ?? ""}
        member={memberForm?.member ?? null}
        onClose={closeMemberForm}
        onSaved={handleMemberFormSaved}
      />
    </View>
  );
}

/**
 * Flat dispatch to the active section. Extracted so adding a section grows the
 * switcher, not this component.
 */
function TeamSectionBody({
  section,
  selectedProject,
  isLoading,
  client,
  serverId,
  members,
  channels,
  channelMembershipEnabled,
  activeChannelId,
  error,
  escalatedTask,
  handbackLimit,
  onSelectChannel,
  onChannelsChanged,
  workspaceNamesById,
  onMembersChanged,
  onEditMember,
  onOpenTasks,
  onEscalationResolved,
}: {
  section: TeamSection;
  selectedProject: { projectKey: string; projectName: string } | null;
  isLoading: boolean;
  client: DaemonClient | null;
  serverId: string | null;
  members: TeamMember[];
  channels: TeamChannel[];
  channelMembershipEnabled: boolean;
  activeChannelId: string | null;
  error: string | null;
  escalatedTask: TeamTask | null;
  handbackLimit: number | null;
  onSelectChannel: (channelId: string) => void;
  onChannelsChanged: () => void | Promise<void>;
  onMembersChanged: () => void;
  workspaceNamesById: Record<string, string>;
  onEditMember: (member: TeamMember) => void;
  onOpenTasks: () => void;
  onEscalationResolved: () => void;
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
        projectId={selectedProject.projectKey}
        members={members}
        channels={channels}
        workspaceNamesById={workspaceNamesById}
        onMembersChanged={onMembersChanged}
        onEditMember={onEditMember}
      />
    );
  }

  if (section === "tasks") {
    return <TeamTasksSection client={client} projectId={selectedProject.projectKey} />;
  }

  if (section === "settings") {
    return (
      <TeamSettingsSection
        client={client}
        projectId={selectedProject.projectKey}
        projectName={selectedProject.projectName}
      />
    );
  }

  return (
    <TeamChatSection
      client={client}
      serverId={serverId}
      projectId={selectedProject.projectKey}
      channelId={activeChannelId}
      channels={channels}
      members={members}
      channelMembershipEnabled={channelMembershipEnabled}
      error={error}
      escalatedTask={escalatedTask}
      handbackLimit={handbackLimit}
      onSelectChannel={onSelectChannel}
      onChannelsChanged={onChannelsChanged}
      onOpenTasks={onOpenTasks}
      onEscalationResolved={onEscalationResolved}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  body: {
    flex: 1,
    // Without this, a flex child with its own scroller grows to its content
    // height instead of scrolling inside the remaining space.
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
