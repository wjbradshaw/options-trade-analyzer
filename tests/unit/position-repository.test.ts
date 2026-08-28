import { describe, expect, it, vi } from "vitest";
import { SupabasePositionRepository } from "@/features/positions/server/position-repository";

const positionRow = {
  id: "position-1",
  user_id: "user-1",
  trade_alert_id: "alert-1",
  entry_analysis_id: "analysis-1",
  initial_quantity: 2,
  remaining_quantity: 2,
  initial_entry_premium: 2.5,
  status: "open",
  opened_at: "2026-08-28T12:00:00.000Z",
  closed_at: null,
  created_at: "2026-08-28T12:00:00.000Z",
  updated_at: "2026-08-28T12:00:00.000Z",
};

const eventRow = {
  id: "event-1",
  user_position_id: "position-1",
  user_id: "user-1",
  event_type: "purchase",
  quantity_delta: 2,
  executed_premium: 2.5,
  notes: null,
  event_payload: {},
  created_at: "2026-08-28T12:00:00.000Z",
};

const hostEventRow = {
  id: "host-1",
  user_id: "user-1",
  trade_alert_id: "alert-1",
  user_position_id: "position-1",
  trader_source_id: "source-1",
  raw_text: "ALL OUT @ 5.00",
  event_type: "all_out",
  claimed_entry_premium: null,
  claimed_exit_premium: 5.0,
  claimed_percentage: 100.0,
  event_payload: {},
  created_at: "2026-08-28T12:30:00.000Z",
};

describe("SupabasePositionRepository", () => {
  it("opens a position via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        position_id: "pos-1",
        decision_id: "dec-1",
        event_id: "evt-1",
      },
      error: null,
    });
    const repo = new SupabasePositionRepository({ rpc } as never);

    const result = await repo.openPosition({
      userId: "user-1",
      tradeAlertId: "alert-1",
      entryAnalysisId: "analysis-1",
      quantity: 2,
      entryPremium: 2.5,
      details: {},
      decidedAt: "2026-08-28T12:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        positionId: "pos-1",
        decisionId: "dec-1",
        eventId: "evt-1",
      },
    });
    expect(rpc).toHaveBeenCalledWith("commit_user_purchase_and_open_position", {
      p_user_id: "user-1",
      p_trade_alert_id: "alert-1",
      p_entry_analysis_id: "analysis-1",
      p_quantity: 2,
      p_entry_premium: 2.5,
      p_details: {},
      p_decided_at: "2026-08-28T12:00:00.000Z",
    });
  });

  it("trims a position via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        position_id: "pos-1",
        remaining_quantity: 1,
        status: "open",
        event_id: "evt-2",
      },
      error: null,
    });
    const repo = new SupabasePositionRepository({ rpc } as never);

    const result = await repo.trimPosition({
      userId: "user-1",
      positionId: "pos-1",
      trimQuantity: 1,
      exitPremium: 3.75,
      notes: "50% profit trim",
      trimmedAt: "2026-08-28T12:15:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        positionId: "pos-1",
        remainingQuantity: 1,
        status: "open",
        eventId: "evt-2",
      },
    });
    expect(rpc).toHaveBeenCalledWith("commit_position_trim", {
      p_user_id: "user-1",
      p_position_id: "pos-1",
      p_trim_quantity: 1,
      p_exit_premium: 3.75,
      p_notes: "50% profit trim",
      p_trimmed_at: "2026-08-28T12:15:00.000Z",
    });
  });

  it("closes a position via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        position_id: "pos-1",
        status: "closed",
        event_id: "evt-3",
      },
      error: null,
    });
    const repo = new SupabasePositionRepository({ rpc } as never);

    const result = await repo.closePosition({
      userId: "user-1",
      positionId: "pos-1",
      exitPremium: 5.0,
      notes: "Closed runner",
      closedAt: "2026-08-28T12:30:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        positionId: "pos-1",
        status: "closed",
        eventId: "evt-3",
      },
    });
  });

  it("lists active positions", async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [positionRow],
          error: null,
        }),
      }),
    });
    const client = { from: vi.fn().mockReturnValue({ select }) };
    const repo = new SupabasePositionRepository(client as never);

    const result = await repo.listActivePositions();

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          id: "position-1",
          initialQuantity: 2,
          remainingQuantity: 2,
          status: "open",
        },
      ],
    });
  });

  it("lists position events", async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [eventRow],
          error: null,
        }),
      }),
    });
    const client = { from: vi.fn().mockReturnValue({ select }) };
    const repo = new SupabasePositionRepository(client as never);

    const result = await repo.listPositionEvents("position-1");

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          id: "event-1",
          eventType: "purchase",
          quantityDelta: 2,
        },
      ],
    });
  });

  it("records a host event", async () => {
    const single = vi.fn().mockResolvedValue({
      data: hostEventRow,
      error: null,
    });
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    const client = { from: vi.fn().mockReturnValue({ insert }) };
    const repo = new SupabasePositionRepository(client as never);

    const result = await repo.recordHostEvent({
      userId: "user-1",
      tradeAlertId: "alert-1",
      userPositionId: "position-1",
      traderSourceId: "source-1",
      rawText: "ALL OUT @ 5.00",
      eventType: "all_out",
      claimedExitPremium: 5.0,
      claimedPercentage: 100.0,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "host-1",
        eventType: "all_out",
        claimedExitPremium: 5.0,
      },
    });
  });
});
