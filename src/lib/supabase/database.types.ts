export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type TimestampColumns = {
  created_at: string;
  updated_at: string;
};

type OptionalTimestamps = {
  created_at?: string;
  updated_at?: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          options_budget: number;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          options_budget: number;
        }
      >;
      trader_sources: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
        }
      >;
      trade_alerts: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          trader_source_id: string;
          raw_text: string;
          corrected_fields: Json;
          symbol: string | null;
          option_side: string | null;
          strike: number | null;
          expiration: string | null;
          alerted_premium: number | null;
          submitted_at: string;
          tags: Json;
          parse_issues: Json;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          trader_source_id: string;
          raw_text: string;
          corrected_fields?: Json;
          symbol?: string | null;
          option_side?: string | null;
          strike?: number | null;
          expiration?: string | null;
          alerted_premium?: number | null;
          submitted_at: string;
          tags?: Json;
          parse_issues?: Json;
        }
      >;
      market_snapshots: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          trade_alert_id: string;
          snapshot_payload: Json;
          captured_at: string;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          trade_alert_id: string;
          snapshot_payload: Json;
          captured_at: string;
        }
      >;
      entry_analyses: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          trade_alert_id: string;
          market_snapshot_id: string | null;
          verdict: string;
          evidence_score: number;
          analysis_factors: Json;
          summary: string | null;
          analyzed_at: string;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          trade_alert_id: string;
          market_snapshot_id?: string | null;
          verdict: string;
          evidence_score: number;
          analysis_factors: Json;
          summary?: string | null;
          analyzed_at: string;
        }
      >;
      trade_decisions: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          trade_alert_id: string;
          entry_analysis_id: string;
          decision: string;
          quantity: number | null;
          entry_premium: number | null;
          decision_payload: Json;
          decided_at: string;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          trade_alert_id: string;
          entry_analysis_id: string;
          decision: string;
          quantity?: number | null;
          entry_premium?: number | null;
          decision_payload?: Json;
          decided_at: string;
        }
      >;
      watch_candidates: Table<
        TimestampColumns & {
          id: string;
          user_id: string;
          trade_alert_id: string;
          source_analysis_id: string;
          latest_analysis_id: string;
          unresolved_confirmation_conditions: Json;
          status: string;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          trade_alert_id: string;
          source_analysis_id: string;
          latest_analysis_id: string;
          unresolved_confirmation_conditions?: Json;
          status?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableRow<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];

export type TableInsert<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Insert"];
