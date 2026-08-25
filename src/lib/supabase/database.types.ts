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
          contract_confirmed: boolean;
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
          contract_confirmed?: boolean;
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
          alert_contract_confirmed: boolean;
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
          alert_contract_confirmed?: boolean;
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
          source_analysis_verdict: "Wait";
          latest_analysis_id: string;
          unresolved_confirmation_conditions: Json;
          status: string;
        },
        OptionalTimestamps & {
          id?: string;
          user_id: string;
          trade_alert_id: string;
          source_analysis_id: string;
          source_analysis_verdict?: "Wait";
          latest_analysis_id: string;
          unresolved_confirmation_conditions?: Json;
          status?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      commit_entry_analysis_workflow: {
        Args: {
          p_user_id: string;
          p_trader_source_id: string;
          p_raw_text: string;
          p_corrected_fields: Json;
          p_symbol: string;
          p_option_side: string;
          p_strike: number;
          p_expiration: string;
          p_alerted_premium: number | null;
          p_submitted_at: string;
          p_tags: Json;
          p_parse_issues: Json;
          p_snapshot_payload: Json;
          p_captured_at: string;
          p_verdict: string;
          p_evidence_score: number;
          p_analysis_payload: Json;
          p_summary: string | null;
          p_analyzed_at: string;
        };
        Returns: Json;
      };
      commit_wait_candidate_refresh: {
        Args: {
          p_user_id: string;
          p_candidate_id: string;
          p_trade_alert_id: string;
          p_snapshot_payload: Json;
          p_captured_at: string;
          p_verdict: string;
          p_evidence_score: number;
          p_analysis_payload: Json;
          p_summary: string | null;
          p_analyzed_at: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableRow<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];

export type TableInsert<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Insert"];
