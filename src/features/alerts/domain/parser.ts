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
const nonSymbolWords = new Set(["ALERT", "BUY", "SELL", "CALL", "PUT"]);

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
  contracts: { strike: number | null; side: OptionSide }[],
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

const isPositiveFiniteNumber = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const isValidExpiration = (value: string): boolean => {
  const [month, day] = value.split("/").map(Number);
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
};

const oneValidValue = <T>(
  values: T[],
  isValid: (value: T) => boolean,
  field: AlertField,
  issues: ParseIssue[],
): T | null => {
  if (values.some((value) => !isValid(value))) {
    issues.push({ field, code: "invalid" });
    return null;
  }

  return oneValue(values, field, issues);
};

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
  const hasInvalidStrike = contracts.some(
    (contract) => !isPositiveFiniteNumber(contract.strike),
  );

  if (hasInvalidStrike) {
    issues.push({ field: "strike", code: "invalid" });
  }

  const contract = oneContract(
    contracts.map((candidate) => ({
      ...candidate,
      strike: isPositiveFiniteNumber(candidate.strike) ? candidate.strike : null,
    })),
    issues,
  );
  const symbolCandidates = matches(symbolPattern, rawText).map((match) =>
    match[1].toUpperCase(),
  );
  const unconfirmedSymbols = symbolCandidates.filter((symbol) =>
    nonSymbolWords.has(symbol),
  );

  if (unconfirmedSymbols.length > 0) {
    issues.push({ field: "symbol", code: "invalid" });
  }

  const symbol = oneValue(
    symbolCandidates.filter((symbol) => !nonSymbolWords.has(symbol)),
    "symbol",
    issues,
  );
  const expiration = oneValidValue(
    matches(expirationPattern, rawText).map((match) => match[1]),
    isValidExpiration,
    "expiration",
    issues,
  );
  const alertedPremium = oneValidValue(
    matches(premiumPattern, rawText).map((match) => Number(match[1])),
    isPositiveFiniteNumber,
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
