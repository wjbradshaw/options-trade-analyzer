import { validateCriticalFields } from "@/features/alerts/domain/validation";
import type { ParseIssue, ParsedTradeAlert } from "@/features/alerts/domain/types";
import type { RiskAssessment } from "@/features/profile/domain/risk";
import {
  evaluateFreshness,
  MarketSnapshotSchema,
  type FreshnessEvaluation,
  type MarketSnapshot,
  type RequiredSnapshotPrice,
} from "@/features/market/domain/snapshot";
import {
  factorWeights,
  type AnalysisFactor,
  type AnalysisFactorCategory,
  type ContextualEvidence,
} from "./factors";

const scoreMeaning = "Evidence strength, not probability of profit";

export type EntryVerdict = "Consider" | "Wait" | "Pass";

export interface EntryAnalysis {
  verdict: EntryVerdict;
  score: number;
  evidenceCoverage: number;
  scoreMeaning: typeof scoreMeaning;
  factors: AnalysisFactor[];
}

export interface AnalyzeEntryInput {
  alert: ParsedTradeAlert;
  dte: number;
  riskAssessment: RiskAssessment;
  marketSnapshot: MarketSnapshot;
  freshness: FreshnessEvaluation;
  catalyst?: ContextualEvidence;
  technicalAlignment?: ContextualEvidence;
  volatility?: ContextualEvidence;
  liquidity?: ContextualEvidence;
  thesis?: ContextualEvidence;
}

export type EntryAnalysisBlockedCode =
  | "incomplete_contract"
  | "freshness_blocked"
  | "invalid_dte"
  | "invalid_market_snapshot";

export class EntryAnalysisBlockedError extends Error {
  readonly code: EntryAnalysisBlockedCode;
  readonly issues?: ParseIssue[];
  readonly missing?: RequiredSnapshotPrice[];

  constructor(
    code: EntryAnalysisBlockedCode,
    details: {
      issues?: ParseIssue[];
      missing?: RequiredSnapshotPrice[];
    } = {},
  ) {
    super(
      code === "incomplete_contract"
        ? "A complete option contract is required before scoring."
        : code === "invalid_dte"
          ? "DTE must be a finite non-negative whole number."
          : code === "invalid_market_snapshot"
            ? "The market snapshot is invalid."
            : "A fresh short-dated market snapshot is required before scoring.",
    );
    this.name = "EntryAnalysisBlockedError";
    this.code = code;
    this.issues = details.issues;
    this.missing = details.missing;
  }
}

const percentage = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 100;

const makeFactor = (
  category: AnalysisFactorCategory,
  values: Omit<AnalysisFactor, "category" | "weight">,
): AnalysisFactor => ({
  category,
  weight: factorWeights[category],
  ...values,
});

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const contextualFactor = (
  category:
    | "catalyst"
    | "technicalAlignment"
    | "volatility"
    | "liquidity"
    | "thesisQuality",
  evidence: ContextualEvidence | undefined,
): AnalysisFactor => {
  const weight = factorWeights[category];

  if (evidence === undefined) {
    return makeFactor(category, {
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      summary: `No verified ${category} evidence was provided.`,
      source: null,
      capturedAt: null,
    });
  }

  if (
    evidence.verified &&
    (!Number.isFinite(evidence.support) ||
      evidence.support < 0 ||
      evidence.support > 1)
  ) {
    throw new RangeError("Verified evidence support must be between zero and one");
  }

  const validMetadata =
    isNonBlankString(evidence.summary) &&
    isNonBlankString(evidence.source) &&
    MarketSnapshotSchema.shape.confirmedAt.safeParse(evidence.capturedAt).success;

  if (!validMetadata) {
    return makeFactor(category, {
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      summary: "Contextual evidence could not be verified.",
      source: null,
      capturedAt: null,
    });
  }

  if (!evidence.verified) {
    return makeFactor(category, {
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      summary: evidence.summary,
      source: evidence.source,
      capturedAt: evidence.capturedAt,
    });
  }

  return makeFactor(category, {
    status: evidence.support === 1 ? "supported" : "limited",
    earnedPoints: weight * evidence.support,
    availablePoints: weight,
    summary: evidence.summary,
    source: evidence.source,
    capturedAt: evidence.capturedAt,
  });
};

const contractFactor = (alert: ParsedTradeAlert): AnalysisFactor =>
  makeFactor("contractCompleteness", {
    status: "supported",
    earnedPoints: factorWeights.contractCompleteness,
    availablePoints: factorWeights.contractCompleteness,
    summary: "Ticker, option side, strike, and expiration are confirmed.",
    source: "Validated trade alert",
    capturedAt: alert.submittedAt,
  });

