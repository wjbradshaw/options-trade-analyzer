import { describe, expect, it } from "vitest";
import {
  evaluatePositionHealth,
  type PositionHealthInput,
} from "@/features/positions/domain/health-monitor";

describe("evaluatePositionHealth", () => {
  it("evaluates a healthy winning position with strong factors", () => {
    const input: PositionHealthInput = {
      underlyingPrice: 6050,
      entryUnderlyingPrice: 6000,
      invalidationLevel: 5980,
      targetLevel: 6100,
      optionSide: "call",
      dte: 14,
      initialDte: 15,
      currentIv: 18.5,
      entryIv: 18.0,
      bid: 4.8,
      ask: 5.0,
      thesisIntact: true,
    };

    const health = evaluatePositionHealth(input);

    expect(health.healthScore).toBeGreaterThanOrEqual(80);
    expect(health.healthStatus).toBe("healthy");
    expect(health.factors).toHaveLength(5);
    expect(health.actionableAdvisory).toContain("Position is performing well");
  });

  it("evaluates a critical position breaching invalidation and experiencing IV crush", () => {
    const input: PositionHealthInput = {
      underlyingPrice: 5970, // Below 5980 invalidation on call
      entryUnderlyingPrice: 6000,
      invalidationLevel: 5980,
      targetLevel: 6100,
      optionSide: "call",
      dte: 0, // 0-DTE time pressure
      initialDte: 1,
      currentIv: 12.0, // IV crushed from 25.0
      entryIv: 25.0,
      bid: 0.15,
      ask: 0.35, // 100%+ spread
      thesisIntact: false,
    };

    const health = evaluatePositionHealth(input);

    expect(health.healthScore).toBeLessThan(40);
    expect(health.healthStatus).toBe("critical");
    expect(health.actionableAdvisory).toContain("Urgent review recommended");
  });

  it("evaluates a caution position with moderate time decay and minor spread widening", () => {
    const input: PositionHealthInput = {
      underlyingPrice: 6005,
      entryUnderlyingPrice: 6000,
      invalidationLevel: 5980,
      targetLevel: 6100,
      optionSide: "call",
      dte: 2,
      initialDte: 7,
      currentIv: 17.0,
      entryIv: 18.0,
      bid: 2.1,
      ask: 2.3,
      thesisIntact: true,
    };

    const health = evaluatePositionHealth(input);

    expect(health.healthScore).toBeGreaterThanOrEqual(40);
    expect(health.healthScore).toBeLessThan(80);
    expect(health.healthStatus).toBe("caution");
  });
});
