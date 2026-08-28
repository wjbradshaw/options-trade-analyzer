import type { SupabaseClient } from "@supabase/supabase-js";
import { err, ok, type Result } from "@/lib/result";
import type { Database, Json, TableRow } from "@/lib/supabase/database.types";
import {
  databaseError,
  type RepositoryError,
} from "@/lib/supabase/repository-error";
import type {
  HostEvent,
  UserPosition,
  UserPositionEvent,
} from "../domain/types";

export type { RepositoryError } from "@/lib/supabase/repository-error";

export interface OpenPositionInput {
  userId: string;
  tradeAlertId: string;
  entryAnalysisId: string;
  quantity: 1 | 2 | 3;
  entryPremium: number;
  details: Readonly<Record<string, Json>>;
  decidedAt: string;
}

export interface TrimPositionInput {
  userId: string;
  positionId: string;
  trimQuantity: number;
  exitPremium: number;
  notes?: string;
  trimmedAt: string;
}

export interface ClosePositionInput {
  userId: string;
  positionId: string;
  exitPremium: number;
  notes?: string;
  closedAt: string;
}

export interface RecordHostEventInput {
  userId: string;
  tradeAlertId?: string;
  userPositionId?: string;
  traderSourceId?: string;
  rawText: string;
  eventType: HostEvent["eventType"];
  claimedEntryPremium?: number;
  claimedExitPremium?: number;
  claimedPercentage?: number;
  eventPayload?: Readonly<Record<string, Json>>;
}

export interface PositionRepository {
  openPosition(
    input: OpenPositionInput,
  ): Promise<Result<{ positionId: string; decisionId: string; eventId: string }, RepositoryError>>;
  trimPosition(
    input: TrimPositionInput,
  ): Promise<Result<{ positionId: string; remainingQuantity: number; status: "open" | "closed"; eventId: string }, RepositoryError>>;
  closePosition(
    input: ClosePositionInput,
  ): Promise<Result<{ positionId: string; status: "closed"; eventId: string }, RepositoryError>>;
  listActivePositions(): Promise<Result<UserPosition[], RepositoryError>>;
  listPositionEvents(positionId: string): Promise<Result<UserPositionEvent[], RepositoryError>>;
  listHostEvents(tradeAlertId?: string): Promise<Result<HostEvent[], RepositoryError>>;
  recordHostEvent(input: RecordHostEventInput): Promise<Result<HostEvent, RepositoryError>>;
}

