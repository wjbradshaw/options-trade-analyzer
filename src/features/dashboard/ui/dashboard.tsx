import type { ReactNode } from "react";
import { NeedsAttention, type NeedsAttentionItem } from "./needs-attention";

export interface DashboardProps {
  needsAttentionItems: NeedsAttentionItem[];
  budgetSetup?: ReactNode;
  pasteFlow: ReactNode;
  savedCandidates: ReactNode;
  latestAnalysis: ReactNode;
  recentDecisions: ReactNode;
}

export const Dashboard = ({
  needsAttentionItems,
  budgetSetup,
  pasteFlow,
  savedCandidates,
  latestAnalysis,
  recentDecisions,
}: DashboardProps) => {
  if (budgetSetup !== undefined) {
    return (
      <main style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
        {needsAttentionItems.length === 0 ? null : <NeedsAttention items={needsAttentionItems} />}
        {budgetSetup}
      </main>
    );
  }

  const attention =
    needsAttentionItems.length === 0 ? null : (
      <NeedsAttention items={needsAttentionItems} />
    );

  return (
    <main
      style={{
        display: "grid",
        gap: "1rem",
        marginInline: "auto",
        maxWidth: "70rem",
        padding: "1rem",
      }}
    >
      {attention}
      {pasteFlow}
      {savedCandidates}
      {latestAnalysis}
      {recentDecisions}
    </main>
  );
};
