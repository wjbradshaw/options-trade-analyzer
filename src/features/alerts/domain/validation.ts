import type { ParseIssue, ParsedTradeAlert } from "./types";

type CriticalFields = Pick<
  ParsedTradeAlert,
  "symbol" | "side" | "strike" | "expiration"
>;

const criticalFields = ["symbol", "side", "strike", "expiration"] as const;

export const isValidAlertExpiration = (value: string | null): boolean => {
  if (value === null) return false;

  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (!match) return false;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
};

export const validateCriticalFields = (
  alert: CriticalFields,
): ParseIssue[] =>
  criticalFields.flatMap((field) =>
    alert[field] === null ? [{ field, code: "required" as const }] : [],
  );
