import { useHostFeature } from "@/runtime/host-features";

export function useTeamCapability(serverId: string | null | undefined): boolean {
  return useHostFeature(serverId, "team");
}

export function useTeamChannelReadsCapability(serverId: string | null | undefined): boolean {
  return useHostFeature(serverId, "teamChannelReads");
}
