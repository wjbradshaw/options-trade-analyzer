import type { HostEventType } from "@/features/positions/domain/types";

export interface ParsedHostFollowUp {
  rawText: string;
  eventType: HostEventType;
  symbol: string | null;
  optionSide: "call" | "put" | null;
  strike: number | null;
  claimedEntryPremium: number | null;
  claimedExitPremium: number | null;
  claimedPercentage: number | null;
  notes: string | null;
}

const stopWords = new Set([
  "ALL",
  "OUT",
  "TRIM",
  "TRIMMED",
  "TRIMMING",
  "CALL",
  "CALLS",
  "PUT",
  "PUTS",
  "FROM",
  "AT",
  "STOPS",
  "ON",
  "HERE",
  "TO",
  "BREAKEVEN",
  "HALF",
  "AND",
  "THE",
  "FOR",
]);

export const parseHostFollowUp = (rawText: string): ParsedHostFollowUp => {
  const text = rawText.trim();
  const upper = text.toUpperCase();

  let eventType: HostEventType = "note";
  if (upper.includes("ALL OUT") || upper.includes("CLOSED") || upper.includes("OUT ALL")) {
    eventType = "all_out";
  } else if (upper.includes("TRIM") || upper.includes("OUT HALF") || upper.includes("OUT 1/2") || upper.includes("OUT 1/3")) {
    eventType = "trimmed";
  } else if (upper.includes("ADD") || upper.includes("AVERAGE")) {
    eventType = "added";
  }

  // Contract format: 6000C or 6000 CALL or 250P or 250 PUT
  let strike: number | null = null;
  let optionSide: "call" | "put" | null = null;

  const contractMatch = upper.match(/(\d+(?:\.\d+)?)\s*(C|CALL|P|PUT)\b/);
  if (contractMatch) {
    strike = Number(contractMatch[1]);
    optionSide = contractMatch[2].startsWith("C") ? "call" : "put";
  }

  // Find candidate symbol
  const words = upper.split(/[\s,@]+/);
  let symbol: string | null = null;
  for (const word of words) {
    const clean = word.replace(/[^A-Z]/g, "");
    if (clean.length >= 1 && clean.length <= 5 && !stopWords.has(clean)) {
      // Avoid matches that are part of the contract format (e.g. 6000C -> C)
      if (strike !== null && (clean === "C" || clean === "P")) {
        continue;
      }
      symbol = clean;
      break;
    }
  }

  // Exit price format: @ 5.50 or @2.10
  let claimedExitPremium: number | null = null;
  const exitMatch = text.match(/@\s*(\d+(?:\.\d+)?)/);
  if (exitMatch) {
    claimedExitPremium = Number(exitMatch[1]);
  }

  // Entry comparison: from .73 or from 0.73
  let claimedEntryPremium: number | null = null;
  const entryMatch = text.match(/from\s+(\.?\d+(?:\.\d+)?)/i);
  if (entryMatch) {
    claimedEntryPremium = Number(entryMatch[1]);
  }

  // Percentage trim/gain: 41% or +50%
  let claimedPercentage: number | null = null;
  const pctMatch = text.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    claimedPercentage = Math.abs(Number(pctMatch[1]));
  } else if (claimedExitPremium !== null && claimedEntryPremium !== null && claimedEntryPremium > 0) {
    claimedPercentage = ((claimedExitPremium - claimedEntryPremium) / claimedEntryPremium) * 100;
  }

  return {
    rawText,
    eventType,
    symbol,
    optionSide,
    strike,
    claimedEntryPremium,
    claimedExitPremium,
    claimedPercentage,
    notes: text,
  };
};
