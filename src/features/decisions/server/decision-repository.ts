import type { SupabaseClient } from "@supabase/supabase-js";
import { err, ok, type Result } from "@/lib/result";
import type { Database, Json, TableRow } from "@/lib/supabase/database.types";
import {
  databaseError,
  type RepositoryError,
} from "@/lib/supabase/repository-error";

export type { RepositoryError } from "@/lib/supabase/repository-error";

interface DecisionBase {
  userId: string;
  tradeAlertId: string;
  entryAnalysisId: string;
  details: Readonly<Record<string, Json>>;
  decidedAt: string;
}

export type SaveDecisionInput = DecisionBase &
  (
    | {
        decision: "purchased";
        quantity: 1 | 2 | 3;
        entryPremium: number;
      }
    | {
        decision: "skipped";
        quantity: null;
        entryPremium: null;
      }
  );

export type SavedDecision = SaveDecisionInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveCandidateDecisionInput = SaveDecisionInput & {
  candidateId: string;
};

export interface DecisionRepository {
  saveDecision(
    input: SaveDecisionInput,
  ): Promise<Result<SavedDecision, RepositoryError>>;
  saveCandidateDecision(
    input: SaveCandidateDecisionInput,
  ): Promise<Result<SavedDecision, RepositoryError>>;
}

export interface DecisionHistoryRepository {
  listRecentDecisions(
    limit?: number,
  ): Promise<Result<SavedDecision[], RepositoryError>>;
}

export const mapDecisionRow = (
  row: TableRow<"trade_decisions">,
): SavedDecision => {
  const base = {
    id: row.id,
    userId: row.user_id,
    tradeAlertId: row.trade_alert_id,
    entryAnalysisId: row.entry_analysis_id,
    details: row.decision_payload as Readonly<Record<string, Json>>,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.decision === "purchased") {
    return {
      ...base,
      decision: "purchased",
      quantity: row.quantity as 1 | 2 | 3,
      entryPremium: row.entry_premium as number,
    };
  }

  return { ...base, decision: "skipped", quantity: null, entryPremium: null };
};

export class SupabaseDecisionRepository
  implements DecisionRepository, DecisionHistoryRepository
{
  constructor(private readonly client: SupabaseClient<Database>) {}

  async saveDecision(
    input: SaveDecisionInput,
  ): Promise<Result<SavedDecision, RepositoryError>> {
    const { data, error } = await this.client
      .from("trade_decisions")
      .insert({
        user_id: input.userId,
        trade_alert_id: input.tradeAlertId,
        entry_analysis_id: input.entryAnalysisId,
        decision: input.decision,
        quantity: input.quantity,
        entry_premium: input.entryPremium,
        decision_payload: input.details,
        decided_at: input.decidedAt,
      })
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapDecisionRow(data));
  }

  async saveCandidateDecision(
    input: SaveCandidateDecisionInput,
  ): Promise<Result<SavedDecision, RepositoryError>> {
    const { data, error } = await this.client.rpc(
      "commit_watch_candidate_decision",
      {
        p_candidate_id: input.candidateId,
        p_user_id: input.userId,
        p_trade_alert_id: input.tradeAlertId,
        p_entry_analysis_id: input.entryAnalysisId,
        p_decision: input.decision,
        p_quantity: input.quantity,
        p_entry_premium: input.entryPremium,
        p_decision_payload: input.details,
        p_decided_at: input.decidedAt,
      },
    );

    if (error) return err(databaseError(error));
    if (data === null || Array.isArray(data) || typeof data !== "object") {
      return err({
        code: "database",
        message: "Candidate decision transaction returned an invalid decision.",
      });
    }
    return ok(mapDecisionRow(data as unknown as TableRow<"trade_decisions">));
  }

  async listRecentDecisions(
    limit = 10,
  ): Promise<Result<SavedDecision[], RepositoryError>> {
    const { data, error } = await this.client
      .from("trade_decisions")
      .select("*")
      .order("decided_at", { ascending: false })
      .limit(limit);

    if (error) return err(databaseError(error));
    return ok(data.map(mapDecisionRow));
  }
}