export const mapPositionRow = (row: TableRow<"user_positions">): UserPosition => ({
  id: row.id,
  userId: row.user_id,
  tradeAlertId: row.trade_alert_id,
  entryAnalysisId: row.entry_analysis_id,
  initialQuantity: row.initial_quantity as 1 | 2 | 3,
  remainingQuantity: row.remaining_quantity,
  initialEntryPremium: row.initial_entry_premium,
  status: row.status as "open" | "closed",
  openedAt: row.opened_at,
  closedAt: row.closed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapPositionEventRow = (row: TableRow<"user_position_events">): UserPositionEvent => ({
  id: row.id,
  userPositionId: row.user_position_id,
  userId: row.user_id,
  eventType: row.event_type,
  quantityDelta: row.quantity_delta,
  executedPremium: row.executed_premium,
  notes: row.notes,
  eventPayload: (row.event_payload ?? {}) as Readonly<Record<string, unknown>>,
  createdAt: row.created_at,
});

export const mapHostEventRow = (row: TableRow<"host_events">): HostEvent => ({
  id: row.id,
  userId: row.user_id,
  tradeAlertId: row.trade_alert_id,
  userPositionId: row.user_position_id,
  traderSourceId: row.trader_source_id,
  rawText: row.raw_text,
  eventType: row.event_type,
  claimedEntryPremium: row.claimed_entry_premium,
  claimedExitPremium: row.claimed_exit_premium,
  claimedPercentage: row.claimed_percentage,
  eventPayload: (row.event_payload ?? {}) as Readonly<Record<string, unknown>>,
  createdAt: row.created_at,
});

export class SupabasePositionRepository implements PositionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async openPosition(
    input: OpenPositionInput,
  ): Promise<Result<{ positionId: string; decisionId: string; eventId: string }, RepositoryError>> {
    const { data, error } = await this.client.rpc(
      "commit_user_purchase_and_open_position",
      {
        p_user_id: input.userId,
        p_trade_alert_id: input.tradeAlertId,
        p_entry_analysis_id: input.entryAnalysisId,
        p_quantity: input.quantity,
        p_entry_premium: input.entryPremium,
        p_details: input.details,
        p_decided_at: input.decidedAt,
      },
    );

    if (error) return err(databaseError(error));
    const result = data as { position_id: string; decision_id: string; event_id: string };
    return ok({
      positionId: result.position_id,
      decisionId: result.decision_id,
      eventId: result.event_id,
    });
  }

  async trimPosition(
    input: TrimPositionInput,
  ): Promise<Result<{ positionId: string; remainingQuantity: number; status: "open" | "closed"; eventId: string }, RepositoryError>> {
    const { data, error } = await this.client.rpc("commit_position_trim", {
      p_user_id: input.userId,
      p_position_id: input.positionId,
      p_trim_quantity: input.trimQuantity,
      p_exit_premium: input.exitPremium,
      p_notes: input.notes ?? "",
      p_trimmed_at: input.trimmedAt,
    });

    if (error) return err(databaseError(error));
    const result = data as { position_id: string; remaining_quantity: number; status: "open" | "closed"; event_id: string };
    return ok({
      positionId: result.position_id,
      remainingQuantity: result.remaining_quantity,
      status: result.status,
      eventId: result.event_id,
    });
  }

  async closePosition(
    input: ClosePositionInput,
  ): Promise<Result<{ positionId: string; status: "closed"; eventId: string }, RepositoryError>> {
    const { data, error } = await this.client.rpc("commit_position_close", {
      p_user_id: input.userId,
      p_position_id: input.positionId,
      p_exit_premium: input.exitPremium,
      p_notes: input.notes ?? "",
      p_closed_at: input.closedAt,
    });

    if (error) return err(databaseError(error));
    const result = data as { position_id: string; status: "closed"; event_id: string };
    return ok({
      positionId: result.position_id,
      status: result.status,
      eventId: result.event_id,
    });
  }

  async listActivePositions(): Promise<Result<UserPosition[], RepositoryError>> {
    const { data, error } = await this.client
      .from("user_positions")
      .select("*")
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (error) return err(databaseError(error));
    return ok(data.map(mapPositionRow));
  }

  async listPositionEvents(
    positionId: string,
  ): Promise<Result<UserPositionEvent[], RepositoryError>> {
    const { data, error } = await this.client
      .from("user_position_events")
      .select("*")
      .eq("user_position_id", positionId)
      .order("created_at", { ascending: true });

    if (error) return err(databaseError(error));
    return ok(data.map(mapPositionEventRow));
  }

  async listHostEvents(
    tradeAlertId?: string,
  ): Promise<Result<HostEvent[], RepositoryError>> {
    let query = this.client
      .from("host_events")
      .select("*")
      .order("created_at", { ascending: false });

    if (tradeAlertId) {
      query = query.eq("trade_alert_id", tradeAlertId);
    }

    const { data, error } = await query;
    if (error) return err(databaseError(error));
    return ok(data.map(mapHostEventRow));
  }

  async recordHostEvent(
    input: RecordHostEventInput,
  ): Promise<Result<HostEvent, RepositoryError>> {
    const { data, error } = await this.client
      .from("host_events")
      .insert({
        user_id: input.userId,
        trade_alert_id: input.tradeAlertId ?? null,
        user_position_id: input.userPositionId ?? null,
        trader_source_id: input.traderSourceId ?? null,
        raw_text: input.rawText,
        event_type: input.eventType,
        claimed_entry_premium: input.claimedEntryPremium ?? null,
        claimed_exit_premium: input.claimedExitPremium ?? null,
        claimed_percentage: input.claimedPercentage ?? null,
        event_payload: input.eventPayload ?? {},
      })
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapHostEventRow(data));
  }
}
