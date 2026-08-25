"use server";

import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import {
  createAnalyzeAlert,
  createAnalyzeAlertForDashboard,
  type AnalyzeAlertCommand,
  type AnalyzeAlertError,
  type DashboardEntryAnalysis,
} from "@/features/analysis/server/analysis-workflow";
import { SupabaseAnalysisWorkflowPersistence } from "@/features/analysis/server/analysis-workflow-repository";
import { SupabaseAnalysisRepository } from "@/features/analysis/server/analysis-repository";
import { SupabaseAlertRepository } from "@/features/alerts/server/alert-repository";
import {
  createRefreshWaitCandidate,
  type RefreshWaitCandidateCommand,
} from "@/features/analysis/server/refresh-wait-candidate";
import { SupabaseWatchCandidateRepository } from "@/features/decisions/server/watch-candidate-repository";
import type { WatchCandidateRefresh } from "@/features/decisions/ui/watch-candidate-card";
import { SupabaseProfileRepository } from "@/features/profile/server/profile-repository";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";

const dependencies = async () => {
  const client = await createClient();
  return {
    authenticate: async () => {
      const {
        data: { user },
      } = await client.auth.getUser();
      return user?.id ?? null;
    },
    profileRepository: new SupabaseProfileRepository(client),
    workflowPersistence: new SupabaseAnalysisWorkflowPersistence(client),
    now: () => new Date(),
  };
};

export async function analyzeAlert(
  command: AnalyzeAlertCommand,
): Promise<Result<EntryAnalysis, AnalyzeAlertError>> {
  return createAnalyzeAlert(await dependencies())(command);
}

export async function analyzeAlertForDashboard(
  command: AnalyzeAlertCommand,
): Promise<Result<DashboardEntryAnalysis, AnalyzeAlertError>> {
  return createAnalyzeAlertForDashboard(await dependencies())(command);
}

export async function refreshWaitCandidate(
  command: RefreshWaitCandidateCommand,
): Promise<Result<WatchCandidateRefresh, RepositoryError>> {
  const client = await createClient();
  return createRefreshWaitCandidate({
    authenticate: async () => {
      const {
        data: { user },
      } = await client.auth.getUser();
      return user?.id ?? null;
    },
    profileRepository: new SupabaseProfileRepository(client),
    alertRepository: new SupabaseAlertRepository(client),
    analysisRepository: new SupabaseAnalysisRepository(client),
    candidateRepository: new SupabaseWatchCandidateRepository(client),
    workflowPersistence: new SupabaseAnalysisWorkflowPersistence(client),
    now: () => new Date(),
  })(command);
}
