import type { ParsedHostFollowUp } from "./follow-up-parser";

export interface CandidateMatchPosition {
  id: string;
  symbol: string;
  strike: number;
  optionSide: "call" | "put";
  expiration: string;
}

export type MatchResult =
  | { status: "single_match"; matchedPosition: CandidateMatchPosition }
  | { status: "ambiguous"; candidatePositions: CandidateMatchPosition[] }
  | { status: "no_match" };

export const matchFollowUpToPositions = (
  followUp: ParsedHostFollowUp,
  openPositions: CandidateMatchPosition[],
): MatchResult => {
  if (!followUp.symbol) {
    return { status: "no_match" };
  }

  const symbolMatches = openPositions.filter(
    (p) => p.symbol.toUpperCase() === followUp.symbol?.toUpperCase(),
  );

  if (symbolMatches.length === 0) {
    return { status: "no_match" };
  }

  // Check if strike and option side filter to single match
  let exactMatches = symbolMatches;

  if (followUp.strike !== null) {
    exactMatches = exactMatches.filter((p) => p.strike === followUp.strike);
  }

  if (followUp.optionSide !== null) {
    exactMatches = exactMatches.filter((p) => p.optionSide === followUp.optionSide);
  }

  if (exactMatches.length === 1) {
    return { status: "single_match", matchedPosition: exactMatches[0] };
  }

  if (exactMatches.length > 1) {
    return { status: "ambiguous", candidatePositions: exactMatches };
  }

  // If strike/side filter produced 0, but symbol matches exist, return symbol matches as ambiguous candidates
  return { status: "ambiguous", candidatePositions: symbolMatches };
};
