import { describe, expect, it } from "vitest";
import {
  createRefreshWaitCandidate,
  type RefreshWaitCandidateDependencies,
} from "@/features/analysis/server/refresh-wait-candidate";
import type { CandidateRefreshCommitInput } from "@/features/analysis/server/analysis-workflow-repository";
import { err, ok } from "@/lib/result";

const sourceAnalysis = {
  modelVersion: "phase-1-v1" as const,
  verdict: "Wait" as const,
  score: 100,
  evidenceCoverage: 45,
  scoreMeaning: "Evidence strength, not probability of profit" as const,
  factors: [
    {
      category: "technicalAlignment" as const,
      weight: 15,
      status: "unverified" as const,
      earnedPoints: 0,
      availablePoints: 0,
      summary: "Price confirmation is unresolved.",
      source: null,
      capturedAt: null,
    },
  ],
};

const makeDependencies = () => {
  const commits: CandidateRefreshCommitInput[] = [];
  const dependencies: RefreshWaitCandidateDependencies = {
    authenticate: async () => "user-1",
    profileRepository: {
      getProfile: async () =>
        ok({
          userId: "user-1",
          optionsBudget: 10_000,
          createdAt: "2026-08-14T15:00:00.000Z",
          updatedAt: "2026-08-14T15:00:00.000Z",
        }),
      upsertProfile: async () => err({ code: "database", message: "not used" }),
    },
    alertRepository: {
      saveAlert: async () => err({ code: "database", message: "not used" }),
      getAlert: async () =>
        ok({
          id: "alert-1",
          userId: "user-1",
          traderSourceId: "source-1",
          rawText: "NBIS 8/20 220c @1.00",
          correctedFields: { expiration: "8/20" },
          contractConfirmed: true,
          symbol: "NBIS",
          side: "call",
          strike: 220,
          expiration: "2026-08-20",
          alertedPremium: 1,
          submittedAt: "2026-08-14T15:00:00.000Z",
          tags: [],
          issues: [],
          createdAt: "2026-08-14T15:00:00.000Z",
          updatedAt: "2026-08-14T15:00:00.000Z",
        }),
    },
    analysisRepository: {
      saveAnalysis: async () => err({ code: "database", message: "not used" }),
      getAnalysis: async () =>
        ok({
          id: "analysis-1",
          userId: "user-1",
          tradeAlertId: "alert-1",
          marketSnapshotId: "snapshot-1",
          verdict: "Wait",
          evidenceScore: sourceAnalysis.score,
          factors: {
            modelVersion: sourceAnalysis.modelVersion,
            evidenceCoverage: sourceAnalysis.evidenceCoverage,
            scoreMeaning: sourceAnalysis.scoreMeaning,
            factors: sourceAnalysis.factors,
          },
          summary: null,
          analyzedAt: "2026-08-14T15:00:00.000Z",
          createdAt: "2026-08-14T15:00:00.000Z",
          updatedAt: "2026-08-14T15:00:00.000Z",
        }),
    },
    candidateRepository: {
      saveCandidate: async () => err({ code: "database", message: "not used" }),
      advanceLatestAnalysis: async () => err({ code: "database", message: "not used" }),
      getCandidate: async () =>
        ok({
          id: "candidate-1",
          userId: "user-1",
          tradeAlertId: "alert-1",
          sourceAnalysisId: "analysis-1",
          sourceAnalysisVerdict: "Wait",
          latestAnalysisId: "analysis-1",
          unresolvedConfirmationConditions: [
            {
              id: "technicalAlignment",
              category: "technicalAlignment",
              description: "Price confirmation is unresolved.",
            },
          ],
          status: "watching",
          createdAt: "2026-08-14T15:00:00.000Z",
          updatedAt: "2026-08-14T15:00:00.000Z",
        }),
    },
    workflowPersistence: {
      commitCompletedAnalysis: async () => err({ code: "database", message: "not used" }),
      commitCandidateRefresh: async (input) => {
        commits.push(structuredClone(input));
        return ok({ snapshotId: "snapshot-2", analysisId: "analysis-2" });
      },
    },
    now: () => new Date("2026-08-15T15:00:00.000Z"),
  };
  return { commits, dependencies };
};

describe("refresh Wait candidate", () => {
  it("authenticates before loading or committing candidate history", async () => {
    const { commits, dependencies } = makeDependencies();
    dependencies.authenticate = async () => null;

    const result = await createRefreshWaitCandidate(dependencies)({
      candidateId: "candidate-1",
      marketSnapshot: {
        optionPremium: 1,
        underlyingPrice: 221,
        confirmedAt: "2026-08-15T15:00:00.000Z",
      },
      quantity: 1,
    });

    expect(result).toEqual(err({ code: "database", message: "Sign in before refreshing a candidate." }));
    expect(commits).toEqual([]);
  });

  it("creates a new snapshot and analysis on the original alert before returning comparison evidence", async () => {
    const { commits, dependencies } = makeDependencies();

    const result = await createRefreshWaitCandidate(dependencies)({
      candidateId: "candidate-1",
      marketSnapshot: {
        optionPremium: 1,
        underlyingPrice: 221,
        confirmedAt: "2026-08-15T15:00:00.000Z",
      },
      quantity: 1,
    });

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      candidateId: "candidate-1",
      tradeAlertId: "alert-1",
      dte: 5,
      analyzedAt: "2026-08-15T15:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        candidate: { latestAnalysisId: "analysis-2", sourceAnalysisId: "analysis-1" },
        beforeAnalysis: { verdict: "Wait" },
        beforeAnalyzedAt: "2026-08-14T15:00:00.000Z",
        latestAnalysis: { verdict: "Wait" },
        latestAnalyzedAt: "2026-08-15T15:00:00.000Z",
        changedEvidence: expect.any(Array),
      },
    });
  });
});
