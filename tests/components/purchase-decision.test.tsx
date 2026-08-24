// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import type {
  DecisionRepository,
  RepositoryError as DecisionRepositoryError,
  SaveDecisionInput,
  SavedDecision,
} from "@/features/decisions/server/decision-repository";
import type {
  AdvanceWatchCandidateInput,
  RepositoryError as WatchRepositoryError,
  SaveWatchCandidateInput,
  SavedWatchCandidate,
  WatchCandidateRepository,
} from "@/features/decisions/server/watch-candidate-repository";
import { PurchaseDecision } from "@/features/decisions/ui/purchase-decision";
import { WatchCandidateCard } from "@/features/decisions/ui/watch-candidate-card";
import { err, ok, type Result } from "@/lib/result";

const createdAt = "2026-08-24T14:00:00.000Z";
const updatedAt = "2026-08-24T14:01:00.000Z";
const sourceAnalyzedAt = "2026-08-24T13:50:00.000Z";

const makeAnalysis = (verdict: EntryAnalysis["verdict"] = "Wait"): EntryAnalysis => ({
  modelVersion: "phase-1-v1",
  verdict,
  score: verdict === "Consider" ? 82 : 62,
  evidenceCoverage: 80,
  scoreMeaning: "Evidence strength, not probability of profit",
  factors: [
    {
      category: "technicalAlignment",
      weight: 15,
      status: verdict === "Consider" ? "supported" : "unverified",
      earnedPoints: verdict === "Consider" ? 15 : 0,
      availablePoints: verdict === "Consider" ? 15 : 0,
      summary:
        verdict === "Consider"
          ? "Price reclaimed the confirmation level."
          : "Price confirmation is unresolved.",
      source: verdict === "Consider" ? "Manual chart review" : null,
      capturedAt:
        verdict === "Consider" ? "2026-08-24T14:10:00.000Z" : null,
    },
  ],
});

const unresolvedConditions = [
  {
    id: "price-confirmation",
    category: "technicalAlignment" as const,
    description: "Price closes above the opening range high.",
  },
  {
    id: "liquidity-confirmation",
    category: "liquidity" as const,
    description: "Bid-ask spread narrows below ten percent.",
  },
];

const clone = <T,>(value: T): T => structuredClone(value);

class InMemoryDecisionRepository implements DecisionRepository {
  decisions: SavedDecision[] = [];

  async saveDecision(
    input: SaveDecisionInput,
  ): Promise<Result<SavedDecision, DecisionRepositoryError>> {
    const saved = {
      id: `decision-${this.decisions.length + 1}`,
      ...clone(input),
      createdAt,
      updatedAt,
    };
    this.decisions.push(saved);
    return ok(clone(saved));
  }
}

class InMemoryWatchCandidateRepository implements WatchCandidateRepository {
  candidates: SavedWatchCandidate[] = [];

