import { useCallback, useMemo } from "react";
import { usePathname, router } from "expo-router";
import { useHostFeatureMap } from "@/runtime/host-features";
import { useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildHostTeamRoute } from "@/utils/host-routes";
import { selectTeamServerId } from "./team-host-selection";

export interface TeamNav {
  /** Null when no host is selected, or when the host does not publish `features.team`. */
  serverId: string | null;
  visible: boolean;
  isActive: boolean;
  navigate: () => void;
}

/**
 * Everything the left sidebar needs to render its Team row.
 *
 * This lives here rather than inline in `left-sidebar.tsx` because that file is upstream-owned:
 * the sidebar's compact and wide render paths each need the same host resolution, capability
 * check, active-path check, and handler, and duplicating them there turned a ~6-line seam into
 * a 49-line one. See docs/fork.md.
 */
export function useTeamNav(onNavigate?: () => void): TeamNav {
  const pathname = usePathname();
  const hosts = useHosts();
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const teamByServerId = useHostFeatureMap(serverIds, "team");

  const serverId = selectTeamServerId(
    serverIds,
    teamByServerId,
    activeWorkspaceSelection?.serverId,
  );

  const navigate = useCallback(() => {
    if (!serverId) {
      return;
    }
    onNavigate?.();
    router.push(buildHostTeamRoute(serverId, "chat"));
  }, [onNavigate, serverId]);

  return {
    serverId,
    visible: serverId !== null,
    isActive: serverId ? pathname.startsWith(`/h/${serverId}/team/`) : false,
    navigate,
  };
}
