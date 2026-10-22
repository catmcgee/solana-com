import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LiveFeed } from "@/components/docs/docs-live-feed.client";

const SIG =
  "4JZW7fB3h53qP6f66eat4cwDVDFvxwTtKWbV8tfJJHVo4eHzK9riSvetQSwPEtungFxfbWC968JoyDoqRo7XauLZ";

function sample(slot: number) {
  return {
    slot,
    blockTime: Math.floor(Date.now() / 1000) - 3,
    serverTime: Date.now(),
    txs: 1200,
    votes: 800,
    nonVotes: 400,
    feeLamports: 25_000_000,
    programs: [{ name: "Jupiter", count: 40 }],
    tape: [{ sig: SIG.slice(0, 8), p: "Jupiter", id: SIG, fee: 5000 }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("docs LiveFeed", () => {
  it("shows the sampled block and links each transaction to Explorer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(sample(460_172_365)))),
    );
    render(<LiveFeed />);

    const block = await screen.findByRole("link", {
      name: "block 460,172,365",
    });
    expect(block.getAttribute("href")).toBe(
      "https://explorer.solana.com/block/460172365",
    );
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("0.0250 SOL")).toBeTruthy();
    const tx = screen.getByRole("link", { name: "4JZW7…XauLZ" });
    expect(tx.getAttribute("href")).toBe(
      `https://explorer.solana.com/tx/${SIG}`,
    );
    expect(screen.getByText("0.000005 SOL")).toBeTruthy();
  });

  it("says the data is unavailable when the route fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 502 })),
    );
    render(<LiveFeed />);
    await waitFor(() =>
      expect(screen.getByText("Live data unavailable.")).toBeTruthy(),
    );
  });
});
