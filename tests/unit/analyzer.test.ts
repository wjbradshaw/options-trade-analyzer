import { describe, expect, it } from "vitest";
import {
  analyzeEntry,
  EntryAnalysisBlockedError,
} from "@/features/analysis/domain/analyzer";
import type { AnalyzeEntryInput } from "@/features/analysis/domain/analyzer";

const submittedAt = "2026-08-14T14:45:00.000Z";
const confirmedAt = "2026-08-14T15:00:00.000Z";

const verifiedEvidence = (support = 1) => ({
  verified: true,
  support,
  summary: "Verified supporting evidence.",
  source: "Manual review",
  capturedAt: confirmedAt,
});

const completeSupportiveInput = (): AnalyzeEntryInput => ({
  alert: {
    rawText: "NBIS 2026-08-20 220c",
    symbol: "NBIS",
    side: "call" as const,
    strike: 220,
    expiration: "2026-08-20",
    alertedPremium: 2.98,
    submittedAt,
    tags: [],
    issues: [],
  },
  dte: 6,
  riskAssessment: {
    plannedLoss: 100,
    maximumLoss: 100,
    controllingLoss: 100,
    riskPercent: 1,
    tier: "normal" as const,
    quantityStatus: "normal" as const,
  },
  marketSnapshot: {
    optionPremium: 2.98,
    underlyingPrice: 220,
    confirmedAt,
  },
  freshness: { status: "fresh" as const },
  catalyst: verifiedEvidence(),
  technicalAlignment: verifiedEvidence(),
  volatility: verifiedEvidence(),
  liquidity: verifiedEvidence(),
  thesis: verifiedEvidence(),
});

const findFactor = (
  analysis: ReturnType<typeof analyzeEntry>,
  category: string,
) => {
  const factor = analysis.factors.find((candidate) => candidate.category === category);

  if (factor === undefined) {
    throw new Error(`Expected ${category} factor`);
  }

  return factor;
};

