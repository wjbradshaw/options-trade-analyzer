import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnresolvedConfirmationCondition } from "@/features/decisions/domain/types";
import { err, ok, type Result } from "@/lib/result";
import type { Database, Json, TableRow } from "@/lib/supabase/database.types";
import {
  databaseError,
  type RepositoryError,
} from "@/lib/supabase/repository-error";

export type { RepositoryError } from "@/lib/supabase/repository-error";

export type WatchCandidateStatus = "watching" | "resolved" | "dismissed";

export interface SaveWatchCandidateInput {
  userId: string;
  tradeAlertId: string;
  sourceAnalysisId: string;
  sourceAnalysisVerdict: "Wait";
  latestAnalysisId: string;
  unresolvedConfirmationConditions: UnresolvedConfirmationCondition[];
  status?: WatchCandidateStatus;
}

export interface SavedWatchCandidate {
  id: string;
  userId: string;
  tradeAlertId: string;
  sourceAnalysisId: string;
  sourceAnalysisVerdict: "Wait";
  latestAnalysisId: string;
  unresolvedConfirmationConditions: UnresolvedConfirmationCondition[];
  status: WatchCandidateStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceWatchCandidateInput {
  candidateId: string;
  userId: string;
  latestAnalysisId: string;
}

export interface WatchCandidateRepository {
  saveCandidate(
    input: SaveWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, RepositoryError>>;
  advanceLatestAnalysis(
    input: AdvanceWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, RepositoryError>>;
}

export const mapWatchCandidateRow = (
  row: TableRow<"watch_candidates">,
): SavedWatchCandidate => ({
  id: row.id,
  userId: row.user_id,
  tradeAlertId: row.trade_alert_id,
  sourceAnalysisId: row.source_analysis_id,
  sourceAnalysisVerdict: row.source_analysis_verdict,
  latestAnalysisId: row.latest_analysis_id,
  unresolvedConfirmationConditions:
    row.unresolved_confirmation_conditions as unknown as UnresolvedConfirmationCondition[],
  status: row.status as WatchCandidateStatus,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupabaseWatchCandidateRepository implements WatchCandidateRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async saveCandidate(
    input: SaveWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, RepositoryError>> {
    const unresolvedConfirmationConditions: Json =
      input.unresolvedConfirmationConditions.map((condition) => ({
        id: condition.id,
        category: condition.category,
        description: condition.description,
      }));
    const { data, error } = await this.client
      .from("watch_candidates")
      .insert({
        user_id: input.userId,
        trade_alert_id: input.tradeAlertId,
        source_analysis_id: input.sourceAnalysisId,
        source_analysis_verdict: input.sourceAnalysisVerdict,
        latest_analysis_id: input.latestAnalysisId,
        unresolved_confirmation_conditions: unresolvedConfirmationConditions,
        status: input.status ?? "watching",
      })
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapWatchCandidateRow(data));
  }

  async advanceLatestAnalysis(
    input: AdvanceWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, RepositoryError>> {
    const { data, error } = await this.client
      .from("watch_candidates")
      .update({ latest_analysis_id: input.latestAnalysisId })
      .eq("id", input.candidateId)
      .eq("user_id", input.userId)
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapWatchCandidateRow(data));
  }
}
