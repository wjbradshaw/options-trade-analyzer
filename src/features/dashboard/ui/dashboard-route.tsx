"use client";

import { useMemo } from "react";
import { analyzeAlertForDashboard, refreshWaitCandidate } from "@/features/analysis/server/analyze-alert";
import type { SavedAnalysis } from "@/features/analysis/server/analysis-repository";
import { SupabaseDecisionRepository, type SavedDecision } from "@/features/decisions/server/decision-repository";
import { SupabaseWatchCandidateRepository } from "@/features/decisions/server/watch-candidate-repository";
import { SupabaseProfileRepository, type Profile } from "@/features/profile/server/profile-repository";
import { SupabaseTraderRepository } from "@/features/traders/server/trader-repository";
import { createClient } from "@/lib/supabase/client";
import { DashboardWorkflow, type HydratedWatchCandidate } from "./dashboard-workflow";
import type { NeedsAttentionItem } from "./needs-attention";

export interface DashboardRouteProps {
  userId: string;
  initialProfile: Profile | null;
  profileLoadError: string | null;
  initialCandidates: HydratedWatchCandidate[];
  initialLatestAnalysis: SavedAnalysis | null;
  initialRecentDecisions: SavedDecision[];
  initialAttention: NeedsAttentionItem[];
}

export const DashboardRoute = (props: DashboardRouteProps) => {
  const repositories = useMemo(() => {
    const client = createClient();
    return {
      profileRepository: new SupabaseProfileRepository(client),
      traderRepository: new SupabaseTraderRepository(client),
      decisionRepository: new SupabaseDecisionRepository(client),
      watchCandidateRepository: new SupabaseWatchCandidateRepository(client),
    };
  }, []);

  return (
    <DashboardWorkflow
      {...props}
      {...repositories}
      analyzeAction={analyzeAlertForDashboard}
      refreshCandidateAction={refreshWaitCandidate}
    />
  );
};
