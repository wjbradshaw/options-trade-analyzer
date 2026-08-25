import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const overriddenKeys = [
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_ANON_KEY",
  "E2E_MAILPIT_URL",
  "NODE_ENV",
  "__NEXT_PROCESSED_ENV",
] as const;
const originalEnvironment = Object.fromEntries(
  overriddenKeys.map((key) => [key, process.env[key]]),
);
const originalDirectory = process.cwd();

afterEach(() => {
  process.chdir(originalDirectory);
  for (const key of overriddenKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key];
    else Reflect.set(process.env, key, original);
  }
  vi.resetModules();
});

describe("Playwright dotenv configuration", () => {
  it("loads the documented Supabase and Mailpit overrides together from .env.local", async () => {
    const projectDirectory = await mkdtemp(
      join(tmpdir(), "phase1-playwright-env-"),
    );
    await writeFile(
      join(projectDirectory, ".env.local"),
      [
        "E2E_SUPABASE_URL=https://e2e-project.example.test",
        "E2E_SUPABASE_ANON_KEY=e2e-anonymous-key",
        "E2E_MAILPIT_URL=https://mailpit.example.test",
      ].join("\n"),
    );
    for (const key of overriddenKeys) delete process.env[key];
    Reflect.set(process.env, "NODE_ENV", "development");
    process.chdir(projectDirectory);

    try {
      const { default: config } = await import("../../playwright.config");
      expect(Array.isArray(config.webServer)).toBe(false);
      const webServer = Array.isArray(config.webServer)
        ? config.webServer[0]
        : config.webServer;
      expect(webServer?.env).toMatchObject({
        NEXT_PUBLIC_SUPABASE_URL: "https://e2e-project.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anonymous-key",
        E2E_MAILPIT_URL: "https://mailpit.example.test",
      });
      expect(process.env.E2E_MAILPIT_URL).toBe("https://mailpit.example.test");
    } finally {
      process.chdir(originalDirectory);
      await rm(projectDirectory, { recursive: true });
    }
  });
});
