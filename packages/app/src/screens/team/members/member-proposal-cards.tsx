import { memo, useCallback } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { ScrollableCodeSurface } from "@/components/ui/scrollable-code-surface";
import { settingsStyles } from "@/styles/settings";
import type { TeamMemberProposal } from "./member-types";

interface MemberProposalCardsProps {
  proposals: TeamMemberProposal[];
  onConfirmProposal: (proposal: TeamMemberProposal) => void;
}

export const MemberProposalCards = memo(function MemberProposalCards({
  proposals,
  onConfirmProposal,
}: MemberProposalCardsProps) {
  const { t } = useTranslation();

  if (proposals.length === 0) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowHint}>{t("team.members.proposals.empty")}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {proposals.map((proposal) => (
        <ProposalCard
          key={`${proposal.templateId}:${proposal.name}`}
          proposal={proposal}
          confirmLabel={t("team.members.proposals.confirm")}
          onConfirmProposal={onConfirmProposal}
        />
      ))}
    </View>
  );
});

const ProposalCard = memo(function ProposalCard({
  proposal,
  confirmLabel,
  onConfirmProposal,
}: {
  proposal: TeamMemberProposal;
  confirmLabel: string;
  onConfirmProposal: (proposal: TeamMemberProposal) => void;
}) {
  const handleConfirm = useCallback(() => {
    onConfirmProposal(proposal);
  }, [onConfirmProposal, proposal]);

  return (
    <View style={settingsStyles.card}>
      <View style={styles.cardBody}>
        <View style={styles.header}>
          <Text style={settingsStyles.rowTitle}>{proposal.name}</Text>
          <Text style={styles.templateTag}>{proposal.templateId}</Text>
        </View>
        <Text style={settingsStyles.rowHint}>{proposal.description}</Text>
        <ScrollableCodeSurface
          horizontal={false}
          maxHeight={220}
          testID={`team-member-proposal-${proposal.templateId}-prompt`}
        >
          {proposal.rolePrompt}
        </ScrollableCodeSurface>
        <Button
          variant="default"
          size="sm"
          onPress={handleConfirm}
          testID={`team-member-proposal-${proposal.templateId}-confirm`}
        >
          {confirmLabel}
        </Button>
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[3],
  },
  cardBody: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  templateTag: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
