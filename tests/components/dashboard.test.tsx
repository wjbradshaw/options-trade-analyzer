// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Dashboard } from "@/features/dashboard/ui/dashboard";
import { OptionsBudgetSetup } from "@/features/dashboard/ui/options-budget-setup";
import {
  DashboardWorkflow,
  SavedCandidateReview,
} from "@/features/dashboard/ui/dashboard-workflow";
import type {
  SaveDecisionInput,
  SavedDecision,
} from "@/features/decisions/server/decision-repository";
import { err, ok } from "@/lib/result";

const section = (name: string) => <section aria-label={name}>{name}</section>;

const workflowDependencies = () => ({
  profileRepository: {
    getProfile: async () =>
      err({ code: "not_found" as const, message: "not used" }),
    upsertProfile: async () =>
      err({ code: "database" as const, message: "not used" }),
  },
  traderRepository: {
    listTraderSources: async () => ok([]),
    createTraderSource: async () =>
      err({ code: "database" as const, message: "not used" }),
  },
  decisionRepository: {
    saveDecision: async () =>
      err({ code: "database" as const, message: "not used" }),
  },
  watchCandidateRepository: {
    saveCandidate: async () =>
      err({ code: "database" as const, message: "not used" }),
    advanceLatestAnalysis: async () =>
      err({ code: "database" as const, message: "not used" }),
  },
  analyzeAction: async () =>
    err({ code: "analysis_failed" as const, message: "not used" }),
});

const savedCandidateDecisionDependencies = () => {
  const dependencies = workflowDependencies();
  return {
    decisionRepository: dependencies.decisionRepository,
    watchCandidateRepository: dependencies.watchCandidateRepository,
  };
};

