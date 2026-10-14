import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["cookbook/**/*.test.ts", "paths/**/*.test.ts"],
    // Path examples read their cluster from the environment (devnet by
    // default, as shown to readers); tests point them at the local surfnet.
    env: {
      RPC_URL: "http://127.0.0.1:8899",
      RPC_SUBSCRIPTIONS_URL: "ws://127.0.0.1:8900",
    },
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
