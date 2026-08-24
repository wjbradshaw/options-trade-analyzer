// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import { HybridAnalysisBlock } from "@/features/analysis/ui/hybrid-analysis-block";

const analysis: EntryAnalysis = {
  modelVersion: "phase-1-v1",
  verdict: "Wait",
  score: 68,
  evidenceCoverage: 80,
  scoreMeaning: "Evidence strength, not probability of profit",
  factors: [
    {
      category: "contractCompleteness",
      weight: 10,
      status: "supported",
      earnedPoints: 10,
      availablePoints: 10,
      summary: "Ticker, option side, strike, and expiration are confirmed.",
      source: "Validated trade alert",
      capturedAt: "2026-08-24T13:45:00.000Z",
    },
    {
      category: "timeRisk",
      weight: 15,
      status: "limited",
      earnedPoints: 15,
      availablePoints: 15,
      summary: "DTE is confirmed and the market snapshot is delayed.",
      source: "Manual market snapshot",
      capturedAt: "2026-08-24T13:50:00.000Z",
    },
    {
      category: "personalRiskFit",
      weight: 20,
      status: "supported",
      earnedPoints: 20,
      availablePoints: 20,
      summary: "Risk is within the normal options-budget range.",
      source: "Risk assessment",
      capturedAt: null,
    },
    {
      category: "catalyst",
      weight: 10,
      status: "supported",
      earnedPoints: 10,
      availablePoints: 10,
      summary: "Earnings are confirmed after the close.",
      source: "Company investor relations",
      capturedAt: "2026-08-24T13:40:00.000Z",
    },
    {
      category: "technicalAlignment",
      weight: 15,
      status: "unverified",
      earnedPoints: 0,
      availablePoints: 0,
      summary: "No verified technicalAlignment evidence was provided.",
      source: null,
      capturedAt: null,
    },
  ],
};

describe("HybridAnalysisBlock", () => {
  afterEach(cleanup);

  it("prioritizes verdict and evidence score before contract and risk facts (mutation: omit the decision hierarchy or relabel score as profit probability)", () => {
    render(
      <HybridAnalysisBlock
        analysis={analysis}
        contract={{
          symbol: "AAPL",
          side: "call",
          strike: 200,
          expiration: "2026-09-18",
          dte: 25,
          optionPremium: 2.5,
          quantity: 1,
        }}
      />,
    );

    const result = screen.getByRole("region", { name: "Entry analysis" });
    const text = result.textContent ?? "";

    expect(screen.getByText("Wait", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("68% setup evidence strength")).toBeVisible();
    expect(
      screen.getByText(
        "Setup score measures evidence strength, not probability of profit.",
      ),
    ).toBeVisible();
    expect(text.indexOf("Wait")).toBeLessThan(text.indexOf("AAPL $200 call"));
    expect(screen.getByText("AAPL $200 call · expires 2026-09-18")).toBeVisible();
    expect(screen.getByText("25 days")).toBeVisible();
    expect(screen.getByText("$202.50")).toBeVisible();
    expect(screen.getByText("$250.00")).toBeVisible();
    expect(screen.getByText("Earnings are confirmed after the close.")).toBeVisible();
  });

  it("separates supporting and blocking evidence with visible text statuses (mutation: communicate evidence status with color alone)", () => {
    render(
      <HybridAnalysisBlock
        analysis={analysis}
        contract={{
          symbol: "AAPL",
          side: "call",
          strike: 200,
          expiration: "2026-09-18",
          dte: 25,
          optionPremium: 2.5,
        }}
      />,
    );

    const supporting = screen.getByRole("heading", { name: "Supporting evidence" })
      .parentElement;
    const blocking = screen.getByRole("heading", { name: "Blocking evidence" })
      .parentElement;

    expect(supporting).toHaveTextContent(
      "Supported — Ticker, option side, strike, and expiration are confirmed.",
    );
    expect(blocking).toHaveTextContent(
      "Limited — DTE is confirmed and the market snapshot is delayed.",
    );
    expect(blocking).toHaveTextContent(
      "Unverified — No verified technicalAlignment evidence was provided.",
    );
  });

  it("pairs each evidence status word with semantic color (mutation: remove the evidence status color channel)", () => {
    render(
      <HybridAnalysisBlock
        analysis={analysis}
        contract={{
          symbol: "AAPL",
          side: "call",
          strike: 200,
          expiration: "2026-09-18",
          dte: 25,
          optionPremium: 2.5,
        }}
      />,
    );

    const supporting = screen.getByRole("heading", { name: "Supporting evidence" })
      .parentElement as HTMLElement;
    const blocking = screen.getByRole("heading", { name: "Blocking evidence" })
      .parentElement as HTMLElement;

    expect(within(supporting).getAllByText("Supported")[0]).toHaveStyle({
      color: "#2f9e44",
    });
    expect(within(blocking).getByText("Limited")).toHaveStyle({
      color: "#b7791f",
    });
    expect(within(blocking).getByText("Unverified")).toHaveStyle({
      color: "#c92a2a",
    });
  });

  it("keeps provenance in a native expandable details disclosure (mutation: omit evidence source timestamps)", async () => {
    const user = userEvent.setup();
    render(
      <HybridAnalysisBlock
        analysis={analysis}
        contract={{
          symbol: "AAPL",
          side: "call",
          strike: 200,
          expiration: "2026-09-18",
          dte: 25,
          optionPremium: 2.5,
        }}
      />,
    );

    const disclosure = screen.getByText("Source and timestamp details").closest("details");
    expect(disclosure).not.toHaveAttribute("open");

    await user.click(screen.getByText("Source and timestamp details"));

    expect(disclosure).toHaveAttribute("open");
    expect(disclosure).toHaveTextContent(
      "Catalyst: Company investor relations · 2026-08-24T13:40:00.000Z",
    );
    expect(disclosure).toHaveTextContent("Personal risk fit: Risk assessment · Not timestamped");
    expect(disclosure).toHaveTextContent("Technical alignment: Source unavailable · Timestamp unavailable");
  });
});
