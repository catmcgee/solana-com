import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { InActionScene } from "@/components/docs/docs-inaction-scene.client";

const SIG =
  "4JZW7fB3h53qP6f66eat4cwDVDFvxwTtKWbV8tfJJHVo4eHzK9riSvetQSwPEtungFxfbWC968JoyDoqRo7XauLZ";

function reduceMotion(on: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: on && query.includes("reduce"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function serve(body: unknown, status = 200) {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const flush = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/** An IntersectionObserver that reports every element in view at once. */
function inView() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe() {
        this.cb(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
}

describe("InActionScene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    reduceMotion(false);
  });

  it("checkout: Pay sends a devnet transfer, then shows the time, the shop's order, and Explorer", async () => {
    const fetch = serve({ signature: SIG, ms: 640 });
    render(<InActionScene kind="checkout" />);
    expect(screen.getByText("Order #1001 waiting")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pay 1 USDC" }));
    expect(screen.getByRole("button", { name: /Paying/ })).toBeTruthy();
    await flush(1000);

    expect(fetch).toHaveBeenCalledWith(
      "/api/demo/checkout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("button", { name: "Paid in 0.6 s" })).toBeTruthy();
    expect(screen.getByText("Order #1001 paid")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View on Explorer" })
        .getAttribute("href"),
    ).toBe(`https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
    // One "Paid" state, no receipt.
    expect(screen.queryByText("Paid ✓")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pay again" }));
    await flush(1000);
    expect(screen.getByText("Order #1002 paid")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("checkout: without the demo wallets, still pays and says the link is unavailable", async () => {
    serve({ error: "unconfigured" }, 503);
    render(<InActionScene kind="checkout" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay 1 USDC" }));
    await flush(1000);
    expect(screen.getByRole("button", { name: "Paid" })).toBeTruthy();
    expect(screen.getByText("Explorer link unavailable")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("paywall: each call pays with a devnet transfer and adds to the counter", async () => {
    const fetch = serve({ signature: SIG, ms: 412 });
    const { container } = render(<InActionScene kind="paywall" />);
    const count = () =>
      container.querySelector(".sol-scene-count")!.textContent;
    expect(count()).toBe("calls: 0 · spent: $0.000");

    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    await flush(3000);
    expect(fetch).toHaveBeenCalledWith(
      "/api/demo/paywall-call",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("in 0.4 s")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View on Explorer" })
        .getAttribute("href"),
    ).toBe(`https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
    expect(screen.getByText("Sunny, 24°C", { exact: false })).toBeTruthy();
    expect(count()).toBe("calls: 1 · spent: $0.001");

    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    await flush(3000);
    expect(count()).toBe("calls: 2 · spent: $0.002");
  });

  it("paywall: when the route fails, the call still completes without a link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { container } = render(<InActionScene kind="paywall" />);
    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    await flush(3000);
    expect(screen.getByText("Explorer link unavailable")).toBeTruthy();
    expect(container.querySelector(".sol-scene-count")!.textContent).toBe(
      "calls: 1 · spent: $0.001",
    );
  });

  it("with reduced motion, skips the animation but still sends the transfer", async () => {
    reduceMotion(true);
    const fetch = serve({ signature: SIG, ms: 500 });
    render(<InActionScene kind="checkout" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay 1 USDC" }));
    await flush(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Order #1001 paid")).toBeTruthy();
  });

  it("scrolling into view never sends: checkout waits on Pay, the paywall plays without links", async () => {
    const fetch = serve({ signature: SIG, ms: 500 });
    inView();
    const { container } = render(
      <>
        <InActionScene kind="checkout" />
        <InActionScene kind="paywall" />
      </>,
    );
    for (let i = 0; i < 30; i++) await flush(500);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pay 1 USDC" })).toBeTruthy();
    expect(
      container
        .querySelector('[data-kind="checkout"]')!
        .hasAttribute("data-intro"),
    ).toBe(true);
    expect(container.querySelector(".sol-scene-count")!.textContent).toBe(
      "calls: 3 · spent: $0.003",
    );
    expect(screen.queryByText(/Explorer/)).toBeNull();

    // A tap on Call again sends one real transfer.
    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    await flush(3000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/demo/paywall-call",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("link", { name: "View on Explorer" })).toBeTruthy();
  });

  it("never calls the scenes recorded, replayed, sampled, or simulated", async () => {
    serve({ error: "unconfigured" }, 503);
    const { container } = render(
      <>
        <InActionScene kind="checkout" />
        <InActionScene kind="paywall" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay 1 USDC" }));
    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    await flush(3000);
    expect(container.textContent).not.toMatch(/record|replay|sample|simulat/i);
  });
});
