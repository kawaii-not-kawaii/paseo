/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import { useCallback } from "react";
import { ChevronDown } from "lucide-react-native";
import { Text, View } from "react-native";
import type { TeamMember } from "@getpaseo/protocol/team/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { TEAM_SPACE } from "@/screens/team/team-layout";
import type { TaskFilterState } from "./task-filters";

interface TaskFiltersProps {
  filters: TaskFilterState;
  members: TeamMember[];
  onChange: (filters: TaskFilterState) => void;
}

const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedChevron = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function TaskFilters({ filters, members, onChange }: TaskFiltersProps) {
  const { t } = useTranslation();
  const updateCreator = useCallback(
    (creatorMemberId: string | null) => {
      onChange({ ...filters, creatorMemberId });
    },
    [filters, onChange],
  );
  const updateAssignee = useCallback(
    (assigneeMemberId: string | null) => {
      onChange({ ...filters, assigneeMemberId });
    },
    [filters, onChange],
  );

  return (
    <View style={styles.container}>
      <FilterMenu
        label={t("team.tasks.filters.creator")}
        value={findMemberName(members, filters.creatorMemberId) ?? t("team.tasks.filters.all")}
        members={members}
        onSelect={updateCreator}
      />
      <FilterMenu
        label={t("team.tasks.filters.assignee")}
        value={
          filters.assigneeMemberId === "__unassigned__"
            ? t("team.tasks.claim.unassigned")
            : (findMemberName(members, filters.assigneeMemberId) ?? t("team.tasks.filters.all"))
        }
        members={members}
        includeUnassigned
        onSelect={updateAssignee}
      />
    </View>
  );
}

function FilterMenu({
  label,
  value,
  members,
  includeUnassigned = false,
  onSelect,
}: {
  label: string;
  value: string;
  members: TeamMember[];
  includeUnassigned?: boolean;
  onSelect: (memberId: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      {/*
        The design renders the filter as one inline pill reading
        "Assignee: any", not a stacked label over a full-width field.
      */}
      <DropdownMenuTrigger style={styles.trigger}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {`${label}: ${value}`}
        </Text>
        <ThemedChevronDown size={11} uniProps={mutedChevron} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={240}>
        <DropdownMenuItem onSelect={() => onSelect(null)}>
          {t("team.tasks.filters.all")}
        </DropdownMenuItem>
        {includeUnassigned ? (
          <DropdownMenuItem onSelect={() => onSelect("__unassigned__")}>
            {t("team.tasks.claim.unassigned")}
          </DropdownMenuItem>
        ) : null}
        {members.map((member) => (
          <DropdownMenuItem key={member.id} onSelect={() => onSelect(member.id)}>
            {member.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function findMemberName(members: TeamMember[], memberId: string | null): string | null {
  if (memberId === "__unassigned__") {
    return null;
  }
  return members.find((member) => member.id === memberId)?.name ?? null;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    height: 26,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: TEAM_SPACE.snug,
  },
  triggerText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
