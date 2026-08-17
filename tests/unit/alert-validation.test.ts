import { describe, expect, it } from "vitest";
import { validateCriticalFields } from "@/features/alerts/domain/validation";

describe("validateCriticalFields", () => {
  it("returns field-specific issues for each missing critical option field", () => {
    expect(
      validateCriticalFields({
        symbol: null,
        side: null,
        strike: null,
        expiration: null,
      }),
    ).toEqual([
      { field: "symbol", code: "required" },
      { field: "side", code: "required" },
      { field: "strike", code: "required" },
      { field: "expiration", code: "required" },
    ]);
  });

  it("reports only missing fields", () => {
    expect(
      validateCriticalFields({
        symbol: "SPX",
        side: null,
        strike: 7810,
        expiration: null,
      }),
    ).toEqual([
      { field: "side", code: "required" },
      { field: "expiration", code: "required" },
    ]);
  });
});
