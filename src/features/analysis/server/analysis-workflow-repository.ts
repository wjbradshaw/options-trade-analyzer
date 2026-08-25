import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectedAlertFields } from "@/features/alerts/server/alert-repository";
import type { ParsedTradeAlert } from "@/features/alerts/domain/types";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import type { MarketSnapshot } from "@/features/market/domain/snapshot";
import type { RiskAssessment } from "@/features/profile/domain/risk";
import { err, ok, type Result } from "@/lib/result";
import type { Database, Json } from "@/lib/supabase/database.types";
import { databaseError, type RepositoryError } from "@/lib/supabase/repository-error";

export interface AnalysisWorkflowCommitInput {
  userId: string;
  traderSourceId: string;
  alert: ParsedTradeAlert;
  correctedFields: CorrectedAlertFields;
  marketSnapshot: MarketSnapshot;
  dte: number;
  riskAssessment: RiskAssessment;
  analysis: EntryAnalysis;
  analyzedAt: string;
}

export interface PersistedAnalysisWorkflow {
  alertId: string;
  snapshotId: string;
  analysisId: string;
}

export interface CandidateRefreshCommitInput {
  userId: string;
  candidateId: string;
  tradeAlertId: string;
  marketSnapshot: MarketSnapshot;
  dte: number;
  riskAssessment: RiskAssessment;
  analysis: EntryAnalysis;
  analyzedAt: string;
}

export interface PersistedCandidateRefresh {
  snapshotId: string;
  analysisId: string;
}

export interface AnalysisWorkflowPersistence {
  commitCompletedAnalysis(
    input: AnalysisWorkflowCommitInput,
  ): Promise<Result<PersistedAnalysisWorkflow, RepositoryError>>;
  commitCandidateRefresh?(
    input: CandidateRefreshCommitInput,
  ): Promise<Result<PersistedCandidateRefresh, RepositoryError>>;
}

export type AnalysisWorkflowSupabaseClient = SupabaseClient<Database>;

const asJson = (value: unknown): Json => value as Json;

export class SupabaseAnalysisWorkflowPersistence implements AnalysisWorkflowPersistence {
  constructor(private readonly client: AnalysisWorkflowSupabaseClient) {}

  async commitCompletedAnalysis(
    input: AnalysisWorkflowCommitInput,
  ): Promise<Result<PersistedAnalysisWorkflow, RepositoryError>> {
    const { data, error } = await this.client.rpc("commit_entry_analysis_workflow", {
      p_user_id: input.userId,
      p_trader_source_id: input.traderSourceId,
      p_raw_text: input.alert.rawText,
      p_corrected_fields: asJson(input.correctedFields),
      p_symbol: input.alert.symbol as string,
      p_option_side: input.alert.side as string,
      p_strike: input.alert.strike as number,
      p_expiration: input.alert.expiration as string,
      p_alerted_premium: input.alert.alertedPremium,
      p_submitted_at: input.alert.submittedAt,
      p_tags: asJson(input.alert.tags),
      p_parse_issues: asJson(input.alert.issues),
      p_snapshot_payload: asJson({
        ...input.marketSnapshot,
        source: "manual",
        dte: input.dte,
      }),
      p_captured_at: input.marketSnapshot.confirmedAt,
      p_verdict: input.analysis.verdict,
      p_evidence_score: input.analysis.score,
      p_analysis_payload: asJson({
        modelVersion: input.analysis.modelVersion,
        evidenceCoverage: input.analysis.evidenceCoverage,
        scoreMeaning: input.analysis.scoreMeaning,
        factors: input.analysis.factors,
        riskAssessment: input.riskAssessment,
        dte: input.dte,
      }),
      p_summary: input.analysis.factors
        .filter((factor) => factor.status !== "supported")
        .map((factor) => factor.summary)
        .join(" ") || null,
      p_analyzed_at: input.analyzedAt,
    });

    if (error) return err(databaseError(error));
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.alert_id !== "string" ||
      typeof data.snapshot_id !== "string" ||
      typeof data.analysis_id !== "string"
    ) {
      return err({ code: "database", message: "Workflow transaction returned invalid identifiers" });
    }

    return ok({
      alertId: data.alert_id,
      snapshotId: data.snapshot_id,
      analysisId: data.analysis_id,
    });
  }

  async commitCandidateRefresh(
    input: CandidateRefreshCommitInput,
  ): Promise<Result<PersistedCandidateRefresh, RepositoryError>> {
    const { data, error } = await this.client.rpc("commit_wait_candidate_refresh", {
      p_user_id: input.userId,
      p_candidate_id: input.candidateId,
      p_trade_alert_id: input.tradeAlertId,
      p_snapshot_payload: asJson({
        ...input.marketSnapshot,
        source: "manual",
        dte: input.dte,
      }),
      p_captured_at: input.marketSnapshot.confirmedAt,
      p_verdict: input.analysis.verdict,
      p_evidence_score: input.analysis.score,
      p_analysis_payload: asJson({
        modelVersion: input.analysis.modelVersion,
        evidenceCoverage: input.analysis.evidenceCoverage,
        scoreMeaning: input.analysis.scoreMeaning,
        factors: input.analysis.factors,
        riskAssessment: input.riskAssessment,
        dte: input.dte,
      }),
      p_summary: input.analysis.factors
        .filter((factor) => factor.status !== "supported")
        .map((factor) => factor.summary)
        .join(" ") || null,
      p_analyzed_at: input.analyzedAt,
    });

    if (error) return err(databaseError(error));
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.snapshot_id !== "string" ||
      typeof data.analysis_id !== "string"
    ) {
      return err({ code: "database", message: "Candidate refresh returned invalid identifiers" });
    }

    return ok({ snapshotId: data.snapshot_id, analysisId: data.analysis_id });
  }
}
