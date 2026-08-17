import { describe, expect, it } from "vitest";
import {
  calculateBreakEven,
  calculateDte,
  calculateMaxPremiumLoss,
} from "@/features/analysis/domain/calculations";

describe("option calculations", () => {
  it("adds the premium to a call strike for break-even", () => {
    expect(calculateBreakEven({ side: "call", strike: 220, premium: 2.98 })).toBe(
      222.98,
    );
  });

  it("subtracts the premium from a put strike for break-even", () => {
    expect(calculateBreakEven({ side: "put", strike: 220, premium: 2.98 })).toBe(
      217.02,
    );
  });

  it("calculates full-premium loss using the 100-share contract multiplier", () => {
    expect(calculateMaxPremiumLoss({ premium: 2.7, quantity: 2 })).toBe(540);
  });

  it("calculates DTE from UTC-noon normalized calendar dates", () => {
    expect(calculateDte({ asOf: "2026-08-14", expiration: "2026-08-14" })).toBe(
      0,
    );
    expect(calculateDte({ asOf: "2026-08-14", expiration: "2026-08-15" })).toBe(
      1,
    );
    expect(calculateDte({ asOf: "2026-08-14", expiration: "2026-08-13" })).toBe(
      -1,
    );
  });
});
