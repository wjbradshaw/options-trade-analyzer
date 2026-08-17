import type { ParseIssue, ParsedTradeAlert } from "./types";

type CriticalFields = Pick<
  ParsedTradeAlert,
  "symbol" | "side" | "strike" | "expiration"
>;

const criticalFields = ["symbol", "side", "strike", "expiration"] as const;

export const validateCriticalFields = (
  alert: CriticalFields,
): ParseIssue[] =>
  criticalFields.flatMap((field) =>
    alert[field] === null ? [{ field, code: "required" as const }] : [],
  );
