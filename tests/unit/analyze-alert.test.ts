import { describe, expect, it } from "vitest";
import type { ParsedTradeAlert } from "@/features/alerts/domain/types";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import {
  createAnalyzeAlert,
  createAnalyzeAlertForDashboard,
  resolveAlertExpiration,
  type AnalyzeAlertCommand,
  type AnalyzeAlertDependencies,
} from "@/features/analysis/server/analysis-workflow";
import type {
  AnalysisWorkflowCommitInput,
  CandidateRefreshCommitInput,
  AnalysisWorkflowPersistence,
} from "@/features/analysis/server/analysis-workflow-repository";
import { SupabaseAnalysisWorkflowPersistence } from "@/features/analysis/server/analysis-workflow-repository";
import type { ProfileRepository } from "@/features/profile/server/profile-repository";
import { err, ok } from "@/lib/result";

const submittedAt = "2026-08-14T14:45:00.000Z";
const confirmedAt = "2026-08-14T15:00:00.000Z";

const completeAlert = (): ParsedTradeAlert => ({
  rawText: "NBIS 8/20 220c @1.00",
  symbol: "NBIS",
  side: "call",
  strike: 220,
  expiration: "8/20",
  alertedPremium: 1,
  submittedAt,
  tags: [],
  issues: [],
});

const completeCommand = (): AnalyzeAlertCommand => ({
  alert: completeAlert(),
  traderSourceId: "source-1",
  marketSnapshot: {
    optionPremium: 1,
    underlyingPrice: 219,
    confirmedAt,
  },
  quantity: 1,
});

