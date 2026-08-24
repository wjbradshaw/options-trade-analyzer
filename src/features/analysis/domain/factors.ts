export const factorWeights = {
  contractCompleteness: 10,
  timeRisk: 15,
  personalRiskFit: 20,
  catalyst: 10,
  technicalAlignment: 15,
  volatility: 10,
  liquidity: 10,
  thesisQuality: 10,
} as const;

export type AnalysisFactorCategory = keyof typeof factorWeights;

export type AnalysisFactorStatus = "supported" | "limited" | "unverified";

export interface AnalysisFactor {
  category: AnalysisFactorCategory;
  weight: number;
  status: AnalysisFactorStatus;
  earnedPoints: number;
  availablePoints: number;
  summary: string;
  source: string | null;
  capturedAt: string | null;
}

export interface ContextualEvidence {
  verified: boolean;
  support: number;
  summary: string;
  source: string;
  capturedAt: string;
}
