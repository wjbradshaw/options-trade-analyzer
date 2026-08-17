import { describe, expect, it } from "vitest";
import { err, ok } from "@/lib/result";

describe("Result", () => {
  it("creates typed success and failure values", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err("bad")).toEqual({ ok: false, error: "bad" });
  });
});
