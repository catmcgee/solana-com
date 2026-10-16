import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runExample } from "../../../test/record";

// Each step is a script a reader runs with `npx tsx <file>`; importing it runs
// it once. A fresh wallet file, so step 1 always takes the airdrop branch.
process.env.WALLET_FILE = join(
  mkdtempSync(join(tmpdir(), "quickstart-")),
  "wallet.json",
);

const out = (name: string) => new URL(`./${name}.output.txt`, import.meta.url);

describe("paths/start/quickstart", () => {
  it("1: checks the balance and gets devnet SOL", async () => {
    const r = await runExample(() => import("./balance"), {
      output: out("balance"),
    });
    expect(r.text).toMatch(
      /^Wallet: \w+\nBalance: 0 SOL\nAirdrop: \w+\nBalance: 1 SOL$/,
    );
  });

  it("2: sends 0.01 SOL", async () => {
    const r = await runExample(() => import("./send-sol"), {
      output: out("send-sol"),
    });
    expect(r.text).toContain("Recipient balance: 0.01 SOL");
  });

  it("3: creates a token and mints 1,000 of it", async () => {
    const r = await runExample(() => import("./create-token"), {
      output: out("create-token"),
    });
    expect(r.text).toContain("Balance: 1000 tokens");
  });
});
