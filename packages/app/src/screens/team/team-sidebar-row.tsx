import { Users } from "lucide-react-native";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { useTeamNav } from "./use-team-nav";

/**
 * The Team row in the left sidebar. Renders nothing when the host does not publish
 * `features.team` (Constitution II — no degraded view, no fallback).
 *
 * This lives in fork-owned code rather than inline in `left-sidebar.tsx` because that file is
 * upstream-owned and has two render paths (compact and wide) that would otherwise each carry a
 * duplicate copy of the host resolution, capability check, active-path check, and handler.
 * See docs/fork.md.
 */
export function TeamSidebarRow({ label, onNavigate }: { label: string; onNavigate?: () => void }) {
  const team = useTeamNav(onNavigate);
  if (!team.visible) {
    return null;
  }
  return (
    <SidebarHeaderRow
      icon={Users}
      label={label}
      onPress={team.navigate}
      isActive={team.isActive}
      testID="sidebar-team"
      variant="compact"
    />
  );
}
