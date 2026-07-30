import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Hash, Plus, Settings, SquareKanban, Users } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { SegmentedShell } from "@/screens/team/ui/segmented-shell";
import { TEAM_SUBHEADER_HEIGHT } from "@/screens/team/team-layout";

export const TEAM_SECTION_VALUES = ["chat", "members", "tasks", "settings"] as const;
export type TeamSection = (typeof TEAM_SECTION_VALUES)[number];

export function isTeamSection(value: string): value is TeamSection {
  return (TEAM_SECTION_VALUES as readonly string[]).includes(value);
}

/**
 * The 36px row under the header: section segmented control on the left, the
 * "Add member" action on the right.
 */
export function TeamSectionSwitcher({
  section,
  onSectionChange,
  onAddMember,
  canAddMember,
}: {
  section: TeamSection;
  onSectionChange: (section: TeamSection) => void;
  onAddMember: () => void;
  canAddMember: boolean;
}) {
  const { t } = useTranslation();

  const options = useMemo(
    () => [
      {
        value: "chat" as const,
        label: t("team.sections.chat"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <Hash color={color} size={size} />
        ),
        testID: "team-section-chat",
      },
      {
        value: "members" as const,
        label: t("team.sections.members"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <Users color={color} size={size} />
        ),
        testID: "team-section-members",
      },
      {
        value: "tasks" as const,
        label: t("team.sections.tasks"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <SquareKanban color={color} size={size} />
        ),
        testID: "team-section-tasks",
      },
      {
        value: "settings" as const,
        label: t("team.sections.settings"),
        icon: ({ color, size }: { color: string; size: number }) => (
          <Settings color={color} size={size} />
        ),
        testID: "team-section-settings",
      },
    ],
    [t],
  );

  return (
    <View style={styles.row}>
      <SegmentedShell
        options={options}
        value={section}
        onValueChange={onSectionChange}
        testID="team-section-switcher"
      />
      <View style={styles.spacer} />
      <Button
        variant="outline"
        size="xs"
        leftIcon={Plus}
        onPress={onAddMember}
        disabled={!canAddMember}
        testID="team-add-member-button"
      >
        {t("team.members.actions.create")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    height: TEAM_SUBHEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  spacer: {
    flex: 1,
  },
}));
