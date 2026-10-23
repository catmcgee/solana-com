import { defineConfig, devices } from "@playwright/test";

/**
 * Ask AI (components/docs/ask-ai.client.tsx) on the docs, /developers and
 * the solana.com pages, against a mocked /api/docs-chat: run it on a build
 * made with NOUS_API_KEY set (any value), so the pages render the chat.
 *
 *   NOUS_API_KEY=x next build && next start -p 3830
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
