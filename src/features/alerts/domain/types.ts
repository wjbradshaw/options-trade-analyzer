import type { Result } from "@/lib/result";

export type OptionSide = "call" | "put";

export type AlertField =
  | "symbol"
  | "side"
  | "strike"
  | "expiration"
  | "alertedPremium";

export type ParseIssueCode = "ambiguous" | "invalid" | "required";

export interface ParseIssue {
  field: AlertField;
  code: ParseIssueCode;
}

export interface ParsedTradeAlert {
  rawText: string;
  symbol: string | null;
  side: OptionSide | null;
  strike: number | null;
  expiration: string | null;
  alertedPremium: number | null;
  submittedAt: string;
  tags: string[];
  issues: ParseIssue[];
}

export type ParseTradeAlertResult = Result<ParsedTradeAlert, never>;
