import { describe, expect, it } from "vitest";
import { parseTradeAlert } from "@/features/alerts/domain/parser";
import { alertFixtures } from "../fixtures/alerts";

describe("parseTradeAlert", () => {
  it.each(alertFixtures)(
    "extracts option details from $raw",
    ({ raw, expected }) => {
      const result = parseTradeAlert(raw, "2026-08-12T09:39:00-04:00");

      expect(result).toMatchObject({
        ok: true,
        value: {
          rawText: raw,
          symbol: expected.symbol,
          expiration: expected.expirationText,
          strike: expected.strike,
          side: expected.side,
          alertedPremium: expected.alertedPremium,
          submittedAt: "2026-08-12T09:39:00-04:00",
        },
      });
    },
  );

  it("reports ambiguous values instead of selecting one", () => {
    const result = parseTradeAlert("SPX 8/13 7810c 7820c @2.70", "2026-08-12T09:39:00-04:00");

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        strike: null,
        side: null,
        issues: [
          { field: "strike", code: "ambiguous" },
          { field: "side", code: "ambiguous" },
        ],
      }),
    });
  });

  it("extracts known case-insensitive alert tags", () => {
    const result = parseTradeAlert(
      "NBIS 8/14 220c @2.98 ER lotto",
      "2026-08-12T09:39:00-04:00",
    );

    expect(result).toMatchObject({ ok: true, value: { tags: ["ER", "LOTTO"] } });
  });

  it("leaves invalid expiration, strike, and premium values unpopulated", () => {
    const result = parseTradeAlert("SPX 99/99 0c @0", "2026-08-12T09:39:00-04:00");

    expect(result).toMatchObject({
      ok: true,
      value: {
        expiration: null,
        strike: null,
        alertedPremium: null,
        issues: expect.arrayContaining([
          { field: "expiration", code: "invalid" },
          { field: "strike", code: "invalid" },
          { field: "alertedPremium", code: "invalid" },
        ]),
      },
    });
  });

  it("does not treat alert labels as confirmed ticker symbols", () => {
    const result = parseTradeAlert(
      "ALERT 8/14 220c @2.98",
      "2026-08-12T09:39:00-04:00",
    );

    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({
        symbol: null,
        issues: expect.arrayContaining([{ field: "symbol", code: "invalid" }]),
      }),
    });
  });
});