const makeDependencies = (overrides: Partial<AnalyzeAlertDependencies> = {}) => {
  const commits: AnalysisWorkflowCommitInput[] = [];
  let profileLoads = 0;
  const profileRepository: ProfileRepository = {
    getProfile: async () => {
      profileLoads += 1;
      return ok({
        userId: "user-1",
        optionsBudget: 10_000,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
    },
    upsertProfile: async () => {
      throw new Error("not used");
    },
  };
  const workflowPersistence: AnalysisWorkflowPersistence = {
    commitCompletedAnalysis: async (input) => {
      commits.push(structuredClone(input));
      return ok({
        alertId: "alert-1",
        snapshotId: "snapshot-1",
        analysisId: "analysis-1",
      });
    },
  };
  const dependencies: AnalyzeAlertDependencies = {
    authenticate: async () => "user-1",
    profileRepository,
    workflowPersistence,
    now: () => new Date(confirmedAt),
    ...overrides,
  };

  return {
    commits,
    dependencies,
    profileLoads: () => profileLoads,
  };
};

describe("resolveAlertExpiration", () => {
  it("uses the next non-past occurrence while retaining the submitted year when possible", () => {
    expect(resolveAlertExpiration("8/14", submittedAt)).toBe("2026-08-14");
    expect(resolveAlertExpiration("1/17", submittedAt)).toBe("2027-01-17");
  });

  it("advances to the next valid leap-day occurrence", () => {
    expect(resolveAlertExpiration("2/29", "2025-03-01T12:00:00.000Z")).toBe(
      "2028-02-29",
    );
  });
});

describe("analyze alert workflow", () => {
  it("authenticates before loading the profile or attempting persistence", async () => {
    const { dependencies, commits, profileLoads } = makeDependencies({
      authenticate: async () => null,
    });

    await expect(createAnalyzeAlert(dependencies)(completeCommand())).resolves.toEqual(
      err({ code: "unauthenticated", message: "Sign in before analyzing an alert." }),
    );
    expect(profileLoads()).toBe(0);
    expect(commits).toEqual([]);
  });

  it("returns profile_missing and makes no write when the options budget is absent", async () => {
    const { dependencies, commits } = makeDependencies({
      profileRepository: {
        getProfile: async () =>
          err({ code: "not_found", message: "Profile was not found" }),
        upsertProfile: async () => {
          throw new Error("not used");
        },
      },
    });

    await expect(createAnalyzeAlert(dependencies)(completeCommand())).resolves.toEqual(
      err({
        code: "profile_missing",
        message: "Set an options-only trading budget before analyzing an alert.",
      }),
    );
    expect(commits).toEqual([]);
  });

  it.each([
    ["ticker", { symbol: null }],
    ["side", { side: null }],
    ["positive strike", { strike: 0 }],
    ["expiration", { expiration: null }],
  ] as const)("blocks an invalid %s before scoring or persistence", async (_label, patch) => {
    const { dependencies, commits } = makeDependencies();
    const command = completeCommand();
    command.alert = { ...command.alert, ...patch } as ParsedTradeAlert;

    const result = await createAnalyzeAlert(dependencies)(command);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_contract" } });
    expect(commits).toEqual([]);
  });

  it("blocks a missing trader source before scoring or persistence", async () => {
    const { dependencies, commits } = makeDependencies();
    const command = completeCommand();
    command.traderSourceId = "";

    await expect(createAnalyzeAlert(dependencies)(command)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_contract" },
    });
    expect(commits).toEqual([]);
  });

  it("blocks stale zero-DTE prices before the transactional write", async () => {
    const { dependencies, commits } = makeDependencies({
      now: () => new Date("2026-08-14T15:16:00.000Z"),
    });
    const command = completeCommand();
    command.alert.expiration = "8/14";

    await expect(createAnalyzeAlert(dependencies)(command)).resolves.toEqual(
      err({
        code: "freshness_blocked",
        message: "Confirm current option premium and underlying price before scoring this short-dated contract.",
      }),
    );
    expect(commits).toEqual([]);
  });

  it("scores first, commits once, preserves shorthand, and returns only EntryAnalysis", async () => {
    const { dependencies, commits } = makeDependencies();

    const result = await createAnalyzeAlert(dependencies)(completeCommand());

    expect(result).toMatchObject({
      ok: true,
      value: {
        modelVersion: "phase-1-v1",
        verdict: "Wait",
        scoreMeaning: "Evidence strength, not probability of profit",
      },
    });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      userId: "user-1",
      traderSourceId: "source-1",
      alert: { expiration: "2026-08-20", rawText: "NBIS 8/20 220c @1.00" },
      correctedFields: { expiration: "8/20" },
      dte: 6,
      riskAssessment: {
        maximumLoss: 100,
        controllingLoss: 100,
        riskPercent: 1,
        tier: "normal",
      },
      analysis: result.ok ? result.value : ({} as EntryAnalysis),
    });
  });

  it("returns persistence_failed without falling back to independent writes", async () => {
    const workflowPersistence: AnalysisWorkflowPersistence = {
      commitCompletedAnalysis: async () =>
        err({ code: "database", message: "RPC transaction rolled back" }),
    };
    const { dependencies } = makeDependencies({ workflowPersistence });

    await expect(createAnalyzeAlert(dependencies)(completeCommand())).resolves.toEqual(
      err({
        code: "persistence_failed",
        message: "RPC transaction rolled back",
      }),
    );
  });

  it("maps unexpected scoring failures to analysis_failed without writing", async () => {
    const { dependencies, commits } = makeDependencies();
    const command = completeCommand();
    command.plannedLoss = Number.POSITIVE_INFINITY;

    await expect(createAnalyzeAlert(dependencies)(command)).resolves.toEqual(
      err({
        code: "analysis_failed",
        message: "The entry analysis could not be completed.",
      }),
    );
    expect(commits).toEqual([]);
  });

  it("returns persisted identifiers only from the dashboard-specific envelope", async () => {
    const { dependencies } = makeDependencies();

    const result = await createAnalyzeAlertForDashboard(dependencies)(completeCommand());

    expect(result).toMatchObject({
      ok: true,
      value: {
        alertId: "alert-1",
        snapshotId: "snapshot-1",
        analysisId: "analysis-1",
        analysis: { verdict: "Wait" },
        contract: { symbol: "NBIS", expiration: "2026-08-20", dte: 6 },
      },
    });
  });
});

