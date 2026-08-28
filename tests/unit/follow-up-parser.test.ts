import { describe, expect, it } from "vitest";
import { parseHostFollowUp } from "@/features/alerts/domain/follow-up-parser";
import { matchFollowUpToPositions } from "@/features/alerts/domain/position-matcher";

describe("parseHostFollowUp", () => {
  it("parses all-out exit update with exit price and contract info", () => {
    const parsed = parseHostFollowUp("ALL OUT SPX 6000C @ 5.50");

    expect(parsed).toMatchObject({
      eventType: "all_out",
      symbol: "SPX",
      strike: 6000,
      optionSide: "call",
      claimedExitPremium: 5.5,
    });
  });

  it("parses percentage trim update", () => {
    const parsed = parseHostFollowUp("41% trimmed on TSLA 250P @ 3.20");

    expect(parsed).toMatchObject({
      eventType: "trimmed",
      claimedPercentage: 41,
      symbol: "TSLA",
      strike: 250,
      optionSide: "put",
      claimedExitPremium: 3.2,
    });
  });

  it("parses comparative exit format '345 @2.10 from .73'", () => {
    const parsed = parseHostFollowUp("SPX 6000C @2.10 from .73");

    expect(parsed).toMatchObject({
      symbol: "SPX",
      strike: 6000,
      optionSide: "call",
      claimedExitPremium: 2.1,
      claimedEntryPremium: 0.73,
    });
    expect(parsed.claimedPercentage).toBeCloseTo(187.67, 1);
  });

  it("parses generic note or breakeven update", () => {
    const parsed = parseHostFollowUp("stops to breakeven on NVDA");

    expect(parsed).toMatchObject({
      eventType: "note",
      symbol: "NVDA",
    });
  });
});

describe("matchFollowUpToPositions", () => {
  const openPositions = [
    {
      id: "pos-1",
      symbol: "SPX",
      strike: 6000,
      optionSide: "call" as const,
      expiration: "2030-01-18",
    },
    {
      id: "pos-2",
      symbol: "TSLA",
      strike: 250,
      optionSide: "put" as const,
      expiration: "2030-01-18",
    },
    {
      id: "pos-3",
      symbol: "SPX",
      strike: 5900,
      optionSide: "call" as const,
      expiration: "2030-01-18",
    },
  ];

  it("identifies an exact single match when ticker, strike, and side match", () => {
    const parsed = parseHostFollowUp("ALL OUT SPX 6000C @ 5.50");
    const result = matchFollowUpToPositions(parsed, openPositions);

    expect(result.status).toBe("single_match");
    if (result.status === "single_match") {
      expect(result.matchedPosition.id).toBe("pos-1");
    }
  });

  it("identifies ambiguous candidate matches when only ticker is specified", () => {
    const parsed = parseHostFollowUp("ALL OUT SPX");
    const result = matchFollowUpToPositions(parsed, openPositions);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidatePositions).toHaveLength(2); // pos-1 and pos-3
    }
  });

  it("returns no_match when ticker is not in active positions", () => {
    const parsed = parseHostFollowUp("ALL OUT AAPL 200C");
    const result = matchFollowUpToPositions(parsed, openPositions);

    expect(result.status).toBe("no_match");
  });
});
