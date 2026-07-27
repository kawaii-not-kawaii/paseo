/* eslint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-object-as-prop */
import { Text, View } from "react-native";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";

export function ReferenceSheet({
  visible,
  title,
  subtitle,
  body,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  body: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={{ title, subtitle }}
      footer={
        <View style={styles.footer}>
          <Button variant="secondary" onPress={onClose}>
            {t("common.actions.done")}
          </Button>
        </View>
      }
    >
      <View style={styles.content}>
        <Text style={styles.label}>{subtitle}</Text>
        <Text style={styles.body}>{body ?? t("team.tasks.references.deleted")}</Text>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[3],
  },
  footer: {
    alignItems: "flex-end",
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
}));