describe("SupabaseAnalysisWorkflowPersistence", () => {
  it("uses one RPC call for the alert, snapshot, and completed analysis", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args: structuredClone(args) });
        return {
          data: {
            alert_id: "alert-1",
            snapshot_id: "snapshot-1",
            analysis_id: "analysis-1",
          },
          error: null,
        };
      },
    };
    const persistence = new SupabaseAnalysisWorkflowPersistence(client as never);
    const analysis: EntryAnalysis = {
      modelVersion: "phase-1-v1",
      verdict: "Wait",
      score: 100,
      evidenceCoverage: 45,
      scoreMeaning: "Evidence strength, not probability of profit",
      factors: [],
    };
    const input: AnalysisWorkflowCommitInput = {
      userId: "user-1",
      traderSourceId: "source-1",
      alert: { ...completeAlert(), expiration: "2026-08-20" },
      correctedFields: { expiration: "8/20" },
      marketSnapshot: completeCommand().marketSnapshot,
      dte: 6,
      riskAssessment: {
        plannedLoss: 100,
        maximumLoss: 100,
        controllingLoss: 100,
        riskPercent: 1,
        tier: "normal",
        quantityStatus: "normal",
      },
      analysis,
      analyzedAt: confirmedAt,
    };

    await expect(persistence.commitCompletedAnalysis(input)).resolves.toEqual(
      ok({ alertId: "alert-1", snapshotId: "snapshot-1", analysisId: "analysis-1" }),
    );
    expect(calls).toEqual([
      {
        name: "commit_entry_analysis_workflow",
        args: expect.objectContaining({
          p_user_id: "user-1",
          p_trader_source_id: "source-1",
          p_expiration: "2026-08-20",
          p_corrected_fields: { expiration: "8/20" },
          p_snapshot_payload: expect.objectContaining({
            optionPremium: 1,
            underlyingPrice: 219,
            dte: 6,
          }),
          p_analysis_payload: expect.objectContaining({
            modelVersion: "phase-1-v1",
            evidenceCoverage: 45,
            riskAssessment: input.riskAssessment,
          }),
          p_verdict: "Wait",
          p_evidence_score: 100,
        }),
      },
    ]);
  });

  it("commits a refreshed snapshot and analysis before advancing the candidate", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args: structuredClone(args) });
        return {
          data: { snapshot_id: "snapshot-2", analysis_id: "analysis-2" },
          error: null,
        };
      },
    };
    const persistence = new SupabaseAnalysisWorkflowPersistence(client as never);
    const input: CandidateRefreshCommitInput = {
      userId: "user-1",
      candidateId: "candidate-1",
      tradeAlertId: "alert-1",
      marketSnapshot: completeCommand().marketSnapshot,
      dte: 5,
      riskAssessment: {
        plannedLoss: 100,
        maximumLoss: 100,
        controllingLoss: 100,
        riskPercent: 1,
        tier: "normal",
        quantityStatus: "normal",
      },
      analysis: {
        modelVersion: "phase-1-v1",
        verdict: "Wait",
        score: 100,
        evidenceCoverage: 45,
        scoreMeaning: "Evidence strength, not probability of profit",
        factors: [],
      },
      analyzedAt: confirmedAt,
    };

    await expect(persistence.commitCandidateRefresh(input)).resolves.toEqual(
      ok({ snapshotId: "snapshot-2", analysisId: "analysis-2" }),
    );
    expect(calls).toEqual([
      {
        name: "commit_wait_candidate_refresh",
        args: expect.objectContaining({
          p_candidate_id: "candidate-1",
          p_trade_alert_id: "alert-1",
          p_snapshot_payload: expect.objectContaining({ dte: 5 }),
          p_verdict: "Wait",
        }),
      },
    ]);
  });
});
