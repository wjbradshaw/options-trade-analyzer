import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AlertField,
  OptionSide,
  ParsedTradeAlert,
  ParseIssue,
} from "@/features/alerts/domain/types";
import { err, ok, type Result } from "@/lib/result";
import type { Database, Json, TableRow } from "@/lib/supabase/database.types";
import {
  databaseError,
  notFoundError,
  type RepositoryError,
} from "@/lib/supabase/repository-error";

export type { RepositoryError } from "@/lib/supabase/repository-error";

export type CorrectedAlertFields = Partial<
  Pick<ParsedTradeAlert, AlertField | "tags">
>;

export interface SaveAlertInput {
  userId: string;
  traderSourceId: string;
  alert: ParsedTradeAlert;
  correctedFields: CorrectedAlertFields;
}

export interface SavedAlert extends ParsedTradeAlert {
  id: string;
  userId: string;
  traderSourceId: string;
  correctedFields: CorrectedAlertFields;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRepository {
  saveAlert(input: SaveAlertInput): Promise<Result<SavedAlert, RepositoryError>>;
  getAlert(id: string): Promise<Result<SavedAlert, RepositoryError>>;
}

export const mapAlertRow = (row: TableRow<"trade_alerts">): SavedAlert => ({
  id: row.id,
  userId: row.user_id,
  traderSourceId: row.trader_source_id,
  rawText: row.raw_text,
  correctedFields: row.corrected_fields as CorrectedAlertFields,
  symbol: row.symbol,
  side: row.option_side as OptionSide | null,
  strike: row.strike,
  expiration: row.expiration,
  alertedPremium: row.alerted_premium,
  submittedAt: row.submitted_at,
  tags: row.tags as string[],
  issues: row.parse_issues as unknown as ParseIssue[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupabaseAlertRepository implements AlertRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async saveAlert(input: SaveAlertInput): Promise<Result<SavedAlert, RepositoryError>> {
    const { alert } = input;
    const { data, error } = await this.client
      .from("trade_alerts")
      .insert({
        user_id: input.userId,
        trader_source_id: input.traderSourceId,
        raw_text: alert.rawText,
        corrected_fields: input.correctedFields as Json,
        symbol: alert.symbol,
        option_side: alert.side,
        strike: alert.strike,
        expiration: alert.expiration,
        alerted_premium: alert.alertedPremium,
        submitted_at: alert.submittedAt,
        tags: alert.tags,
        parse_issues: alert.issues as unknown as Json,
      })
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapAlertRow(data));
  }

  async getAlert(id: string): Promise<Result<SavedAlert, RepositoryError>> {
    const { data, error } = await this.client
      .from("trade_alerts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return err(databaseError(error));
    if (!data) return err(notFoundError("Trade alert"));
    return ok(mapAlertRow(data));
  }
}
