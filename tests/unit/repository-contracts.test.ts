import { describe, expect, it } from "vitest";
import { err, ok, type Result } from "@/lib/result";
import type { ParsedTradeAlert } from "@/features/alerts/domain/types";
import {
  mapProfileRow,
  type Profile,
  type ProfileRepository,
  type RepositoryError as ProfileRepositoryError,
  type UpsertProfileInput,
} from "@/features/profile/server/profile-repository";
import {
  mapTraderSourceRow,
  type CreateTraderSourceInput,
  type RepositoryError as TraderRepositoryError,
  type TraderSource,
  type TraderRepository,
} from "@/features/traders/server/trader-repository";
import {
  mapAlertRow,
  type AlertRepository,
  type CorrectedAlertFields,
  type RepositoryError as AlertRepositoryError,
  type SaveAlertInput,
  type SavedAlert,
} from "@/features/alerts/server/alert-repository";
import {
  mapAnalysisRow,
  type AnalysisRepository,
  type RepositoryError as AnalysisRepositoryError,
  type SaveAnalysisInput,
  type SavedAnalysis,
} from "@/features/analysis/server/analysis-repository";
import {
  mapDecisionRow,
  type DecisionRepository,
  type RepositoryError as DecisionRepositoryError,
  type SaveDecisionInput,
  type SavedDecision,
} from "@/features/decisions/server/decision-repository";
import {
  mapWatchCandidateRow,
  type AdvanceWatchCandidateInput,
  type RepositoryError as WatchCandidateRepositoryError,
  type SaveWatchCandidateInput,
  type SavedWatchCandidate,
  type WatchCandidateRepository,
} from "@/features/decisions/server/watch-candidate-repository";

const createdAt = "2026-08-24T14:00:00.000Z";
const updatedAt = "2026-08-24T14:01:00.000Z";

const clone = <T>(value: T): T => structuredClone(value);

class InMemoryProfileRepository implements ProfileRepository {
  private profile: Profile | null = null;

  async getProfile(): Promise<Result<Profile, ProfileRepositoryError>> {
    if (!this.profile) {
      return err({ code: "not_found", message: "Profile was not found" });
    }

    return ok(clone(this.profile));
  }

  async upsertProfile(
    input: UpsertProfileInput,
  ): Promise<Result<Profile, ProfileRepositoryError>> {
    this.profile = { ...clone(input), createdAt, updatedAt };
    return ok(clone(this.profile));
  }
}

class InMemoryTraderRepository implements TraderRepository {
  private sources: TraderSource[] = [];

  async listTraderSources(): Promise<Result<TraderSource[], TraderRepositoryError>> {
    return ok(clone(this.sources));
  }

  async createTraderSource(
    input: CreateTraderSourceInput,
  ): Promise<Result<TraderSource, TraderRepositoryError>> {
    const source = {
      id: "source-1",
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      createdAt,
      updatedAt,
    };
    this.sources.push(source);
    return ok(clone(source));
  }
}

class InMemoryAlertRepository implements AlertRepository {
  private alerts = new Map<string, SavedAlert>();

  async saveAlert(
    input: SaveAlertInput,
  ): Promise<Result<SavedAlert, AlertRepositoryError>> {
    const saved = {
      id: "alert-1",
      userId: input.userId,
      traderSourceId: input.traderSourceId,
      ...clone(input.alert),
      correctedFields: clone(input.correctedFields),
      contractConfirmed: input.contractConfirmed,
      createdAt,
      updatedAt,
    };
    this.alerts.set(saved.id, clone(saved));
    return ok(clone(saved));
  }

  async getAlert(id: string): Promise<Result<SavedAlert, AlertRepositoryError>> {
    const alert = this.alerts.get(id);
    if (!alert) {
      return err({ code: "not_found", message: "Trade alert was not found" });
    }

    return ok(clone(alert));
  }
}

class InMemoryAnalysisRepository implements AnalysisRepository {
  private analyses = new Map<string, SavedAnalysis>();

  async saveAnalysis(
    input: SaveAnalysisInput,
  ): Promise<Result<SavedAnalysis, AnalysisRepositoryError>> {
    const saved = { id: "analysis-1", ...clone(input), createdAt, updatedAt };
    this.analyses.set(saved.id, clone(saved));
    return ok(clone(saved));
  }
}

class InMemoryDecisionRepository implements DecisionRepository {
  private decisions = new Map<string, SavedDecision>();

  async saveDecision(
    input: SaveDecisionInput,
  ): Promise<Result<SavedDecision, DecisionRepositoryError>> {
    const saved = { id: "decision-1", ...clone(input), createdAt, updatedAt };
    this.decisions.set(saved.id, clone(saved));
    return ok(clone(saved));
  }
}

class InMemoryWatchCandidateRepository implements WatchCandidateRepository {
  private candidates = new Map<string, SavedWatchCandidate>();

