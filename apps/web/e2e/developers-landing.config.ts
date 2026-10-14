import { defineConfig, devices } from "@playwright/test";

/**
 * Acceptance suite for the /developers and /learn landings (spec §7.5).
 * Kept separate from playwright.config.ts, which only runs the Builder.io
 * migration comparison suite.
 *
 *   pnpm --filter solana-com exec playwright test -c e2e/developers-landing.config.ts
 *
 * BASE_URL defaults to a local `next dev`/`next start` on :3000.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /developers-landing\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "../test-results/developers-landing",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
});
