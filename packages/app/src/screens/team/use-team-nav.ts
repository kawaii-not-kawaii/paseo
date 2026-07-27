import { useCallback } from "react";
import { usePathname, router } from "expo-router";
import { useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildHostTeamRoute } from "@/utils/host-routes";
import { useTeamCapability } from "./team-capability";

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
  const serverId = activeWorkspaceSelection?.serverId ?? hosts[0]?.serverId ?? null;
  const supportsTeam = useTeamCapability(serverId);

  const navigate = useCallback(() => {
    if (!serverId || !supportsTeam) {
      return;
    }
    onNavigate?.();
    router.push(buildHostTeamRoute(serverId, "chat"));
  }, [onNavigate, serverId, supportsTeam]);

  return {
    serverId,
    visible: supportsTeam && serverId !== null,
    isActive: serverId ? pathname.startsWith(`/h/${serverId}/team/`) : false,
    navigate,
  };
}
