import { describe, expect, it } from "vitest";
import { parseTradeAlert } from "@/features/alerts/domain/parser";
import {
  isValidAlertExpiration,
  validateCriticalFields,
} from "@/features/alerts/domain/validation";

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

  it("requires critical fields left unpopulated by invalid parser candidates", () => {
    const result = parseTradeAlert("SPX 99/99 0c", "2026-08-12T09:39:00-04:00");

    if (!result.ok) {
      throw new Error("Expected parsing to preserve the incomplete alert for validation");
    }

    expect(validateCriticalFields(result.value)).toEqual([
      { field: "strike", code: "required" },
      { field: "expiration", code: "required" },
    ]);
  });
});

describe("expiration validation", () => {
  it("rejects malformed corrected expiration dates while preserving parser-compatible MM/DD dates", () => {
    expect(isValidAlertExpiration("2/29")).toBe(true);
    expect(isValidAlertExpiration("8/14")).toBe(true);
    expect(isValidAlertExpiration("14/99")).toBe(false);
    expect(isValidAlertExpiration("8-14")).toBe(false);
  });
});
