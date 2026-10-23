import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LiveFeed } from "@/components/docs/docs-live-feed.client";

const SIG =
  "4JZW7fB3h53qP6f66eat4cwDVDFvxwTtKWbV8tfJJHVo4eHzK9riSvetQSwPEtungFxfbWC968JoyDoqRo7XauLZ";

function tip(slot: number) {
  return {
    tip: slot,
    blocks: [
      { slot: slot - 2, txs: 412, sigs: [`a${SIG.slice(1)}`] },
      { slot, txs: 386, sigs: [SIG] },
    ],
    skipped: [slot - 1],
    serverTime: Date.now(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("docs LiveFeed", () => {
  it("shows each block as a tile and links its transactions to Explorer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(tip(460_172_365)))),
    );
    render(<LiveFeed />);

    expect(
      await screen.findByText("460,172,365", { selector: "b" }),
    ).toBeTruthy();
    const tile = (await screen.findByText("386")).closest("a");
    expect(tile?.getAttribute("href")).toBe(
      "https://explorer.solana.com/block/460172365",
    );
    expect(screen.getByText("412")).toBeTruthy();
    expect(screen.getByText("skipped")).toBeTruthy();

    const tx = await screen.findByRole(
      "link",
      { name: "4JZW7f…7XauLZ" },
      { timeout: 2_000 },
    );
    expect(tx.getAttribute("href")).toBe(
      `https://explorer.solana.com/tx/${SIG}`,
    );
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