describe("analyzeEntry", () => {
  it("returns all fixed evidence categories with weights totaling 100 and transparent metadata (mutation: omit a category or its evidence metadata)", () => {
    const analysis = analyzeEntry(completeSupportiveInput());

    expect(
      analysis.factors.map(({ category, weight }) => ({ category, weight })),
    ).toEqual([
      { category: "contractCompleteness", weight: 10 },
      { category: "timeRisk", weight: 15 },
      { category: "personalRiskFit", weight: 20 },
      { category: "catalyst", weight: 10 },
      { category: "technicalAlignment", weight: 15 },
      { category: "volatility", weight: 10 },
      { category: "liquidity", weight: 10 },
      { category: "thesisQuality", weight: 10 },
    ]);
    expect(analysis.factors.reduce((total, factor) => total + factor.weight, 0)).toBe(
      100,
    );
    expect(findFactor(analysis, "contractCompleteness")).toMatchObject({
      status: "supported",
      earnedPoints: 10,
      availablePoints: 10,
      source: "Validated trade alert",
      capturedAt: submittedAt,
    });
    expect(findFactor(analysis, "catalyst")).toMatchObject({
      status: "supported",
      earnedPoints: 10,
      availablePoints: 10,
      summary: "Verified supporting evidence.",
      source: "Manual review",
      capturedAt: confirmedAt,
    });
  });

  it("returns a Consider verdict for complete, verified, supportive evidence (mutation: raise the Consider threshold or ignore full support)", () => {
    const analysis = analyzeEntry(completeSupportiveInput());

    expect(analysis).toMatchObject({
      verdict: "Consider",
      score: 100,
      evidenceCoverage: 100,
      scoreMeaning: "Evidence strength, not probability of profit",
    });
  });

  it("returns Wait when thesis evidence is absent even if every available factor is supportive (mutation: let missing thesis silently support Consider)", () => {
    const input = completeSupportiveInput();
    input.thesis = undefined;

    const analysis = analyzeEntry(input);

    expect(analysis).toMatchObject({
      verdict: "Wait",
      score: 100,
      evidenceCoverage: 90,
    });
    expect(findFactor(analysis, "thesisQuality")).toMatchObject({
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      source: null,
      capturedAt: null,
    });
  });

  it("reports absent catalyst evidence as unavailable rather than negative evidence (mutation: count unverified catalyst against the verified score)", () => {
    const input = completeSupportiveInput();
    input.catalyst = undefined;

    const analysis = analyzeEntry(input);

    expect(analysis).toMatchObject({
      verdict: "Wait",
      score: 100,
      evidenceCoverage: 90,
    });
    expect(findFactor(analysis, "catalyst")).toMatchObject({
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
    });
  });

  it("prevents sparse high-support evidence from receiving Consider (mutation: use verified-score alone as the verdict gate)", () => {
    const input = completeSupportiveInput();
    input.technicalAlignment = undefined;
    input.volatility = undefined;
    input.liquidity = undefined;
    input.thesis = undefined;

    const analysis = analyzeEntry(input);

    expect(analysis).toMatchObject({
      verdict: "Wait",
      score: 100,
      evidenceCoverage: 55,
    });
  });

  it("uses 39, 40, 69, and 70 as exact Pass, Wait, Wait, and Consider score boundaries when coverage is complete (mutation: shift a score boundary)", () => {
    const inputForScore = (score: 39 | 40 | 69 | 70) => {
      const input = completeSupportiveInput();
      input.riskAssessment = {
        ...input.riskAssessment,
        riskPercent: 1.5,
        tier: "caution",
      };
      input.catalyst = verifiedEvidence(
        score === 39 ? 0.4 : score === 40 ? 0.5 : 1,
      );
      input.technicalAlignment = verifiedEvidence(score >= 69 ? 1 : 0);
      input.volatility = verifiedEvidence(score === 69 ? 0.9 : score === 70 ? 1 : 0);
      input.liquidity = verifiedEvidence(0);
      input.thesis = verifiedEvidence(0);
      return input;
    };

    for (const [score, verdict] of [
      [39, "Pass"],
      [40, "Wait"],
      [69, "Wait"],
      [70, "Consider"],
    ] as const) {
      const analysis = analyzeEntry(inputForScore(score));

      expect(analysis.score).toBe(score);
      expect(analysis.evidenceCoverage).toBe(100);
      expect(analysis.verdict).toBe(verdict);
    }
  });

  it("makes an existing Too aggressive risk assessment a hard Pass (mutation: treat too_aggressive risk as Wait)", () => {
    const input = completeSupportiveInput();
    input.dte = 0;
    input.riskAssessment = {
      ...input.riskAssessment,
      controllingLoss: 250,
      riskPercent: 2.5,
      tier: "too_aggressive",
    };

    const analysis = analyzeEntry(input);

    expect(analysis.verdict).toBe("Pass");
    expect(findFactor(analysis, "personalRiskFit")).toMatchObject({
      status: "limited",
      earnedPoints: 0,
      availablePoints: 20,
      summary: "Too aggressive",
    });
  });

  it("keeps a stale longer-dated snapshot visible and waits for refresh rather than treating it as Consider support (mutation: count stale data as verified support)", () => {
    const input = completeSupportiveInput();
    input.freshness = { status: "stale" };
    input.marketSnapshot = {
      ...input.marketSnapshot,
      confirmedAt: "2026-08-13T14:59:59.999Z",
    };

    const analysis = analyzeEntry(input);

    expect(analysis).toMatchObject({
      verdict: "Wait",
      score: 100,
      evidenceCoverage: 85,
    });
    expect(findFactor(analysis, "timeRisk")).toMatchObject({
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      source: "Manual market snapshot",
      capturedAt: "2026-08-13T14:59:59.999Z",
    });
  });

  it("blocks incomplete contracts before returning a setup score or verdict (mutation: relabel incomplete contract as Wait)", () => {
    const input = completeSupportiveInput();
    input.alert = { ...input.alert, symbol: null };

    let blockedError: unknown;

    try {
      analyzeEntry(input);
    } catch (error) {
      blockedError = error;
    }

    expect(blockedError).toBeInstanceOf(EntryAnalysisBlockedError);
    expect(blockedError).toMatchObject({
      code: "incomplete_contract",
      issues: [{ field: "symbol", code: "required" }],
    });
  });

  it("blocks zero-DTE analysis with a missing manually confirmed price before returning a setup score or verdict (mutation: downgrade blocked freshness to Wait)", () => {
    const input = completeSupportiveInput();
    input.dte = 0;
    input.marketSnapshot = {
      ...input.marketSnapshot,
      optionPremium: null,
    };
    input.freshness = { status: "blocked", missing: ["optionPremium"] };

    let blockedError: unknown;

    try {
      analyzeEntry(input);
    } catch (error) {
      blockedError = error;
    }

    expect(blockedError).toBeInstanceOf(EntryAnalysisBlockedError);
    expect(blockedError).toMatchObject({
      code: "freshness_blocked",
      missing: ["optionPremium"],
    });
  });
});