describe("Dashboard", () => {
  afterEach(cleanup);

  it("puts Needs attention before alert intake when a blocking or urgent issue exists", () => {
    render(
      <Dashboard
        needsAttentionItems={[
          {
            id: "profile-error",
            severity: "blocking",
            message: "Profile could not load.",
          },
        ]}
        pasteFlow={section("Paste flow")}
        savedCandidates={section("Saved candidates")}
        latestAnalysis={section("Latest analysis")}
        recentDecisions={section("Recent decisions")}
      />,
    );

    const attention = screen.getByRole("region", { name: "Needs attention" });
    const paste = screen.getByRole("region", { name: "Paste flow" });
    expect(
      attention.compareDocumentPosition(paste) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("puts alert intake first and omits Needs attention when nothing is blocking or urgent", () => {
    render(
      <Dashboard
        needsAttentionItems={[]}
        pasteFlow={section("Paste flow")}
        savedCandidates={section("Saved candidates")}
        latestAnalysis={section("Latest analysis")}
        recentDecisions={section("Recent decisions")}
      />,
    );

    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main").firstElementChild).toBe(
      screen.getByRole("region", { name: "Paste flow" }),
    );
  });

  it("shows only the options-budget setup when the profile is missing", () => {
    render(
      <Dashboard
        needsAttentionItems={[]}
        budgetSetup={section("Options budget setup")}
        pasteFlow={section("Paste flow")}
        savedCandidates={section("Saved candidates")}
        latestAnalysis={section("Latest analysis")}
        recentDecisions={section("Recent decisions")}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Options budget setup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Paste flow" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Phase Two placeholder sections absent", () => {
    render(
      <Dashboard
        needsAttentionItems={[]}
        pasteFlow={section("Paste flow")}
        savedCandidates={section("Saved candidates")}
        latestAnalysis={section("Latest analysis")}
        recentDecisions={section("Recent decisions")}
      />,
    );

    expect(screen.queryByText(/active positions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/daily reconciliation/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/automatic re-evaluation/i),
    ).not.toBeInTheDocument();
  });

  it("saves a focused options-only budget before revealing the workflow", async () => {
    const user = userEvent.setup();
    let savedBudget: number | null = null;
    render(
      <OptionsBudgetSetup
        userId="user-1"
        profileRepository={{
          getProfile: async () =>
            err({ code: "not_found", message: "missing" }),
          upsertProfile: async (input) => {
            savedBudget = input.optionsBudget;
            return ok({
              ...input,
              createdAt: "2026-08-24T15:00:00.000Z",
              updatedAt: "2026-08-24T15:00:00.000Z",
            });
          },
        }}
        onSaved={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole("spinbutton", { name: "Options-only trading budget" }),
      "12500",
    );
    await user.click(
      screen.getByRole("button", { name: "Save options budget" }),
    );

    expect(savedBudget).toBe(12_500);
    expect(
      screen.getByText(/does not request your full brokerage balance/i),
    ).toBeVisible();
  });

  it("shows budget setup when the profile repository reports not found", () => {
    render(
      <DashboardWorkflow
        userId="user-1"
        initialProfile={null}
        profileLoadError={null}
        initialCandidates={[]}
        initialLatestAnalysis={null}
        initialRecentDecisions={[]}
        initialAttention={[]}
        {...workflowDependencies()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Options budget setup" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Profile load error" }),
    ).not.toBeInTheDocument();
  });

  it("shows a blocking retry view instead of budget setup when profile loading fails", () => {
    render(
      <DashboardWorkflow
        userId="user-1"
        initialProfile={null}
        profileLoadError="Profile database unavailable."
        initialCandidates={[]}
        initialLatestAnalysis={null}
        initialRecentDecisions={[]}
        initialAttention={[]}
        {...workflowDependencies()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Profile load error" }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Profile database unavailable.",
    );
    expect(
      screen.getByRole("link", { name: "Retry profile load" }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.queryByRole("region", { name: "Options budget setup" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Paste flow" }),
    ).not.toBeInTheDocument();
  });

  it("progresses from confirmed alert through manual snapshot to persisted analysis", async () => {
    const user = userEvent.setup();
    const analyzedCommands: unknown[] = [];
    const source = {
      id: "source-1",
      userId: "user-1",
      name: "Private room",
      description: null,
      createdAt: "2026-08-14T15:00:00.000Z",
      updatedAt: "2026-08-14T15:00:00.000Z",
    };
    const analysis = {
      modelVersion: "phase-1-v1" as const,
      verdict: "Wait" as const,
      score: 100,
      evidenceCoverage: 45,
      scoreMeaning: "Evidence strength, not probability of profit" as const,
      factors: [],
    };

    render(
      <DashboardWorkflow
        userId="user-1"
        initialProfile={{
          userId: "user-1",
          optionsBudget: 10_000,
          createdAt: "2026-08-14T15:00:00.000Z",
          updatedAt: "2026-08-14T15:00:00.000Z",
        }}
        initialCandidates={[]}
        initialLatestAnalysis={null}
        initialRecentDecisions={[]}
        initialAttention={[]}
        profileRepository={{
          getProfile: async () =>
            err({ code: "not_found", message: "not used" }),
          upsertProfile: async () =>
            err({ code: "database", message: "not used" }),
        }}
        traderRepository={{
          listTraderSources: async () => ok([source]),
          createTraderSource: async () =>
            err({ code: "database", message: "not used" }),
        }}
        decisionRepository={{
          saveDecision: async () =>
            err({ code: "database", message: "not used" }),
        }}
        watchCandidateRepository={{
          saveCandidate: async () =>
            err({ code: "database", message: "not used" }),
          advanceLatestAnalysis: async () =>
            err({ code: "database", message: "not used" }),
        }}
        analyzeAction={async (command) => {
          analyzedCommands.push(structuredClone(command));
          return ok({
            alertId: "alert-1",
            snapshotId: "snapshot-1",
            analysisId: "analysis-1",
            analysis,
            analyzedAt: "2026-08-14T15:00:00.000Z",
            riskAssessment: {
              plannedLoss: 100,
              maximumLoss: 100,
              controllingLoss: 100,
              riskPercent: 1,
              tier: "normal",
              quantityStatus: "normal",
            },
            contract: {
              symbol: "NBIS",
              side: "call",
              strike: 220,
              expiration: "2026-08-20",
              dte: 6,
              optionPremium: 1,
              quantity: 1,
            },
          });
        }}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
      />,
    );

    await user.type(
      screen.getByLabelText("Paste trade alert"),
      "NBIS 8/20 220c @1.00",
    );
    await user.click(screen.getByRole("button", { name: "Parse alert" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Trader source" }),
      "source-1",
    );
    await user.click(screen.getByRole("button", { name: "Analyze entry" }));
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
      "1",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "219",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm market snapshot" }),
    );

    expect(
      await screen.findByRole("region", { name: "Entry analysis" }),
    ).toBeVisible();
    expect(analyzedCommands).toEqual([
      expect.objectContaining({
        traderSourceId: "source-1",
        quantity: 1,
        alert: expect.objectContaining({ rawText: "NBIS 8/20 220c @1.00" }),
        marketSnapshot: {
          optionPremium: 1,
          underlyingPrice: 219,
          confirmedAt: "2026-08-14T15:00:00.000Z",
        },
      }),
    ]);
  });

  it("allows only one analysis request while snapshot confirmation is pending", async () => {
    const user = userEvent.setup();
    const source = {
      id: "source-1",
      userId: "user-1",
      name: "Private room",
      description: null,
      createdAt: "2026-08-14T15:00:00.000Z",
      updatedAt: "2026-08-14T15:00:00.000Z",
    };
    const completedResult = ok({
      alertId: "alert-1",
      snapshotId: "snapshot-1",
      analysisId: "analysis-1",
      analysis: {
        modelVersion: "phase-1-v1" as const,
        verdict: "Wait" as const,
        score: 100,
        evidenceCoverage: 45,
        scoreMeaning: "Evidence strength, not probability of profit" as const,
        factors: [],
      },
      analyzedAt: "2026-08-14T15:00:00.000Z",
      riskAssessment: {
        plannedLoss: 100,
        maximumLoss: 100,
        controllingLoss: 100,
        riskPercent: 1,
        tier: "normal" as const,
        quantityStatus: "normal" as const,
      },
      contract: {
        symbol: "NBIS",
        side: "call" as const,
        strike: 220,
        expiration: "2026-08-20",
        dte: 6,
        optionPremium: 1,
        quantity: 1 as const,
      },
    });
    let resolveAnalyze: ((result: typeof completedResult) => void) | undefined;
    const pendingAnalyze = new Promise<typeof completedResult>((resolve) => {
      resolveAnalyze = resolve;
    });
    let analyzeRequests = 0;

    render(
      <DashboardWorkflow
        userId="user-1"
        initialProfile={{
          userId: "user-1",
          optionsBudget: 10_000,
          createdAt: "2026-08-14T15:00:00.000Z",
          updatedAt: "2026-08-14T15:00:00.000Z",
        }}
        profileLoadError={null}
        initialCandidates={[]}
        initialLatestAnalysis={null}
        initialRecentDecisions={[]}
        initialAttention={[]}
        {...workflowDependencies()}
        traderRepository={{
          listTraderSources: async () => ok([source]),
          createTraderSource: async () =>
            err({ code: "database", message: "not used" }),
        }}
        analyzeAction={async () => {
          analyzeRequests += 1;
          return pendingAnalyze;
        }}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
      />,
    );

    await user.type(
      screen.getByLabelText("Paste trade alert"),
      "NBIS 8/20 220c @1.00",
    );
    await user.click(screen.getByRole("button", { name: "Parse alert" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Trader source" }),
      "source-1",
    );
    await user.click(screen.getByRole("button", { name: "Analyze entry" }));
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
      "1",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "219",
    );
    const confirm = screen.getByRole("button", {
      name: "Confirm market snapshot",
    });
    const snapshotForm = confirm.closest("form");
    expect(snapshotForm).not.toBeNull();

    fireEvent.submit(snapshotForm as HTMLFormElement);
    fireEvent.submit(snapshotForm as HTMLFormElement);

    expect(analyzeRequests).toBe(1);
    expect(confirm).toBeDisabled();
    expect(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
    ).toBeDisabled();

    await act(async () => {
      resolveAnalyze?.(completedResult);
      await pendingAnalyze;
    });

    expect(
      await screen.findByRole("region", { name: "Entry analysis" }),
    ).toBeVisible();
    expect(confirm).toBeEnabled();
  });

  it("manually refreshes a saved Wait candidate and shows before/after evidence with timestamps", async () => {
    const user = userEvent.setup();
    const beforeAnalysis = {
      modelVersion: "phase-1-v1" as const,
      verdict: "Wait" as const,
      score: 60,
      evidenceCoverage: 60,
      scoreMeaning: "Evidence strength, not probability of profit" as const,
      factors: [],
    };
    const latestAnalysis = {
      ...beforeAnalysis,
      verdict: "Consider" as const,
      score: 75,
    };
    const candidate = {
      id: "candidate-1",
      userId: "user-1",
      tradeAlertId: "alert-1",
      sourceAnalysisId: "analysis-1",
      sourceAnalysisVerdict: "Wait" as const,
      latestAnalysisId: "analysis-1",
      unresolvedConfirmationConditions: [],
      status: "watching" as const,
      createdAt: "2026-08-14T15:00:00.000Z",
      updatedAt: "2026-08-14T15:00:00.000Z",
    };
    render(
      <SavedCandidateReview
        {...savedCandidateDecisionDependencies()}
        item={{
          candidate,
          alert: {
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
          },
          sourceAnalysis: beforeAnalysis,
          sourceAnalyzedAt: "2026-08-14T15:00:00.000Z",
          latestAnalysis: beforeAnalysis,
          latestAnalyzedAt: "2026-08-14T15:00:00.000Z",
        }}
        refreshAction={async () =>
          ok({
            candidate: { ...candidate, latestAnalysisId: "analysis-2" },
            beforeAnalysis,
            beforeAnalyzedAt: "2026-08-14T15:00:00.000Z",
            latestAnalysis,
            latestAnalyzedAt: "2026-08-15T15:00:00.000Z",
            changedEvidence: [
              {
                category: "technicalAlignment",
                before: "unverified",
                after: "supported",
              },
            ],
          })
        }
        now={() => new Date("2026-08-15T15:00:00.000Z")}
      />,
    );

    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
      "1",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "221",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm market snapshot" }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh analysis" }));

    expect(await screen.findByText("Before: Wait")).toBeVisible();
    expect(screen.getByText("After: Consider")).toBeVisible();
    expect(
      screen.getByText("Review again - this setup moved from Wait to Consider"),
    ).toBeVisible();
    expect(screen.getAllByText(/2026-08-14T15:00:00.000Z/)).not.toHaveLength(0);
    expect(screen.getAllByText(/2026-08-15T15:00:00.000Z/)).not.toHaveLength(0);
    expect(screen.getByText("Before evidence: unverified")).toBeVisible();
    expect(screen.getByText("After evidence: supported")).toBeVisible();
  });

  it("records a purchase against the latest refreshed analysis (mutation: leave refreshed candidates without a decision path)", async () => {
    const user = userEvent.setup();
    const sourceAnalysis = {
      modelVersion: "phase-1-v1" as const,
      verdict: "Wait" as const,
      score: 60,
      evidenceCoverage: 60,
      scoreMeaning: "Evidence strength, not probability of profit" as const,
      factors: [],
    };
    const latestAnalysis = {
      ...sourceAnalysis,
      verdict: "Pass" as const,
      score: 30,
    };
    const candidate = {
      id: "candidate-1",
      userId: "user-1",
      tradeAlertId: "alert-1",
      sourceAnalysisId: "analysis-1",
      sourceAnalysisVerdict: "Wait" as const,
      latestAnalysisId: "analysis-1",
      unresolvedConfirmationConditions: [],
      status: "watching" as const,
      createdAt: "2026-08-14T15:00:00.000Z",
      updatedAt: "2026-08-14T15:00:00.000Z",
    };
    let savedDecision: SaveDecisionInput | null = null;
    const decisionRepositories = {
      decisionRepository: {
        saveDecision: async (input: SaveDecisionInput) => {
          savedDecision = structuredClone(input);
          const saved: SavedDecision = {
            id: "decision-1",
            ...input,
            createdAt: "2026-08-15T15:06:00.000Z",
            updatedAt: "2026-08-15T15:06:00.000Z",
          };
          return ok(saved);
        },
      },
      watchCandidateRepository: {
        saveCandidate: async () =>
          err({ code: "database" as const, message: "not used" }),
        advanceLatestAnalysis: async () =>
          err({ code: "database" as const, message: "not used" }),
      },
    };

    render(
      <SavedCandidateReview
        {...decisionRepositories}
        item={{
          candidate,
          alert: {
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
          },
          sourceAnalysis,
          sourceAnalyzedAt: "2026-08-14T15:00:00.000Z",
          latestAnalysis: sourceAnalysis,
          latestAnalyzedAt: "2026-08-14T15:00:00.000Z",
        }}
        refreshAction={async () =>
          ok({
            candidate: { ...candidate, latestAnalysisId: "analysis-2" },
            beforeAnalysis: sourceAnalysis,
            beforeAnalyzedAt: "2026-08-14T15:00:00.000Z",
            latestAnalysis,
            latestAnalyzedAt: "2026-08-15T15:05:00.000Z",
            changedEvidence: [],
          })
        }
        now={() => new Date("2026-08-15T15:00:00.000Z")}
      />,
    );

    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
      "1",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "221",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm market snapshot" }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh analysis" }));
    await screen.findByText("After: Pass");

    const decision = screen.getByRole("region", { name: "Purchase decision" });
    await user.click(
      within(decision).getByRole("radio", { name: "Purchased" }),
    );
    await user.selectOptions(
      within(decision).getByRole("combobox", { name: "Quantity" }),
      "2",
    );
    await user.type(
      within(decision).getByRole("spinbutton", { name: "Actual fill" }),
      "1.25",
    );
    await user.type(
      within(decision).getByRole("textbox", {
        name: "Actual purchase timestamp",
      }),
      "2026-08-15T15:06:00.000Z",
    );
    await user.click(
      within(decision).getByRole("button", { name: "Save decision" }),
    );

    expect(savedDecision).toMatchObject({
      entryAnalysisId: "analysis-2",
      tradeAlertId: "alert-1",
      decision: "purchased",
      quantity: 2,
      entryPremium: 1.25,
    });
  });

  it("shows a persisted source-to-latest comparison before another candidate refresh", () => {
    const sourceAnalysis = {
      modelVersion: "phase-1-v1" as const,
      verdict: "Wait" as const,
      score: 50,
      evidenceCoverage: 60,
      scoreMeaning: "Evidence strength, not probability of profit" as const,
      factors: [
        {
          category: "technicalAlignment" as const,
          weight: 15,
          status: "unverified" as const,
          earnedPoints: 0,
          availablePoints: 0,
          summary: "Technical alignment was not confirmed.",
          source: null,
          capturedAt: null,
        },
      ],
    };
    const latestAnalysis = {
      ...sourceAnalysis,
      verdict: "Consider" as const,
      score: 80,
      factors: [
        {
          category: "technicalAlignment" as const,
          weight: 15,
          status: "supported" as const,
          earnedPoints: 15,
          availablePoints: 15,
          summary: "Technical alignment was confirmed.",
          source: "Manual review",
          capturedAt: "2026-08-15T15:00:00.000Z",
        },
      ],
    };

    render(
      <SavedCandidateReview
        {...savedCandidateDecisionDependencies()}
        item={{
          candidate: {
            id: "candidate-1",
            userId: "user-1",
            tradeAlertId: "alert-1",
            sourceAnalysisId: "analysis-1",
            sourceAnalysisVerdict: "Wait",
            latestAnalysisId: "analysis-2",
            unresolvedConfirmationConditions: [],
            status: "watching",
            createdAt: "2026-08-14T15:00:00.000Z",
            updatedAt: "2026-08-15T15:00:00.000Z",
          },
          alert: {
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
          },
          sourceAnalysis,
          sourceAnalyzedAt: "2026-08-14T15:00:00.000Z",
          latestAnalysis,
          latestAnalyzedAt: "2026-08-15T15:00:00.000Z",
        }}
        refreshAction={async () =>
          err({ code: "database", message: "not used" })
        }
        now={() => new Date("2026-08-15T15:00:00.000Z")}
      />,
    );

    expect(screen.getByText("Before: Wait")).toBeVisible();
    expect(screen.getByText("After: Consider")).toBeVisible();
    expect(
      screen.getByText(/Before analysis: Wait.*2026-08-14T15:00:00.000Z/),
    ).toBeVisible();
    expect(
      screen.getByText(/Latest analysis: Consider.*2026-08-15T15:00:00.000Z/),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Before evidence: unverified: Technical alignment was not confirmed.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "After evidence: supported: Technical alignment was confirmed.",
      ),
    ).toBeVisible();
  });
});
