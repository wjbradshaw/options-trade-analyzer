import { describe, expect, it } from "vitest";
import { calculateRiskAssessment } from "@/features/profile/domain/risk";

describe("calculateRiskAssessment", () => {
  it("classifies risk up to one percent of the options-only budget as normal", () => {
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 100, dte: 5 }).tier,
    ).toBe("normal");
  });

  it("classifies risk above one percent through two percent as caution", () => {
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 150, dte: 5 }).tier,
    ).toBe("caution");
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 200, dte: 5 }).tier,
    ).toBe("caution");
  });

  it("classifies risk above two percent as too aggressive", () => {
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 250, dte: 5 }).tier,
    ).toBe("too_aggressive");
  });

  it("uses full premium as controlling loss for zero- and one-DTE positions", () => {
    expect(
      calculateRiskAssessment({
        budget: 10_000,
        plannedLoss: 50,
        maxLoss: 100,
        dte: 0,
      }).controllingLoss,
    ).toBe(100);
    expect(
      calculateRiskAssessment({
        budget: 10_000,
        plannedLoss: 50,
        maxLoss: 100,
        dte: 1,
      }).controllingLoss,
    ).toBe(100);
  });

  it("uses planned loss while retaining full-premium maximum loss for longer-dated positions", () => {
    expect(
      calculateRiskAssessment({
        budget: 10_000,
        plannedLoss: 50,
        maxLoss: 100,
        dte: 5,
      }),
    ).toMatchObject({
      plannedLoss: 50,
      maximumLoss: 100,
      controllingLoss: 50,
      riskPercent: 0.5,
      tier: "normal",
    });
  });

  it("allows one or two contracts as normal and treats three as the maximum", () => {
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 100, dte: 5, quantity: 1 })
        .quantityStatus,
    ).toBe("normal");
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 100, dte: 5, quantity: 2 })
        .quantityStatus,
    ).toBe("normal");
    expect(
      calculateRiskAssessment({ budget: 10_000, maxLoss: 100, dte: 5, quantity: 3 })
        .quantityStatus,
    ).toBe("maximum");
  });

  it("rejects quantities above the three-contract maximum", () => {
    expect(() =>
      calculateRiskAssessment({ budget: 10_000, maxLoss: 100, dte: 5, quantity: 4 }),
    ).toThrow("Quantity cannot exceed three contracts");
  });
});
