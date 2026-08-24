import { describe, expect, it } from "vitest";
import { safeRedirectUrl } from "@/lib/auth/redirect";

describe("safeRedirectUrl", () => {
  const trustedOrigin = "https://trusted.example";

  it("rejects a protocol-relative callback target", () => {
    expect(safeRedirectUrl("//attacker.example", trustedOrigin).href).toBe(
      "https://trusted.example/",
    );
  });

  it("rejects a backslash-normalized external callback target", () => {
    expect(safeRedirectUrl("/\\attacker.example", trustedOrigin).href).toBe(
      "https://trusted.example/",
    );
  });

  it("keeps an in-app callback target with its query and hash", () => {
    expect(
      safeRedirectUrl("/dashboard/candidates?status=watching#candidate-1", trustedOrigin)
        .href,
    ).toBe(
      "https://trusted.example/dashboard/candidates?status=watching#candidate-1",
    );
  });
});
