import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASK_AI_EMPTY,
  ASK_AI_OFFLINE,
  askAiErrorMessage,
  askAiFetch,
  isEmptyAnswer,
} from "@/lib/docs/chat-fetch";
import { DOCS_ASK_CODE_EVENT } from "@/lib/docs/chat";

const nav = vi.hoisted(() => ({ pathname: "/enterprise", fail: false }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/docs/ask-ai.css", () => ({}));
// The chat itself (AI SDK, Fumadocs) is not under test here: a stand-in
// that shows what AskAi asked of it.
vi.mock("@/components/docs/docs-chat-panel.client", () => ({
  default: ({ request }: { request: { seq: number; code?: string } }) => {
    if (nav.fail) throw new Error("ChunkLoadError");
    return (
      <aside className="docs-chat" data-testid="panel">
        {`seq ${request.seq} code ${request.code ?? "-"}`}
      </aside>
    );
  },
}));

const { AskAi } = await import("@/components/docs/ask-ai.client");

describe("askAiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stream = () =>
    new Response("data: {}\n\n", {
      headers: { "content-type": "text/event-stream" },
    });

  it("passes an answer stream through", async () => {
    const ok = stream();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    expect(await askAiFetch("/api/docs-chat")).toBe(ok);
  });

  it.each([
    [503, "isn't available"],
    [500, "couldn't answer"],
    [504, "took too long"],
    [429, "a lot of questions"],
    [400, "couldn't read"],
  ])("turns a %i into a readable message", async (status, text) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<!DOCTYPE html><h1>Error</h1>", { status }),
        ),
    );
    const response = await askAiFetch("/api/docs-chat");
    expect(response.ok).toBe(false);
    const body = await response.text();
    expect(body).toContain(text);
    expect(body).not.toContain("<");
    expect(body).toBe(askAiErrorMessage(status));
  });

  it("treats a 200 that is not a stream (a challenge page) as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const response = await askAiFetch("/api/docs-chat");
    expect(response.ok).toBe(false);
    expect(await response.text()).toBe(askAiErrorMessage(502));
  });

  it("says when the network failed, and rethrows aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(askAiFetch("/api/docs-chat")).rejects.toThrow(ASK_AI_OFFLINE);
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(askAiFetch("/api/docs-chat")).rejects.toBe(abort);
  });
});

describe("isEmptyAnswer", () => {
  it("is true for an answer with no text, false otherwise", () => {
    const answer = (parts: { type: "text"; text: string }[]) => ({
      id: "a",
      role: "assistant" as const,
      parts,
    });
    expect(isEmptyAnswer(answer([]))).toBe(true);
    expect(isEmptyAnswer(answer([{ type: "text", text: "  " }]))).toBe(true);
    expect(isEmptyAnswer(answer([{ type: "text", text: "Hi" }]))).toBe(false);
    expect(
      isEmptyAnswer({ ...answer([]), role: "user" as unknown as "assistant" }),
    ).toBe(false);
    expect(ASK_AI_EMPTY).toMatch(/No answer/);
  });
});

describe("AskAi", () => {
  beforeEach(() => {
    nav.pathname = "/enterprise";
    nav.fail = false;
  });

  it("shows the pill on any page when the assistant is configured", () => {
    render(<AskAi locale="en" chat />);
    expect(screen.getByRole("button", { name: "Ask AI" })).toBeTruthy();
    // Nothing of the chat yet.
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("shows no pill outside the docs without the assistant", () => {
    const { container } = render(<AskAi locale="en" chat={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("opens the menu on the docs without the assistant", async () => {
    nav.pathname = "/developers/docs/core";
    render(<AskAi locale="en" chat={false} />);
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
  });

  it("loads and opens the chat from the pill, Ctrl+/ and a code block", async () => {
    render(<AskAi locale="en" chat />);
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect((await screen.findByTestId("panel")).textContent).toBe(
      "seq 1 code -",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(screen.getByTestId("panel").textContent).toBe("seq 2 code -");
    act(() => {
      window.dispatchEvent(
        new CustomEvent(DOCS_ASK_CODE_EVENT, { detail: { code: "let x;" } }),
      );
    });
    expect(screen.getByTestId("panel").textContent).toBe("seq 3 code let x;");
  });

  it("says so, closably, when the chat cannot load", async () => {
    nav.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AskAi locale="en" chat />);
    const pill = screen.getByRole("button", { name: "Ask AI" });
    fireEvent.click(pill);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Ask AI couldn't load",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alert")).toBeNull();
    // The page is still there, and the next open says it again.
    fireEvent.click(pill);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
