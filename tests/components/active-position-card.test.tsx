// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivePositionCard } from "@/features/positions/ui/active-position-card";
import type { UserPosition } from "@/features/positions/domain/types";
import { ok } from "@/lib/result";

afterEach(cleanup);

const mockPosition: UserPosition = {
  id: "pos-1",
  userId: "user-1",
  tradeAlertId: "alert-1",
  entryAnalysisId: "analysis-1",
  initialQuantity: 2,
  remainingQuantity: 2,
  initialEntryPremium: 2.0,
  status: "open",
  openedAt: "2026-08-28T12:00:00.000Z",
  closedAt: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z",
};

describe("ActivePositionCard", () => {
  it("renders position details, health status, and P&L metrics", () => {
    render(
      <ActivePositionCard
        position={mockPosition}
        contractDetails={{
          symbol: "SPX",
          strike: 6000,
          optionSide: "call",
          expiration: "2030-01-18",
        }}
        events={[]}
        currentOptionPrice={3.0} // +50% gain
        underlyingPrice={6050}
        entryUnderlyingPrice={6000}
        invalidationLevel={5980}
        targetLevel={6100}
        dte={14}
        initialDte={15}
        currentIv={18.0}
        entryIv={18.0}
        bid={2.9}
        ask={3.1}
        thesisIntact={true}
        onTrim={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/SPX 6000 CALL/i)).toBeInTheDocument();
    expect(screen.getByText(/2 contracts @ \$2\.00/i)).toBeInTheDocument();
    expect(screen.getByText("+50%")).toBeInTheDocument();
    expect(screen.getByText("50% profit review")).toBeInTheDocument();
    expect(screen.getByText(/HEALTHY/i)).toBeInTheDocument();
  });

  it("opens trim modal when Trim button is clicked", async () => {
    const user = userEvent.setup();
    const onTrim = vi.fn().mockResolvedValue(ok({}));

    render(
      <ActivePositionCard
        position={mockPosition}
        contractDetails={{
          symbol: "SPX",
          strike: 6000,
          optionSide: "call",
          expiration: "2030-01-18",
        }}
        events={[]}
        currentOptionPrice={3.0}
        underlyingPrice={6050}
        entryUnderlyingPrice={6000}
        invalidationLevel={5980}
        targetLevel={6100}
        dte={14}
        initialDte={15}
        currentIv={18.0}
        entryIv={18.0}
        bid={2.9}
        ask={3.1}
        thesisIntact={true}
        onTrim={onTrim}
        onClose={vi.fn()}
      />
    );

    const trimButton = screen.getByRole("button", { name: /trim/i });
    await user.click(trimButton);

    expect(screen.getByRole("dialog", { name: /trim position/i })).toBeInTheDocument();
  });
});
