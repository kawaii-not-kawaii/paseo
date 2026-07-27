import { useHostFeature } from "@/runtime/host-features";

export function useTeamCapability(serverId: string | null | undefined): boolean {
  return useHostFeature(serverId, "team");
}
