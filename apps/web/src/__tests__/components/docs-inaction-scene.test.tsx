import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InActionScene } from "@/components/docs/docs-inaction-scene.client";
import { SCENES } from "@/components/docs/inaction-scenes";

describe("InActionScene", () => {
  it("shows the first beat, steps with the dots, and links the tutorial", () => {
    const { container } = render(<InActionScene kind="checkout" />);
    expect(container.querySelector(".txw-packet")?.textContent).toContain(
      "1 USDC",
    );
    expect(screen.getByText("0 → 1 USDC")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Step 2 of 2" }));
    expect(screen.getByText("paid: true")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Play" }), // clicking a dot pauses
    ).toBeTruthy();

    const link = screen.getByRole("link", {
      name: /Tutorial: Build a checkout/,
    });
    expect(link.getAttribute("href")).toBe(
      "/developers/docs/payments/checkout",
    );
  });

  it("keeps the demo in the page, hidden until Run the demo", () => {
    render(
      <InActionScene kind="trade">
        <p>the demo</p>
      </InActionScene>,
    );
    const demo = screen.getByText("the demo").parentElement!;
    expect(demo.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Run the demo" }));
    expect(demo.hidden).toBe(false);
  });

  it("never calls the runs recorded, replayed, sampled, or simulated", () => {
    const text = JSON.stringify(SCENES);
    expect(text).not.toMatch(/record|replay|sample|simulat/i);
  });
});
