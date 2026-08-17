import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requiredKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const originalValues = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of requiredKeys) {
    originalValues.set(key, process.env[key]);
    delete process.env[key];
  }

  vi.resetModules();
});

afterEach(() => {
  for (const key of requiredKeys) {
    const value = originalValues.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  vi.resetModules();
});

describe("environment configuration", () => {
  it("fails during initialization when required Supabase variables are absent", async () => {
    await expect(import("@/lib/env")).rejects.toThrow(
      "Invalid environment configuration",
    );
  });
});
