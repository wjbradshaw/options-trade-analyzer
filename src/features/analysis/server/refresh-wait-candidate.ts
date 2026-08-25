import { analyzeEntry, type EntryAnalysis } from "@/features/analysis/domain/analyzer";
import { calculateDte, calculateMaxPremiumLoss } from "@/features/analysis/domain/calculations";
import type { AnalysisFactor, ContextualEvidence } from "@/features/analysis/domain/factors";
import type { AlertRepository } from "@/features/alerts/server/alert-repository";
import type {
  AnalysisRepository,
  AnalysisReadRepository,
  SavedAnalysis,
} from "@/features/analysis/server/analysis-repository";
import type { AnalysisWorkflowPersistence } from "@/features/analysis/server/analysis-workflow-repository";
import type { WatchCandidateRefresh } from "@/features/decisions/ui/watch-candidate-card";
import type {
  WatchCandidateReadRepository,
  WatchCandidateRepository,
} from "@/features/decisions/server/watch-candidate-repository";
import { evaluateFreshness, type MarketSnapshot } from "@/features/market/domain/snapshot";
import type { ProfileRepository } from "@/features/profile/server/profile-repository";
import { calculateRiskAssessment } from "@/features/profile/domain/risk";
import { err, ok, type Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";

export interface RefreshWaitCandidateCommand {
  candidateId: string;
  marketSnapshot: MarketSnapshot;
  quantity: 1 | 2 | 3;
  plannedLoss?: number;
}

export interface RefreshWaitCandidateDependencies {
  authenticate(): Promise<string | null>;
  profileRepository: ProfileRepository;
  alertRepository: AlertRepository;
  analysisRepository: AnalysisRepository & Pick<AnalysisReadRepository, "getAnalysis">;
  candidateRepository: WatchCandidateRepository & Pick<WatchCandidateReadRepository, "getCandidate">;
  workflowPersistence: AnalysisWorkflowPersistence;
  now(): Date;
}

const failure = (message: string): Result<never, RepositoryError> =>
  err({ code: "database", message });

export const entryAnalysisFromSaved = (saved: SavedAnalysis): EntryAnalysis | null => {
  const payload = saved.factors;
  if (
    payload.modelVersion !== "phase-1-v1" ||
    typeof payload.evidenceCoverage !== "number" ||
    payload.scoreMeaning !== "Evidence strength, not probability of profit" ||
    !Array.isArray(payload.factors)
  ) {
    return null;
  }
  return {
    modelVersion: "phase-1-v1",
    verdict: saved.verdict,
    score: saved.evidenceScore,
    evidenceCoverage: payload.evidenceCoverage,
    scoreMeaning: "Evidence strength, not probability of profit",
    factors: payload.factors as unknown as AnalysisFactor[],
  };
};

const evidenceFromFactor = (factor: AnalysisFactor | undefined): ContextualEvidence | undefined => {
  if (!factor || factor.source === null || factor.capturedAt === null) return undefined;
  return {
    verified: factor.status !== "unverified",
    support: factor.availablePoints === 0 ? 0 : factor.earnedPoints / factor.availablePoints,
    summary: factor.summary,
    source: factor.source,
    capturedAt: factor.capturedAt,
  };
};

const changedEvidence = (before: EntryAnalysis, after: EntryAnalysis) =>
  after.factors.flatMap((latest) => {
    const previous = before.factors.find((factor) => factor.category === latest.category);
    if (previous && previous.status === latest.status && previous.summary === latest.summary) return [];
    return [{
      category: latest.category,
      before: previous ? `${previous.status}: ${previous.summary}` : "Not previously recorded",
      after: `${latest.status}: ${latest.summary}`,
    }];
  });

export const createRefreshWaitCandidate =
  (dependencies: RefreshWaitCandidateDependencies) =>
  async (
    command: RefreshWaitCandidateCommand,
  ): Promise<Result<WatchCandidateRefresh, RepositoryError>> => {
    const userId = await dependencies.authenticate();
    if (userId === null) return failure("Sign in before refreshing a candidate.");
    const candidateResult = await dependencies.candidateRepository.getCandidate(command.candidateId);
    if (!candidateResult.ok) return candidateResult;
    const candidate = candidateResult.value;
    if (candidate.userId !== userId || candidate.status !== "watching") {
      return failure("Watching candidate was not found.");
    }

    const profile = await dependencies.profileRepository.getProfile();
    if (!profile.ok) return failure(profile.error.message);
    const [alertResult, beforeResult] = await Promise.all([
      dependencies.alertRepository.getAlert(candidate.tradeAlertId),
      dependencies.analysisRepository.getAnalysis(candidate.latestAnalysisId),
    ]);
    if (!alertResult.ok) return alertResult;
    if (!beforeResult.ok) return beforeResult;
    const beforeAnalysis = entryAnalysisFromSaved(beforeResult.value);
    if (!beforeAnalysis) return failure("Saved analysis evidence could not be restored.");

    try {
      const now = dependencies.now();
      const expiration = alertResult.value.expiration as string;
      const dte = calculateDte({ asOf: now.toISOString().slice(0, 10), expiration });
      if (dte < 0) return failure("This saved contract has expired and cannot be refreshed.");
      const freshness = evaluateFreshness({ ...command.marketSnapshot, dte }, now);
      if (dte <= 1 && freshness.status !== "fresh") {
        return failure("Confirm current option premium and underlying price before refreshing this short-dated contract.");
      }
      const premium = command.marketSnapshot.optionPremium ?? alertResult.value.alertedPremium;
      if (premium === null || premium <= 0) return failure("A positive option premium is required for refresh.");
      const maximumLoss = calculateMaxPremiumLoss({ premium, quantity: command.quantity });
      const riskAssessment = calculateRiskAssessment({
        budget: profile.value.optionsBudget,
        maxLoss: maximumLoss,
        plannedLoss: command.plannedLoss ?? maximumLoss,
        dte,
        quantity: command.quantity,
      });
      const factor = (category: AnalysisFactor["category"]) =>
        beforeAnalysis.factors.find((item) => item.category === category);
      const latestAnalysis = analyzeEntry({
        alert: alertResult.value,
        dte,
        riskAssessment,
        marketSnapshot: command.marketSnapshot,
        freshness,
        catalyst: evidenceFromFactor(factor("catalyst")),
        technicalAlignment: evidenceFromFactor(factor("technicalAlignment")),
        volatility: evidenceFromFactor(factor("volatility")),
        liquidity: evidenceFromFactor(factor("liquidity")),
        thesis: evidenceFromFactor(factor("thesisQuality")),
      });
      if (!dependencies.workflowPersistence.commitCandidateRefresh) {
        return failure("Candidate refresh transaction is unavailable.");
      }
      const analyzedAt = now.toISOString();
      const persisted = await dependencies.workflowPersistence.commitCandidateRefresh({
        userId,
        candidateId: candidate.id,
        tradeAlertId: candidate.tradeAlertId,
        marketSnapshot: command.marketSnapshot,
        dte,
        riskAssessment,
        analysis: latestAnalysis,
        analyzedAt,
      });
      if (!persisted.ok) return persisted;
      const refreshedCandidate = {
        ...candidate,
        latestAnalysisId: persisted.value.analysisId,
        updatedAt: analyzedAt,
      };
      return ok({
        candidate: refreshedCandidate,
        beforeAnalysis,
        beforeAnalyzedAt: beforeResult.value.analyzedAt,
        latestAnalysis,
        latestAnalyzedAt: analyzedAt,
        changedEvidence: changedEvidence(beforeAnalysis, latestAnalysis),
      });
    } catch {
      return failure("The candidate refresh could not be completed.");
    }
  };
