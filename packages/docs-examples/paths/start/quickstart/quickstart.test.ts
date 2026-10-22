import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { setTokenBalance } from "../../../test/fixtures/fund";
import { runExample } from "../../../test/record";

// Each step is a script a reader runs with `npx tsx <file>`; importing it runs
// it once. A fresh wallet file, so step 1 always takes the airdrop branch.
process.env.WALLET_FILE = join(
  mkdtempSync(join(tmpdir(), "quickstart-")),
  "wallet.json",
);

const out = (name: string) => new URL(`./${name}.output.txt`, import.meta.url);

describe("paths/start/quickstart", () => {
  it("1: checks the balance, gets devnet SOL, and points to devnet USDC", async () => {
    const r = await runExample(() => import("./balance"), {
      output: out("balance"),
    });
    expect(r.text).toMatch(
      /^Wallet: \w+\nBalance: 0 SOL\nAirdrop: \w+\nBalance: 1 SOL\nUSDC: 0\nGet free devnet USDC for \w+ at https:\/\/faucet\.circle\.com \(pick Solana Devnet\)\.$/,
    );
  });

  it("2: sends 1 USDC to a new address", async () => {
    // Stands in for Circle's devnet faucet: 10 USDC in the reader's wallet.
    const { loadWallet } = await import("./config");
    const wallet = await loadWallet();
    await setTokenBalance(wallet.address, 10_000_000n);

    const r = await runExample(() => import("./send-dollars"), {
      output: out("send-dollars"),
    });
    expect(r.text).toContain("Recipient balance: 1 USDC");
    expect(r.text).toMatch(
      /^Explorer: https:\/\/explorer\.solana\.com\/tx\/\w+\?cluster=devnet$/m,
    );
  });

  it("3: creates an asset with onchain metadata and mints 1,000 of it", async () => {
    const r = await runExample(() => import("./create-asset"), {
      output: out("create-asset"),
    });
    expect(r.text).toContain("Name: Example Fund (EXF)");
    expect(r.text).toContain("Balance: 1000 EXF");
    expect(r.text).toMatch(
      /^Explorer: https:\/\/explorer\.solana\.com\/address\/\w+\?cluster=devnet$/m,
    );
  });
});
