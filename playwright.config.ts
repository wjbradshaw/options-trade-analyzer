import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnvironment from "@next/env";
import { defineConfig, devices } from "@playwright/test";

const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(process.cwd());

const baseURL = "http://127.0.0.1:3001";
const localSupabaseURL = "http://127.0.0.1:54321";
const localSupabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: join(tmpdir(), "options-trade-analyzer-playwright"),
  reporter: "list",
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.E2E_SUPABASE_URL ?? localSupabaseURL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.E2E_SUPABASE_ANON_KEY ?? localSupabaseAnonKey,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
