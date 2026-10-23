import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { InActionScene } from "@/components/docs/docs-inaction-scene.client";

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

describe("InActionScene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    reduceMotion(false);
  });

  it("checkout: one button pays, then the receipt and the shop show it", () => {
    render(<InActionScene kind="checkout" />);
    expect(screen.getByText("Waiting")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pay 1 USDC" }));
    expect(screen.getByRole("button", { name: /Paying/ })).toBeTruthy();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Settled in under a second")).toBeTruthy();
    expect(screen.getByText("Order paid")).toBeTruthy();
    expect(screen.getByText("Paid ✓")).toBeTruthy();
    expect(screen.getByText("Order #1001")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pay again" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Order #1002")).toBeTruthy();
  });

  it("paywall: each call adds to the counter", () => {
    const { container } = render(<InActionScene kind="paywall" />);
    const count = () =>
      container.querySelector(".sol-scene-count")!.textContent;
    expect(count()).toBe("calls: 0 · spent: $0.000");

    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText("Sunny, 24°C", { exact: false })).toBeTruthy();
    expect(count()).toBe("calls: 1 · spent: $0.001");

    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(count()).toBe("calls: 2 · spent: $0.002");
  });

  it("with reduced motion, starts at the end state and buttons still work", () => {
    reduceMotion(true);
    const { container } = render(
      <>
        <InActionScene kind="checkout" />
        <InActionScene kind="paywall" />
      </>,
    );
    expect(screen.getByText("Order paid")).toBeTruthy();
    const count = () =>
      container.querySelector(".sol-scene-count")!.textContent;
    expect(count()).toBe("calls: 1 · spent: $0.001");

    fireEvent.click(screen.getByRole("button", { name: "Call again" }));
    expect(count()).toBe("calls: 2 · spent: $0.002");
    fireEvent.click(screen.getByRole("button", { name: "Pay again" }));
    expect(screen.getByText("Order #1002")).toBeTruthy();
  });

  it("never calls the scenes recorded, replayed, sampled, or simulated", () => {
    const { container } = render(
      <>
        <InActionScene kind="checkout" />
        <InActionScene kind="paywall" />
      </>,
    );
    expect(container.textContent).not.toMatch(/record|replay|sample|simulat/i);
  });
});
