import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown } from "lucide-react-native";
import { ScreenHeader } from "@/components/headers/screen-header";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TEAM_SPACE, TEAM_TITLE_WEIGHT } from "@/screens/team/team-layout";
import type { Theme } from "@/styles/theme";

const ThemedChevronDown = withUnistyles(ChevronDown);
const faintChevron = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

export interface TeamHeaderProject {
  projectKey: string;
  projectName: string;
}

/**
 * The Team surface's 48px header.
 *
 * Built on `ScreenHeader` rather than `MenuHeader` because the design puts the
 * project picker and context line between the title and the right-hand actions,
 * which `MenuHeader`'s title/rightContent shape cannot express. `ScreenHeader`
 * still owns safe-area insets, desktop window chrome, and the titlebar drag
 * region, so none of that is reimplemented here.
 */
export function TeamHeader({
  title,
  projects,
  selectedProjectKey,
  contextLabel,
  onSelectProject,
  onStopAll,
  isStoppingAll,
}: {
  title: string;
  projects: TeamHeaderProject[];
  selectedProjectKey: string | null;
  contextLabel: string | null;
  onSelectProject: (projectKey: string) => void;
  onStopAll: () => void;
  isStoppingAll: boolean;
}) {
  const { t } = useTranslation();
  const selectedProject = useMemo(
    () => projects.find((project) => project.projectKey === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  );

  const rightContent = useMemo(
    () => (
      <TeamStopAllButton
        label={t("team.header.stopAll")}
        onPress={onStopAll}
        disabled={isStoppingAll || !selectedProjectKey}
      />
    ),
    [isStoppingAll, onStopAll, selectedProjectKey, t],
  );

  return (
    <ScreenHeader
      leftStyle={styles.left}
      left={
        <>
          <SidebarMenuToggle />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <TeamProjectPicker
            projects={projects}
            selectedProjectKey={selectedProjectKey}
            selectedProjectName={selectedProject?.projectName ?? t("team.project.none")}
            onSelectProject={onSelectProject}
          />
          {contextLabel ? (
            <Text style={styles.context} numberOfLines={1}>
              {contextLabel}
            </Text>
          ) : null}
        </>
      }
      right={rightContent}
    />
  );
}

function TeamProjectPicker({
  projects,
  selectedProjectKey,
  selectedProjectName,
  onSelectProject,
}: {
  projects: TeamHeaderProject[];
  selectedProjectKey: string | null;
  selectedProjectName: string;
  onSelectProject: (projectKey: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger style={styles.projectPill} testID="team-project-picker-trigger">
        <Text style={styles.projectPillText} numberOfLines={1}>
          {selectedProjectName}
        </Text>
        <ThemedChevronDown size={12} uniProps={faintChevron} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={260}>
        {projects.map((project) => (
          <TeamProjectMenuItem
            key={project.projectKey}
            projectKey={project.projectKey}
            projectName={project.projectName}
            selected={project.projectKey === selectedProjectKey}
            onSelectProject={onSelectProject}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TeamProjectMenuItem({
  projectKey,
  projectName,
  selected,
  onSelectProject,
}: {
  projectKey: string;
  projectName: string;
  selected: boolean;
  onSelectProject: (projectKey: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelectProject(projectKey);
  }, [onSelectProject, projectKey]);

  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {projectName}
    </DropdownMenuItem>
  );
}

/**
 * A text button that fills on hover. Not `Button variant="ghost"` because the
 * design fills the background with `surface1` and lifts the label to full
 * `foreground` on hover, which the shared ghost variant does not do.
 */
function TeamStopAllButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  // The label recolors with the background, and a render-prop `hovered` cannot
  // reach a child `Text`. Self-hover on a Pressable with nothing pressable
  // inside is the case docs/hover.md explicitly permits.
  const [isHovered, setIsHovered] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  const buttonStyle = useMemo(
    () => [
      styles.stopAll,
      isHovered && !disabled && styles.stopAllHovered,
      disabled && styles.stopAllDisabled,
    ],
    [disabled, isHovered],
  );

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPress={onPress}
      style={buttonStyle}
      testID="team-stop-all-button"
    >
      <Text style={isHovered && !disabled ? styles.stopAllTextHovered : styles.stopAllText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  left: {
    gap: theme.spacing[3],
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: TEAM_TITLE_WEIGHT,
    color: theme.colors.foreground,
  },
  projectPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    height: 28,
    paddingHorizontal: TEAM_SPACE.snug,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: 240,
  },
  projectPillText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  context: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundExtraMuted,
    flexShrink: 1,
  },
  stopAll: {
    height: 32,
    justifyContent: "center",
    paddingHorizontal: TEAM_SPACE.snug,
    borderRadius: theme.borderRadius.md,
  },
  stopAllHovered: {
    backgroundColor: theme.colors.surface1,
  },
  stopAllDisabled: {
    opacity: theme.opacity[50],
  },
  stopAllText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  stopAllTextHovered: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
}));
