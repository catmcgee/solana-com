import { defineConfig, devices } from "@playwright/test";

/**
 * Inkeep search and Ask AI (e2e/ask-ai.spec.ts), with /api/inkeep/* mocked.
 * INKEEP_MOCK=0 sends its requests to the server instead.
 *
 *   next build && next start -p 3830
 *   BASE_URL=http://localhost:3830 pnpm --filter solana-com exec \
 *     playwright test -c e2e/ask-ai.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: /ask-ai\.spec\.ts$/,
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "../test-results/ask-ai",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