const timeRiskFactor = (
  freshness: Exclude<FreshnessEvaluation, { status: "blocked" }>,
  marketSnapshot: MarketSnapshot,
): AnalysisFactor => {
  const source = "Manual market snapshot";
  const capturedAt = marketSnapshot.confirmedAt;

  if (freshness.status === "stale") {
    return makeFactor("timeRisk", {
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      summary: "DTE is confirmed, but the market snapshot is stale.",
      source,
      capturedAt,
    });
  }

  return makeFactor("timeRisk", {
    status: freshness.status === "fresh" ? "supported" : "limited",
    earnedPoints: factorWeights.timeRisk,
    availablePoints: factorWeights.timeRisk,
    summary:
      freshness.status === "fresh"
        ? "DTE and the market snapshot are confirmed."
        : "DTE is confirmed and the market snapshot is delayed.",
    source,
    capturedAt,
  });
};

const riskFactor = (riskAssessment: RiskAssessment): AnalysisFactor => {
  if (riskAssessment.tier === "normal") {
    return makeFactor("personalRiskFit", {
      status: "supported",
      earnedPoints: factorWeights.personalRiskFit,
      availablePoints: factorWeights.personalRiskFit,
      summary: "Risk is within the normal options-budget range.",
      source: "Risk assessment",
      capturedAt: null,
    });
  }

  if (riskAssessment.tier === "caution") {
    return makeFactor("personalRiskFit", {
      status: "limited",
      earnedPoints: factorWeights.personalRiskFit / 2,
      availablePoints: factorWeights.personalRiskFit,
      summary: "Risk is in the caution range for the options budget.",
      source: "Risk assessment",
      capturedAt: null,
    });
  }

  return makeFactor("personalRiskFit", {
    status: "limited",
    earnedPoints: 0,
    availablePoints: factorWeights.personalRiskFit,
    summary: "Too aggressive",
    source: "Risk assessment",
    capturedAt: null,
  });
};

const requireScoringGates = ({
  alert,
  dte,
  marketSnapshot,
  freshness,
}: Pick<
  AnalyzeEntryInput,
  "alert" | "dte" | "marketSnapshot" | "freshness"
>): Exclude<FreshnessEvaluation, { status: "blocked" }> => {
  const issues = validateCriticalFields(alert);

  if (issues.length > 0) {
    throw new EntryAnalysisBlockedError("incomplete_contract", { issues });
  }

  if (!Number.isFinite(dte) || dte < 0 || !Number.isInteger(dte)) {
    throw new EntryAnalysisBlockedError("invalid_dte");
  }

  const shortDated = dte === 0 || dte === 1;

  if (shortDated) {
    const snapshotFreshness = evaluateFreshness(
      { ...marketSnapshot, dte },
      new Date(marketSnapshot.confirmedAt),
    );

    if (snapshotFreshness.status === "blocked") {
      throw new EntryAnalysisBlockedError("freshness_blocked", {
        missing: snapshotFreshness.missing,
      });
    }
  }

  if (!MarketSnapshotSchema.safeParse(marketSnapshot).success) {
    throw new EntryAnalysisBlockedError("invalid_market_snapshot");
  }

  if (freshness.status === "blocked") {
    throw new EntryAnalysisBlockedError("freshness_blocked", {
      missing: freshness.missing,
    });
  }

  if (shortDated && freshness.status !== "fresh") {
    throw new EntryAnalysisBlockedError("freshness_blocked");
  }

  return freshness;
};

export const analyzeEntry = (input: AnalyzeEntryInput): EntryAnalysis => {
  const verifiedFreshness = requireScoringGates(input);

  const factors = [
    contractFactor(input.alert),
    timeRiskFactor(verifiedFreshness, input.marketSnapshot),
    riskFactor(input.riskAssessment),
    contextualFactor("catalyst", input.catalyst),
    contextualFactor("technicalAlignment", input.technicalAlignment),
    contextualFactor("volatility", input.volatility),
    contextualFactor("liquidity", input.liquidity),
    contextualFactor("thesisQuality", input.thesis),
  ];
  const earnedPoints = factors.reduce((total, factor) => total + factor.earnedPoints, 0);
  const availablePoints = factors.reduce(
    (total, factor) => total + factor.availablePoints,
    0,
  );
  const totalWeight = factors.reduce((total, factor) => total + factor.weight, 0);
  const score = percentage(earnedPoints, availablePoints);
  const evidenceCoverage = percentage(availablePoints, totalWeight);
  const hardRiskFailure = input.riskAssessment.tier === "too_aggressive";
  const missingConfirmableEvidence = factors.some(
    (factor) => factor.status === "unverified",
  );
  const verdict: EntryVerdict =
    hardRiskFailure || score < 40
      ? "Pass"
      : score >= 70 && evidenceCoverage >= 70 && !missingConfirmableEvidence
        ? "Consider"
        : "Wait";

  return { verdict, score, evidenceCoverage, scoreMeaning, factors };
};
