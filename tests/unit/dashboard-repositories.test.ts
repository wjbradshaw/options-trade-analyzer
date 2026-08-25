import { describe, expect, it } from "vitest";
import { SupabaseAnalysisRepository } from "@/features/analysis/server/analysis-repository";
import { SupabaseDecisionRepository } from "@/features/decisions/server/decision-repository";
import { SupabaseWatchCandidateRepository } from "@/features/decisions/server/watch-candidate-repository";

const analysisRow = {
  id: "analysis-1",
  user_id: "user-1",
  trade_alert_id: "alert-1",
  market_snapshot_id: "snapshot-1",
  alert_contract_confirmed: true,
  verdict: "Wait",
  evidence_score: 70,
  analysis_factors: {},
  summary: null,
  analyzed_at: "2026-08-24T15:00:00.000Z",
  created_at: "2026-08-24T15:00:00.000Z",
  updated_at: "2026-08-24T15:00:00.000Z",
};

const makeQueryClient = (data: unknown) => {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    select: (value: string) => (calls.push(["select", value]), builder),
    eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
    order: (column: string, options: unknown) =>
      (calls.push(["order", column, options]), builder),
    limit: (value: number) => (calls.push(["limit", value]), builder),
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return builder;
    },
  };
  return { calls, client: client as never };
};

describe("dashboard repository reads", () => {
  it("loads the latest completed analysis", async () => {
    const { client, calls } = makeQueryClient(analysisRow);

    const result = await new SupabaseAnalysisRepository(client).getLatestAnalysis();

    expect(result).toMatchObject({ ok: true, value: { id: "analysis-1", verdict: "Wait" } });
    expect(calls).toEqual([
      ["from", "entry_analyses"],
      ["select", "*"],
      ["order", "analyzed_at", { ascending: false }],
      ["limit", 1],
    ]);
  });

  it("loads one analysis for saved-candidate hydration", async () => {
    const { client, calls } = makeQueryClient(analysisRow);

    const result = await new SupabaseAnalysisRepository(client).getAnalysis("analysis-1");

    expect(result).toMatchObject({ ok: true, value: { id: "analysis-1" } });
    expect(calls).toEqual([
      ["from", "entry_analyses"],
      ["select", "*"],
      ["eq", "id", "analysis-1"],
    ]);
  });

  it("lists watching candidates newest first", async () => {
    const row = {
      id: "candidate-1",
      user_id: "user-1",
      trade_alert_id: "alert-1",
      source_analysis_id: "analysis-1",
      source_analysis_verdict: "Wait",
      latest_analysis_id: "analysis-1",
      unresolved_confirmation_conditions: [],
      status: "watching",
      created_at: "2026-08-24T15:00:00.000Z",
      updated_at: "2026-08-24T15:00:00.000Z",
    };
    const { client, calls } = makeQueryClient([row]);

    const result = await new SupabaseWatchCandidateRepository(client).listWatchingCandidates();

    expect(result).toMatchObject({ ok: true, value: [{ id: "candidate-1" }] });
    expect(calls).toEqual([
      ["from", "watch_candidates"],
      ["select", "*"],
      ["eq", "status", "watching"],
      ["order", "updated_at", { ascending: false }],
    ]);
  });

  it("loads one candidate for authenticated manual refresh", async () => {
    const row = {
      id: "candidate-1",
      user_id: "user-1",
      trade_alert_id: "alert-1",
      source_analysis_id: "analysis-1",
      source_analysis_verdict: "Wait",
      latest_analysis_id: "analysis-1",
      unresolved_confirmation_conditions: [],
      status: "watching",
      created_at: "2026-08-24T15:00:00.000Z",
      updated_at: "2026-08-24T15:00:00.000Z",
    };
    const { client, calls } = makeQueryClient(row);

    const result = await new SupabaseWatchCandidateRepository(client).getCandidate("candidate-1");

    expect(result).toMatchObject({ ok: true, value: { id: "candidate-1" } });
    expect(calls).toEqual([
      ["from", "watch_candidates"],
      ["select", "*"],
      ["eq", "id", "candidate-1"],
    ]);
  });

  it("lists recent decisions with a bounded default", async () => {
    const { client, calls } = makeQueryClient([]);

    await new SupabaseDecisionRepository(client).listRecentDecisions();

    expect(calls).toEqual([
      ["from", "trade_decisions"],
      ["select", "*"],
      ["order", "decided_at", { ascending: false }],
      ["limit", 10],
    ]);
  });
});
