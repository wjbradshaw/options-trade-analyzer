import type { SupabaseClient } from "@supabase/supabase-js";
import { err, ok, type Result } from "@/lib/result";
import type { Database, Json, TableRow } from "@/lib/supabase/database.types";
import { databaseError, type RepositoryError } from "@/lib/supabase/repository-error";

export type { RepositoryError } from "@/lib/supabase/repository-error";

export type AnalysisVerdict = "Consider" | "Wait" | "Pass";
export type AnalysisFactors = Readonly<Record<string, Json>>;

export interface SaveAnalysisInput {
  userId: string;
  tradeAlertId: string;
  marketSnapshotId: string | null;
  verdict: AnalysisVerdict;
  evidenceScore: number;
  factors: AnalysisFactors;
  summary: string | null;
  analyzedAt: string;
}

export interface SavedAnalysis extends SaveAnalysisInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisRepository {
  saveAnalysis(
    input: SaveAnalysisInput,
  ): Promise<Result<SavedAnalysis, RepositoryError>>;
}

export interface AnalysisReadRepository {
  getAnalysis(id: string): Promise<Result<SavedAnalysis, RepositoryError>>;
  getLatestAnalysis(): Promise<Result<SavedAnalysis | null, RepositoryError>>;
}

export const mapAnalysisRow = (row: TableRow<"entry_analyses">): SavedAnalysis => ({
  id: row.id,
  userId: row.user_id,
  tradeAlertId: row.trade_alert_id,
  marketSnapshotId: row.market_snapshot_id,
  verdict: row.verdict as AnalysisVerdict,
  evidenceScore: row.evidence_score,
  factors: row.analysis_factors as AnalysisFactors,
  summary: row.summary,
  analyzedAt: row.analyzed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupabaseAnalysisRepository implements AnalysisRepository, AnalysisReadRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async saveAnalysis(
    input: SaveAnalysisInput,
  ): Promise<Result<SavedAnalysis, RepositoryError>> {
    const { data, error } = await this.client
      .from("entry_analyses")
      .insert({
        user_id: input.userId,
        trade_alert_id: input.tradeAlertId,
        market_snapshot_id: input.marketSnapshotId,
        alert_contract_confirmed: true,
        verdict: input.verdict,
        evidence_score: input.evidenceScore,
        analysis_factors: input.factors,
        summary: input.summary,
        analyzed_at: input.analyzedAt,
      })
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapAnalysisRow(data));
  }

  async getAnalysis(id: string): Promise<Result<SavedAnalysis, RepositoryError>> {
    const { data, error } = await this.client
      .from("entry_analyses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return err(databaseError(error));
    if (!data) return err({ code: "not_found", message: "Entry analysis was not found" });
    return ok(mapAnalysisRow(data));
  }

  async getLatestAnalysis(): Promise<Result<SavedAnalysis | null, RepositoryError>> {
    const { data, error } = await this.client
      .from("entry_analyses")
      .select("*")
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return err(databaseError(error));
    return ok(data ? mapAnalysisRow(data) : null);
  }
}
