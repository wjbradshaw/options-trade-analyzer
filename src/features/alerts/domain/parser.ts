import { ok } from "@/lib/result";
import type {
  AlertField,
  OptionSide,
  ParseIssue,
  ParseTradeAlertResult,
} from "./types";

const symbolPattern = /\b([a-z]{1,5})\s+(?=\d{1,2}\/\d{1,2}\b)/gi;
const expirationPattern = /\b(\d{1,2}\/\d{1,2})\s+(?=\d+(?:\s*)?(?:c|p|call|put)\b)/gi;
const strikeAndSidePattern = /\b(\d+(?:\.\d+)?)\s*(c|p|call|put)\b/gi;
const premiumPattern = /@\s*(\d+(?:\.\d+)?)/g;
const knownTags = ["ER", "LOTTO"] as const;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const matches = (pattern: RegExp, rawText: string): RegExpMatchArray[] =>
  [...rawText.matchAll(pattern)];

const oneValue = <T>(
  values: T[],
  field: AlertField,
  issues: ParseIssue[],
): T | null => {
  const candidates = unique(values);

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    issues.push({ field, code: "ambiguous" });
  }

  return null;
};

const oneContract = (
  contracts: { strike: number; side: OptionSide }[],
  issues: ParseIssue[],
): { strike: number | null; side: OptionSide | null } => {
  const candidates = unique(
    contracts.map((contract) => `${contract.strike}:${contract.side}`),
  );

  if (candidates.length === 1) {
    return contracts[0];
  }

  if (candidates.length > 1) {
    issues.push(
      { field: "strike", code: "ambiguous" },
      { field: "side", code: "ambiguous" },
    );
  }

  return { strike: null, side: null };
};

const toOptionSide = (value: string): OptionSide =>
  value.toLowerCase() === "c" || value.toLowerCase() === "call" ? "call" : "put";

const extractTags = (rawText: string): string[] =>
  knownTags.filter((tag) => new RegExp(`\\b${tag}\\b`, "i").test(rawText));

export const parseTradeAlert = (
  rawText: string,
  submittedAt: string,
): ParseTradeAlertResult => {
  const issues: ParseIssue[] = [];
  const contracts = matches(strikeAndSidePattern, rawText).map((match) => ({
    strike: Number(match[1]),
    side: toOptionSide(match[2]),
  }));
  const contract = oneContract(contracts, issues);

  const symbol = oneValue(
    matches(symbolPattern, rawText).map((match) => match[1].toUpperCase()),
    "symbol",
    issues,
  );
  const expiration = oneValue(
    matches(expirationPattern, rawText).map((match) => match[1]),
    "expiration",
    issues,
  );
  const alertedPremium = oneValue(
    matches(premiumPattern, rawText).map((match) => Number(match[1])),
    "alertedPremium",
    issues,
  );

  return ok({
    rawText,
    symbol,
    side: contract.side,
    strike: contract.strike,
    expiration,
    alertedPremium,
    submittedAt,
    tags: extractTags(rawText),
    issues,
  });
};
