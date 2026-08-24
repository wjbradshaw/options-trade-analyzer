import { describe, expect, it } from "vitest";
import {
  MarketSnapshotSchema,
  evaluateFreshness,
} from "@/features/market/domain/snapshot";
import type { MarketProvider } from "@/features/market/server/market-provider";
import { ManualMarketProvider } from "@/features/market/server/manual-market-provider";

const now = new Date("2026-08-14T15:00:00.000Z");

describe("evaluateFreshness", () => {
  it("blocks a one-DTE snapshot with only the missing premium first (mutation: remove short-dated premium guard)", () => {
    expect(
      evaluateFreshness(
        {
          dte: 1,
          optionPremium: null,
          underlyingPrice: 7800,
          confirmedAt: now.toISOString(),
        },
        now,
      ),
    ).toEqual({ status: "blocked", missing: ["optionPremium"] });
  });

  it("lists short-dated missing fields in premium then underlying-price order (mutation: reorder or omit a required field)", () => {
    expect(
      evaluateFreshness(
        {
          dte: 0,
          optionPremium: null,
          underlyingPrice: null,
          confirmedAt: now.toISOString(),
        },
        now,
      ),
    ).toEqual({
      status: "blocked",
      missing: ["optionPremium", "underlyingPrice"],
    });
  });

  it("allows a one-DTE snapshot when both user-entered prices are present (mutation: block every short-dated snapshot)", () => {
    expect(
      evaluateFreshness(
        {
          dte: 1,
          optionPremium: 2.7,
          underlyingPrice: 7800,
          confirmedAt: now.toISOString(),
        },
        now,
      ),
    ).toEqual({ status: "fresh" });
  });

  it("keeps a longer-dated snapshot captured exactly 15 minutes ago fresh (mutation: change the fresh boundary to less-than 15 minutes)", () => {
    expect(
      evaluateFreshness(
        {
          dte: 5,
          optionPremium: null,
          underlyingPrice: null,
          confirmedAt: "2026-08-14T14:45:00.000Z",
        },
        now,
      ),
    ).toEqual({ status: "fresh" });
  });

  it("marks a longer-dated snapshot delayed after 15 minutes through exactly 24 hours (mutation: misclassify either delay boundary)", () => {
    expect(
      evaluateFreshness(
        {
          dte: 5,
          optionPremium: null,
          underlyingPrice: null,
          confirmedAt: "2026-08-13T15:00:00.000Z",
        },
        now,
      ),
    ).toEqual({ status: "delayed" });
  });

  it("marks a longer-dated snapshot stale after 24 hours (mutation: remove the stale-age branch)", () => {
    expect(
      evaluateFreshness(
        {
          dte: 5,
          optionPremium: null,
          underlyingPrice: null,
          confirmedAt: "2026-08-13T14:59:59.999Z",
        },
        now,
      ),
    ).toEqual({ status: "stale" });
  });
});

describe("MarketSnapshotSchema", () => {
  it("rejects zero or negative user-entered prices while allowing either value to be absent (mutation: replace positive validation with nonnegative validation)", () => {
    expect(
      MarketSnapshotSchema.safeParse({
        optionPremium: 0,
        underlyingPrice: 7800,
        confirmedAt: now.toISOString(),
      }).success,
    ).toBe(false);
    expect(
      MarketSnapshotSchema.safeParse({
        optionPremium: null,
        underlyingPrice: null,
        confirmedAt: now.toISOString(),
      }).success,
    ).toBe(true);
  });

  it("rejects a non-ISO confirmation timestamp (mutation: accept arbitrary confirmation text)", () => {
    expect(
      MarketSnapshotSchema.safeParse({
        optionPremium: 2.7,
        underlyingPrice: 7800,
        confirmedAt: "yesterday afternoon",
      }).success,
    ).toBe(false);
  });
});

describe("ManualMarketProvider", () => {
  it("returns the supplied manual snapshot without fetching or reevaluating it (mutation: replace the manual snapshot with provider-derived data)", async () => {
    const snapshot = MarketSnapshotSchema.parse({
      optionPremium: 2.7,
      underlyingPrice: 7800,
      confirmedAt: now.toISOString(),
    });
    const provider: MarketProvider = new ManualMarketProvider(snapshot);

    await expect(provider.getSnapshot()).resolves.toEqual(snapshot);
  });
});
