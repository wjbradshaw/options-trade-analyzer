import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("rejects a protocol-relative callback target", () => {
    expect(safeRedirectPath("//attacker.example")).toBe("/");
  });

  it("keeps an application-relative callback target", () => {
    expect(safeRedirectPath("/dashboard/candidates")).toBe("/dashboard/candidates");
  });
});