  async saveCandidate(
    input: SaveWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, WatchRepositoryError>> {
    const saved: SavedWatchCandidate = {
      id: `candidate-${this.candidates.length + 1}`,
      ...clone(input),
      status: input.status ?? "watching",
      createdAt,
      updatedAt,
    };
    this.candidates.push(saved);
    return ok(clone(saved));
  }

  async advanceLatestAnalysis(
    input: AdvanceWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, WatchRepositoryError>> {
    const candidate = this.candidates.find(
      (item) => item.id === input.candidateId && item.userId === input.userId,
    );
    if (!candidate) {
      return err({ code: "not_found", message: "Watch candidate was not found" });
    }
    candidate.latestAnalysisId = input.latestAnalysisId;
    candidate.updatedAt = updatedAt;
    return ok(clone(candidate));
  }
}

const renderDecision = ({
  analysis = makeAnalysis(),
  decisionRepository = new InMemoryDecisionRepository(),
  watchCandidateRepository = new InMemoryWatchCandidateRepository(),
  onRefresh = async () =>
    err({ code: "database" as const, message: "Refresh is not configured" }),
}: Partial<React.ComponentProps<typeof PurchaseDecision>> & {
  analysis?: EntryAnalysis;
  decisionRepository?: DecisionRepository;
  watchCandidateRepository?: WatchCandidateRepository;
} = {}) => {
  render(
    <PurchaseDecision
      analysis={analysis}
      analysisId="analysis-1"
      sourceAnalyzedAt={sourceAnalyzedAt}
      userId="user-1"
      tradeAlertId="alert-1"
      unresolvedConditions={unresolvedConditions}
      decisionRepository={decisionRepository}
      watchCandidateRepository={watchCandidateRepository}
      onRefresh={onRefresh}
    />,
  );
  return { decisionRepository, watchCandidateRepository };
};

describe("PurchaseDecision", () => {
  afterEach(cleanup);

  it("shows quantity one by default but never auto-saves a purchase (mutation: persist the visible default without explicit save)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryDecisionRepository();
    renderDecision({ decisionRepository: repository });

    await user.click(screen.getByRole("radio", { name: "Purchased" }));

    expect(screen.getByRole("combobox", { name: "Quantity" })).toHaveValue("1");
    expect(
      within(screen.getByRole("combobox", { name: "Quantity" })).getAllByRole("option"),
    ).toHaveLength(3);
    expect(repository.decisions).toEqual([]);
  });

  it("requires a positive actual fill and timestamp before saving a one-to-three contract purchase (mutation: accept zero fill or missing timestamp)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryDecisionRepository();
    renderDecision({ decisionRepository: repository });
    await user.click(screen.getByRole("radio", { name: "Purchased" }));

    await user.type(screen.getByRole("spinbutton", { name: "Actual fill" }), "0");
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Actual fill must be a positive number.",
    );

    await user.clear(screen.getByRole("spinbutton", { name: "Actual fill" }));
    await user.type(screen.getByRole("spinbutton", { name: "Actual fill" }), "1.32");
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Actual purchase timestamp is required.",
    );
    expect(repository.decisions).toEqual([]);
  });

  it("explicitly saves a purchased decision with the analysis model version (mutation: omit the analysis version from decision details)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryDecisionRepository();
    renderDecision({ decisionRepository: repository });
    await user.click(screen.getByRole("radio", { name: "Purchased" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Quantity" }), "3");
    await user.type(screen.getByRole("spinbutton", { name: "Actual fill" }), "1.32");
    await user.type(
      screen.getByRole("textbox", { name: "Actual purchase timestamp" }),
      "2026-08-24T14:05:00.000Z",
    );

    await user.click(screen.getByRole("button", { name: "Save decision" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Purchased decision saved."));
    expect(repository.decisions).toEqual([
      expect.objectContaining({
        userId: "user-1",
        tradeAlertId: "alert-1",
        entryAnalysisId: "analysis-1",
        decision: "purchased",
        quantity: 3,
        entryPremium: 1.32,
        details: { modelVersion: "phase-1-v1" },
        decidedAt: "2026-08-24T14:05:00.000Z",
      }),
    ]);
  });

  it("rejects date-only and timezone-less purchase timestamps (mutation: accept an ambiguous local purchase time)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryDecisionRepository();
    renderDecision({ decisionRepository: repository });
    await user.click(screen.getByRole("radio", { name: "Purchased" }));
    await user.type(screen.getByRole("spinbutton", { name: "Actual fill" }), "1.32");
    const timestamp = screen.getByRole("textbox", {
      name: "Actual purchase timestamp",
    });

    for (const ambiguousTimestamp of ["2026-08-24", "2026-08-24T14:05:00"]) {
      await user.clear(timestamp);
      await user.type(timestamp, ambiguousTimestamp);
      await user.click(screen.getByRole("button", { name: "Save decision" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Actual purchase timestamp must be an ISO date-time with Z or a numeric UTC offset.",
      );
    }
    expect(repository.decisions).toEqual([]);
  });

  it("normalizes an explicit purchase timestamp offset to canonical UTC (mutation: persist the user's raw offset timestamp)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryDecisionRepository();
    renderDecision({ decisionRepository: repository });
    await user.click(screen.getByRole("radio", { name: "Purchased" }));
    await user.type(screen.getByRole("spinbutton", { name: "Actual fill" }), "1.32");
    await user.type(
      screen.getByRole("textbox", { name: "Actual purchase timestamp" }),
      "2026-08-24T14:05:00-04:00",
    );

    await user.click(screen.getByRole("button", { name: "Save decision" }));

    await screen.findByText("Purchased decision saved.");
    expect(repository.decisions[0]).toMatchObject({
      decidedAt: "2026-08-24T18:05:00.000Z",
    });
  });

  it("saves a skipped decision without fill or quantity (mutation: require or retain purchase inputs for a declined trade)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryDecisionRepository();
    renderDecision({ analysis: makeAnalysis("Pass"), decisionRepository: repository });

    await user.click(screen.getByRole("radio", { name: "Skipped" }));
    expect(screen.queryByRole("spinbutton", { name: "Actual fill" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save decision" }));

    expect(repository.decisions).toEqual([
      expect.objectContaining({
        decision: "skipped",
        quantity: null,
        entryPremium: null,
        details: { modelVersion: "phase-1-v1" },
      }),
    ]);
  });

  it("allows only one decision write during an in-flight save and none after success (mutation: permit concurrent or repeated persistence)", async () => {
    const user = userEvent.setup();
    const writes: SaveDecisionInput[] = [];
    let finishSave!: () => void;
    const repository: DecisionRepository = {
      saveDecision: (input) => {
        writes.push(clone(input));
        return new Promise((resolve) => {
          finishSave = () => {
            const saved: SavedDecision = {
              id: "decision-1",
              ...clone(input),
              createdAt,
              updatedAt,
            };
            resolve(ok(saved));
          };
        });
      },
    };
    renderDecision({ decisionRepository: repository });
    await user.click(screen.getByRole("radio", { name: "Skipped" }));
    const form = screen.getByRole("button", { name: "Save decision" }).closest("form");
    if (form === null) throw new Error("Expected decision form");

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(writes).toHaveLength(1);
    await act(async () => finishSave());
    await screen.findByText("Skipped decision saved.");
    expect(screen.getByRole("button", { name: "Decision saved" })).toBeDisabled();

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(writes).toHaveLength(1);
  });

  it("guards Saved for review to Wait analyses (mutation: persist a non-Wait analysis as a watch candidate)", () => {
    renderDecision({ analysis: makeAnalysis("Consider") });

    expect(screen.getByRole("radio", { name: "Saved for review" })).toBeDisabled();
    expect(screen.getByText("Saved for review is only available for a Wait analysis.")).toBeVisible();
  });

  it("round-trips every unresolved condition while preserving the source Wait analysis (mutation: flatten or discard unresolved-condition JSON)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryWatchCandidateRepository();
    renderDecision({ watchCandidateRepository: repository });

    await user.click(screen.getByRole("radio", { name: "Saved for review" }));
    for (const condition of unresolvedConditions) {
      expect(screen.getByText(condition.description)).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Save decision" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved for review."));
    expect(repository.candidates).toEqual([
      expect.objectContaining({
        userId: "user-1",
        tradeAlertId: "alert-1",
        sourceAnalysisId: "analysis-1",
        sourceAnalysisVerdict: "Wait",
        latestAnalysisId: "analysis-1",
        unresolvedConfirmationConditions: unresolvedConditions,
        status: "watching",
      }),
    ]);
    expect(screen.getByText("Original analysis: Wait · 2026-08-24T13:50:00.000Z")).toBeVisible();
  });

  it("manually refreshes a saved candidate while keeping original and latest analyses distinct (mutation: overwrite the original analysis during refresh)", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryWatchCandidateRepository();
    const latestAnalysis = makeAnalysis("Consider");
    renderDecision({
      watchCandidateRepository: repository,
      onRefresh: async (candidate) => {
        const advanced = await repository.advanceLatestAnalysis({
          candidateId: candidate.id,
          userId: candidate.userId,
          latestAnalysisId: "analysis-2",
        });
        if (!advanced.ok) return advanced;
        return ok({
          candidate: advanced.value,
          beforeAnalysis: makeAnalysis("Wait"),
          beforeAnalyzedAt: "2026-08-24T13:55:00.000Z",
          latestAnalysis,
          latestAnalyzedAt: "2026-08-24T14:10:00.000Z",
          changedEvidence: [
            {
              category: "technicalAlignment" as const,
              before: "Price confirmation is unresolved.",
              after: "Price reclaimed the confirmation level.",
            },
          ],
        });
      },
    });
    await user.click(screen.getByRole("radio", { name: "Saved for review" }));
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    await screen.findByText("Original analysis: Wait · 2026-08-24T13:50:00.000Z");

    await user.click(screen.getByRole("button", { name: "Refresh analysis" }));

    await waitFor(() => expect(screen.getByText("Before: Wait")).toBeVisible());
    expect(screen.getByText("After: Consider")).toBeVisible();
    expect(screen.getByText("Before analysis: Wait · 2026-08-24T13:55:00.000Z")).toBeVisible();
    expect(screen.getByText("Latest analysis: Consider · 2026-08-24T14:10:00.000Z")).toBeVisible();
    expect(screen.getByText("Before evidence: Price confirmation is unresolved.")).toBeVisible();
    expect(screen.getByText("After evidence: Price reclaimed the confirmation level.")).toBeVisible();
    expect(screen.getByText("Original analysis: Wait · 2026-08-24T13:50:00.000Z")).toBeVisible();
    expect(repository.candidates[0]).toMatchObject({
      sourceAnalysisId: "analysis-1",
      sourceAnalysisVerdict: "Wait",
      latestAnalysisId: "analysis-2",
    });
  });

  it("shows decision, watch persistence, and refresh repository errors visibly (mutation: swallow repository failures)", async () => {
    const user = userEvent.setup();
    const decisionRepository: DecisionRepository = {
      saveDecision: async () => err({ code: "database", message: "Decision save failed" }),
    };
    renderDecision({ decisionRepository });
    await user.click(screen.getByRole("radio", { name: "Skipped" }));
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    await screen.findByText("Decision save failed");
    cleanup();

    const watchRepository: WatchCandidateRepository = {
      saveCandidate: async () => err({ code: "database", message: "Watch save failed" }),
      advanceLatestAnalysis: async () =>
        err({ code: "database", message: "Advance failed" }),
    };
    renderDecision({ watchCandidateRepository: watchRepository });
    await user.click(screen.getByRole("radio", { name: "Saved for review" }));
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    await screen.findByText("Watch save failed");
    cleanup();

    const repository = new InMemoryWatchCandidateRepository();
    renderDecision({
      watchCandidateRepository: repository,
      onRefresh: async () => err({ code: "database", message: "Refresh failed" }),
    });
    await user.click(screen.getByRole("radio", { name: "Saved for review" }));
    await user.click(screen.getByRole("button", { name: "Save decision" }));
    await screen.findByText("Original analysis: Wait · 2026-08-24T13:50:00.000Z");
    await user.click(screen.getByRole("button", { name: "Refresh analysis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
  });
});

describe("WatchCandidateCard candidate identity", () => {
  afterEach(cleanup);

  it("drops prior refresh state and refreshes the newly rendered candidate (mutation: prefer the prior refresh candidate after candidate replacement)", async () => {
    const user = userEvent.setup();
    const firstCandidate: SavedWatchCandidate = {
      id: "candidate-1",
      userId: "user-1",
      tradeAlertId: "alert-1",
      sourceAnalysisId: "analysis-1",
      sourceAnalysisVerdict: "Wait",
      latestAnalysisId: "analysis-1",
      unresolvedConfirmationConditions: unresolvedConditions,
      status: "watching",
      createdAt,
      updatedAt,
    };
    const secondCandidate: SavedWatchCandidate = {
      ...firstCandidate,
      id: "candidate-2",
      tradeAlertId: "alert-2",
      sourceAnalysisId: "analysis-3",
      latestAnalysisId: "analysis-3",
    };
    const refreshedCandidateIds: string[] = [];
    const onRefresh: React.ComponentProps<typeof WatchCandidateCard>["onRefresh"] =
      async (candidate) => {
        refreshedCandidateIds.push(candidate.id);
        return ok({
          candidate: {
            ...candidate,
            latestAnalysisId: `${candidate.sourceAnalysisId}-refreshed`,
          },
          beforeAnalysis: makeAnalysis("Wait"),
          beforeAnalyzedAt: sourceAnalyzedAt,
          latestAnalysis: makeAnalysis("Consider"),
          latestAnalyzedAt:
            candidate.id === "candidate-1"
              ? "2026-08-24T14:10:00.000Z"
              : "2026-08-24T14:20:00.000Z",
          changedEvidence: [],
        });
      };

    const { rerender } = render(
      <WatchCandidateCard
        candidate={firstCandidate}
        sourceAnalysis={makeAnalysis("Wait")}
        sourceAnalyzedAt={sourceAnalyzedAt}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Refresh analysis" }));
    await screen.findByText(
      "Latest analysis: Consider · 2026-08-24T14:10:00.000Z",
    );

    rerender(
      <WatchCandidateCard
        candidate={secondCandidate}
        sourceAnalysis={makeAnalysis("Wait")}
        sourceAnalyzedAt="2026-08-24T14:15:00.000Z"
        onRefresh={onRefresh}
      />,
    );

    expect(
      screen.queryByText("Latest analysis: Consider · 2026-08-24T14:10:00.000Z"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh analysis" }));
    await screen.findByText(
      "Latest analysis: Consider · 2026-08-24T14:20:00.000Z",
    );
    expect(refreshedCandidateIds).toEqual(["candidate-1", "candidate-2"]);
  });
});
