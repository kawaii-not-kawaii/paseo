import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { TeamScreen } from "@/screens/team/team-screen";

export default function HostTeamSectionRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <TeamScreen />
    </HostRouteBootstrapBoundary>
  );
}
