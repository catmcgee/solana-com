import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DOCS_ASK_OPEN_EVENT, openAskAi } from "@/lib/docs/ask-ai";
import { openDocsSearch } from "@/lib/docs/search-hand-off";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
// Inkeep's modal is not under test: a stand-in that shows how it was opened
// and offers its "Ask AI" hand-off.
vi.mock("next/dynamic", () => ({
  default: () =>
    function InkeepModal(props: {
      searchSettings: { defaultQuery?: string };
      modalSettings: { isOpen: boolean };
      onToggleView?: (toggle: { view: string; query?: string }) => void;
    }) {
      return (
        <div data-testid="inkeep">
          {`${props.modalSettings.isOpen ? "open" : "closed"} search ${props.searchSettings.defaultQuery}`}
          <button
            type="button"
            onClick={() =>
              props.onToggleView?.({
                view: "chat",
                query: props.searchSettings.defaultQuery,
              })
            }
          >
            Ask AI
          </button>
        </div>
      );
    },
}));

const { DocsInkeep } = await import("@/components/docs/inkeep.client");

describe("DocsInkeep", () => {
  it("opens search with the query; code blocks no longer open Inkeep", () => {
    render(<DocsInkeep />);
    const modal = screen.getByTestId("inkeep");
    expect(modal.textContent).toContain("closed search ");
    act(() => openDocsSearch("fees"));
    expect(modal.textContent).toContain("open search fees");
    act(() => openAskAi("let x;"));
    expect(modal.textContent).toContain("open search fees");
  });

  it("hands “Ask AI” in the search to the docs' Ask AI panel", () => {
    const asked = vi.fn();
    const onAsk = (event: Event) => asked((event as CustomEvent).detail);
    window.addEventListener(DOCS_ASK_OPEN_EVENT, onAsk);
    render(<DocsInkeep />);
    act(() => openDocsSearch("rent"));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Ask AI" })));
    expect(screen.getByTestId("inkeep").textContent).toContain("closed");
    expect(asked).toHaveBeenCalledWith({ question: "rent" });
    window.removeEventListener(DOCS_ASK_OPEN_EVENT, onAsk);
  });

  it("opens search on arrival with ?q=", () => {
    history.replaceState(null, "", "/developers/docs?q=mint");
    render(<DocsInkeep />);
    expect(screen.getByTestId("inkeep").textContent).toContain(
      "open search mint",
    );
    expect(location.search).toBe("");
  });
});
