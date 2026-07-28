/**
 * The host the Team row should point at: the active workspace's host when that host publishes
 * `features.team`, otherwise the first host that does.
 *
 * Resolving against hosts that actually publish the capability rather than `hosts[0]` is the whole
 * point. A desktop client keeps a `local:`-prefixed placeholder host for its managed daemon even
 * when that daemon is disabled; it never connects, has no `server_info`, and sorted first it hid
 * the row while a remote host was serving Team perfectly well.
 *
 * Kept free of imports so it stays testable without the expo-router/React Native module graph.
 */
export function selectTeamServerId(
  serverIds: readonly string[],
  teamByServerId: ReadonlyMap<string, boolean>,
  selectedServerId: string | null | undefined,
): string | null {
  if (selectedServerId && teamByServerId.get(selectedServerId) === true) {
    return selectedServerId;
  }
  return serverIds.find((id) => teamByServerId.get(id) === true) ?? null;
}