  async saveCandidate(
    input: SaveWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, WatchCandidateRepositoryError>> {
    const saved: SavedWatchCandidate = {
      id: "candidate-1",
      ...clone(input),
      status: input.status ?? "watching",
      createdAt,
      updatedAt,
    };
    this.candidates.set(saved.id, clone(saved));
    return ok(clone(saved));
  }

  async advanceLatestAnalysis(
    input: AdvanceWatchCandidateInput,
  ): Promise<Result<SavedWatchCandidate, WatchCandidateRepositoryError>> {
    const candidate = this.candidates.get(input.candidateId);
    if (!candidate || candidate.userId !== input.userId) {
      return err({ code: "not_found", message: "Watch candidate was not found" });
    }
    candidate.latestAnalysisId = input.latestAnalysisId;
    candidate.updatedAt = updatedAt;
    return ok(clone(candidate));
  }
}

describe("repository contracts", () => {
  it("returns the production not_found shape for a missing profile", async () => {
    const repository = new InMemoryProfileRepository();

    expect(await repository.getProfile()).toEqual({
      ok: false,
      error: { code: "not_found", message: "Profile was not found" },
    });
  });

  it("returns the production not_found shape for a missing alert", async () => {
    const repository = new InMemoryAlertRepository();

    expect(await repository.getAlert("missing-alert")).toEqual({
      ok: false,
      error: { code: "not_found", message: "Trade alert was not found" },
    });
  });

  it("round-trips the user-owned options budget", async () => {
    const repository = new InMemoryProfileRepository();

    await repository.upsertProfile({ userId: "user-1", optionsBudget: 12_500 });
    const result = await repository.getProfile();

    expect(result).toEqual(
      ok({ userId: "user-1", optionsBudget: 12_500, createdAt, updatedAt }),
    );
  });

  it("round-trips private trader sources", async () => {
    const repository = new InMemoryTraderRepository();

    await repository.createTraderSource({
      userId: "user-1",
      name: "Private Discord trader",
      description: "Manually pasted alerts only",
    });

    expect(await repository.listTraderSources()).toEqual(
      ok([
        {
          id: "source-1",
          userId: "user-1",
          name: "Private Discord trader",
          description: "Manually pasted alerts only",
          createdAt,
          updatedAt,
        },
      ]),
    );
  });

  it("round-trips raw alerts, corrected values, source, and timestamps", async () => {
    const repository = new InMemoryAlertRepository();
    const alert: ParsedTradeAlert = {
      rawText: "  AAPL 200c 9/18 @ 1.25 — private room  ",
      symbol: "AAPL",
      side: "call",
      strike: 200,
      expiration: "2026-09-18",
      alertedPremium: 1.25,
      submittedAt: "2026-08-24T13:45:12.000Z",
      tags: ["swing"],
      issues: [{ field: "expiration", code: "ambiguous" }],
    };
    const correctedFields: CorrectedAlertFields = {
      expiration: "2026-09-18",
      alertedPremium: 1.3,
    };

    const saved = await repository.saveAlert({
      userId: "user-1",
      traderSourceId: "source-1",
      alert,
      correctedFields,
      contractConfirmed: true,
    });
    expect(saved.ok).toBe(true);

    expect(await repository.getAlert("alert-1")).toEqual(
      ok({
        id: "alert-1",
        userId: "user-1",
        traderSourceId: "source-1",
        ...alert,
        correctedFields,
        contractConfirmed: true,
        createdAt,
        updatedAt,
      }),
    );
  });

  it("round-trips evidence factors without treating the score as probability", async () => {
    const repository = new InMemoryAnalysisRepository();
    const input: SaveAnalysisInput = {
      userId: "user-1",
      tradeAlertId: "alert-1",
      marketSnapshotId: "snapshot-1",
      verdict: "Wait",
      evidenceScore: 6.5,
      factors: {
        trend: { state: "mixed", points: 1 },
        liquidity: { spreadPercent: 12.4, points: -1 },
      },
      summary: "Wait for price confirmation.",
      analyzedAt: "2026-08-24T13:50:00.000Z",
    };

    expect(await repository.saveAnalysis(input)).toEqual(
      ok({ id: "analysis-1", ...input, createdAt, updatedAt }),
    );
  });

  it("round-trips an advisory purchase decision and its timestamps", async () => {
    const repository = new InMemoryDecisionRepository();
    const input: SaveDecisionInput = {
      userId: "user-1",
      tradeAlertId: "alert-1",
      entryAnalysisId: "analysis-1",
      decision: "purchased",
      quantity: 2,
      entryPremium: 1.32,
      details: { note: "Manual purchase recorded after confirmation" },
      decidedAt: "2026-08-24T13:58:00.000Z",
    };

    expect(await repository.saveDecision(input)).toEqual(
      ok({ id: "decision-1", ...input, createdAt, updatedAt }),
    );
  });

  it("round-trips Wait confirmation conditions and advances only the latest analysis pointer", async () => {
    const repository = new InMemoryWatchCandidateRepository();
    const unresolvedConfirmationConditions = [
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

    const saved = await repository.saveCandidate({
      userId: "user-1",
      tradeAlertId: "alert-1",
      sourceAnalysisId: "analysis-1",
      sourceAnalysisVerdict: "Wait",
      latestAnalysisId: "analysis-1",
      unresolvedConfirmationConditions,
    });
    expect(saved).toEqual(
      ok({
        id: "candidate-1",
        userId: "user-1",
        tradeAlertId: "alert-1",
        sourceAnalysisId: "analysis-1",
        sourceAnalysisVerdict: "Wait",
        latestAnalysisId: "analysis-1",
        unresolvedConfirmationConditions,
        status: "watching",
        createdAt,
        updatedAt,
      }),
    );

    expect(
      await repository.advanceLatestAnalysis({
        candidateId: "candidate-1",
        userId: "user-1",
        latestAnalysisId: "analysis-2",
      }),
    ).toEqual(
      ok(
        expect.objectContaining({
          sourceAnalysisId: "analysis-1",
          latestAnalysisId: "analysis-2",
          unresolvedConfirmationConditions,
        }),
      ),
    );
  });
});

describe("snake_case row mappers", () => {
  it("maps profile rows to camelCase", () => {
    expect(
      mapProfileRow({
        id: "profile-1",
        user_id: "user-1",
        options_budget: 12500,
        created_at: createdAt,
        updated_at: updatedAt,
      }),
    ).toEqual({ userId: "user-1", optionsBudget: 12500, createdAt, updatedAt });
  });

  it("maps trader source rows to camelCase", () => {
    expect(
      mapTraderSourceRow({
        id: "source-1",
        user_id: "user-1",
        name: "Trader",
        description: null,
        created_at: createdAt,
        updated_at: updatedAt,
      }),
    ).toEqual({
      id: "source-1",
      userId: "user-1",
      name: "Trader",
      description: null,
      createdAt,
      updatedAt,
    });
  });

  it("maps alert rows while preserving raw and corrected values", () => {
    expect(
      mapAlertRow({
        id: "alert-1",
        user_id: "user-1",
        trader_source_id: "source-1",
        raw_text: " AAPL 200c ",
        corrected_fields: { strike: 201 },
        contract_confirmed: true,
        symbol: "AAPL",
        option_side: "call",
        strike: 200,
        expiration: "2026-09-18",
        alerted_premium: 1.25,
        submitted_at: "2026-08-24T13:45:12.000Z",
        tags: ["swing"],
        parse_issues: [],
        created_at: createdAt,
        updated_at: updatedAt,
      }),
    ).toMatchObject({
      rawText: " AAPL 200c ",
      correctedFields: { strike: 201 },
      contractConfirmed: true,
      side: "call",
      submittedAt: "2026-08-24T13:45:12.000Z",
      createdAt,
      updatedAt,
    });
  });

  it("maps analysis rows to exact verdict vocabulary and camelCase", () => {
    expect(
      mapAnalysisRow({
        id: "analysis-1",
        user_id: "user-1",
        trade_alert_id: "alert-1",
        market_snapshot_id: null,
        alert_contract_confirmed: true,
        verdict: "Consider",
        evidence_score: 7.25,
        analysis_factors: { trend: { points: 2 } },
        summary: null,
        analyzed_at: "2026-08-24T13:50:00.000Z",
        created_at: createdAt,
        updated_at: updatedAt,
      }),
    ).toMatchObject({
      tradeAlertId: "alert-1",
      marketSnapshotId: null,
      verdict: "Consider",
      evidenceScore: 7.25,
      analyzedAt: "2026-08-24T13:50:00.000Z",
    });
  });

  it("maps decision rows without losing advisory purchase details", () => {
    expect(
      mapDecisionRow({
        id: "decision-1",
        user_id: "user-1",
        trade_alert_id: "alert-1",
        entry_analysis_id: "analysis-1",
        decision: "purchased",
        quantity: 2,
        entry_premium: 1.32,
        decision_payload: { note: "Recorded manually" },
        decided_at: "2026-08-24T13:58:00.000Z",
        created_at: createdAt,
        updated_at: updatedAt,
      }),
    ).toMatchObject({
      tradeAlertId: "alert-1",
      entryAnalysisId: "analysis-1",
      decision: "purchased",
      quantity: 2,
      details: { note: "Recorded manually" },
      decidedAt: "2026-08-24T13:58:00.000Z",
    });
  });

  it("maps a watch candidate without losing unresolved condition JSON", () => {
    const unresolvedConfirmationConditions = [
      {
        id: "price-confirmation",
        category: "technicalAlignment",
        description: "Price closes above the opening range high.",
      },
    ];

    expect(
      mapWatchCandidateRow({
        id: "candidate-1",
        user_id: "user-1",
        trade_alert_id: "alert-1",
        source_analysis_id: "analysis-1",
        source_analysis_verdict: "Wait",
        latest_analysis_id: "analysis-2",
        unresolved_confirmation_conditions: unresolvedConfirmationConditions,
        status: "watching",
        created_at: createdAt,
        updated_at: updatedAt,
      }),
    ).toEqual({
      id: "candidate-1",
      userId: "user-1",
      tradeAlertId: "alert-1",
      sourceAnalysisId: "analysis-1",
      sourceAnalysisVerdict: "Wait",
      latestAnalysisId: "analysis-2",
      unresolvedConfirmationConditions,
      status: "watching",
      createdAt,
      updatedAt,
    });
  });
});
