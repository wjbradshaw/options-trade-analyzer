import { describe, expect, it } from "vitest";
import * as authRedirect from "@/lib/auth/redirect";
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
      safeRedirectUrl(
        "/dashboard/candidates?status=watching#candidate-1",
        trustedOrigin,
      ).href,
    ).toBe(
      "https://trusted.example/dashboard/candidates?status=watching#candidate-1",
    );
  });
});

describe("callbackOrigin", () => {
  it("preserves the browser's loopback host when Next.js canonicalizes 127.0.0.1 to localhost (mutation: use the canonicalized request origin)", () => {
    const resolver = (
      authRedirect as typeof authRedirect & {
        callbackOrigin?: (requestUrl: string, host: string | null) => string;
      }
    ).callbackOrigin;

    expect(resolver).toBeTypeOf("function");
    expect(
      resolver?.(
        "http://localhost:3001/auth/callback?code=example",
        "127.0.0.1:3001",
      ),
    ).toBe("http://127.0.0.1:3001");
  });

  it("does not trust an arbitrary Host header as a callback origin (mutation: create an open redirect from Host)", () => {
    const resolver = (
      authRedirect as typeof authRedirect & {
        callbackOrigin?: (requestUrl: string, host: string | null) => string;
      }
    ).callbackOrigin;

    expect(
      resolver?.("https://app.example/auth/callback", "attacker.example"),
    ).toBe("https://app.example");
  });
});
