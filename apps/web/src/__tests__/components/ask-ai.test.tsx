import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDocsSearch } from "@solana-com/ui-chrome/docs-search";
import { openAskAi } from "@/lib/docs/ask-ai";

const nav = vi.hoisted(() => ({ pathname: "/enterprise", fail: false }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/docs/ask-ai.css", () => ({}));
// Inkeep itself (@inkeep/cxkit-react) is not under test here: a stand-in
// that shows what it was asked to open.
vi.mock("@solana-com/ui-chrome/inkeep-modal", () => ({
  default: ({
    request,
    open,
  }: {
    request: { seq: number; view: string; query?: string; message?: string };
    open: boolean;
  }) => {
    if (nav.fail) throw new Error("ChunkLoadError");
    return (
      <div data-testid="inkeep">
        {`seq ${request.seq} ${request.view} ${open ? "open" : "closed"} ${request.query ?? request.message ?? "-"}`}
      </div>
    );
  },
}));

const { AskAi } = await import("@/components/docs/ask-ai.client");
const { default: InkeepSearchAndChat } =
  await import("@/components/docs/inkeep.client");

describe("AskAi", () => {
  beforeEach(() => {
    nav.pathname = "/enterprise";
    nav.fail = false;
  });

  it("shows the pill on any page when Inkeep is configured", () => {
    render(<AskAi chat />);
    const pill = screen.getByRole("button", { name: "Ask AI" });
    expect(pill.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("shows no pill outside the docs without Inkeep", () => {
    const { container } = render(<AskAi chat={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("opens the menu on the docs without Inkeep, also from a code block", () => {
    nav.pathname = "/developers/docs/core";
    render(<AskAi chat={false} />);
    const pill = screen.getByRole("button", { name: "Ask AI" });
    expect(pill.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(pill);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "Ask ClaudeAbout this page, in claude.ai",
      "Ask ChatGPTAbout this page, in chatgpt.com",
      "Search the docsCtrl K",
    ]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    act(() => openAskAi("let x;"));
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("InkeepSearchAndChat", () => {
  beforeEach(() => {
    nav.fail = false;
  });

  it("loads nothing until something opens it", () => {
    const { container } = render(<InkeepSearchAndChat />);
    expect(container.innerHTML).toBe("");
  });

  it("opens chat from the pill, Ctrl+/ and a code block, and search from the search entry points", async () => {
    render(
      <>
        <AskAi chat />
        <InkeepSearchAndChat />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect((await screen.findByTestId("inkeep")).textContent).toBe(
      "seq 1 chat open -",
    );
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(screen.getByTestId("inkeep").textContent).toBe("seq 2 chat open -");
    act(() => openAskAi("let x;"));
    expect(screen.getByTestId("inkeep").textContent).toMatch(
      /^seq 3 chat open Explain this code from .*:\n\n```\nlet x;\n```$/,
    );
    act(() => openDocsSearch("fees"));
    expect(screen.getByTestId("inkeep").textContent).toBe(
      "seq 4 search open fees",
    );
  });

  it("replays a request made before it loaded", async () => {
    const { InkeepMount } =
      await import("@/components/docs/inkeep-mount.client");
    render(<InkeepMount />);
    act(() => openDocsSearch("early"));
    expect((await screen.findByTestId("inkeep")).textContent).toBe(
      "seq 1 search open early",
    );
  });

  it("opens search on arrival with ?q= and removes it from the URL", async () => {
    history.replaceState(null, "", "/developers/docs?q=accounts&x=1");
    render(<InkeepSearchAndChat />);
    expect((await screen.findByTestId("inkeep")).textContent).toBe(
      "seq 1 search open accounts",
    );
    expect(location.search).toBe("?x=1");
    history.replaceState(null, "", "/");
  });

  it("says so, closably, when Inkeep cannot load", async () => {
    nav.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<InkeepSearchAndChat />);
    act(() => openAskAi());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "couldn't load",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alert")).toBeNull();
    // The page is still there, and the next open says it again.
    act(() => openAskAi());
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
