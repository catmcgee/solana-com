import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../../packages/i18n/messages/web/en/common.json";
import { openAskAi } from "@/lib/docs/ask-ai";
import { clearAskSession } from "@/lib/docs/ask/client";
import { tokenLifecycleGenerativeUiFixture } from "@/lib/docs/ask/fixtures/common-visual";
import { askStore, resetAskStoreForTests } from "@/lib/docs/ask/store";

vi.mock("next/navigation", () => ({
  usePathname: () => "/developers/docs/core/accounts",
  useRouter: () => ({ prefetch: vi.fn() }),
}));
vi.mock("fumadocs-core/highlight/client", () => ({
  useShiki: (code: string) => <pre className="shiki">{code}</pre>,
}));

const { AskAi } = await import("@/components/docs/ask/ask-ai.client");

const encoder = new TextEncoder();
const sse = (name: string, data: unknown) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

const ANSWER =
  "### Summary response\nA mint account defines a token.\n\n### Indepth response\nIt stores `decimals` and the mint authority.\n\nWant to see this in code?";

function answer(done: Record<string, unknown> = {}, text = ANSWER) {
  return new Response(
    sse("status", { stage: "searching_docs" }) +
      sse("delta", { text }) +
      sse("done", {
        run_id: 101,
        conversation_id: 7,
        citations: [
          {
            title: "Mint accounts",
            url: "/docs/tokens/basics/create-mint",
            breadcrumbs: ["Tokens", "Basics"],
          },
        ],
        code_followups: {
          prompt: "Want to see this in code?",
          buttons: [
            {
              type: "show_code",
              label: "TypeScript",
              language: "typescript",
              message: "Show me the code in TypeScript.",
            },
          ],
        },
        ...done,
      }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

/** A chat response the test feeds by hand. */
function controllable() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, {
      headers: { "content-type": "text/event-stream" },
    }),
    send: (name: string, data: unknown) =>
      controller.enqueue(encoder.encode(sse(name, data))),
  };
}

let chats: Array<Response | (() => Response)> = [];
let fetchMock: ReturnType<typeof vi.fn>;

const chatBodies = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/chat"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

function renderAsk() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AskAi />
    </NextIntlClientProvider>,
  );
}

const html = document.documentElement;
const composer = () =>
  document.querySelector<HTMLTextAreaElement>("[data-ask-composer]")!;

async function ask(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(composer(), { key: "Enter" });
  });
}

beforeEach(() => {
  resetAskStoreForTests();
  clearAskSession();
  localStorage.clear();
  sessionStorage.clear();
  html.removeAttribute("data-ask");
  html.style.removeProperty("--ask-w");
  html.lang = "en";
  document.body.innerHTML = "";
  setViewport(1440);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: window.innerWidth >= Number(/(\d+)px/.exec(query)?.[1] ?? 1e9),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  chats = [];
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/session"))
      return Response.json({ session_token: "mock-token" });
    if (url.endsWith("/feedback")) return new Response(null, { status: 204 });
    if (url.endsWith("/chat")) {
      const next = chats.shift();
      if (!next) throw new Error("unexpected chat request");
      return typeof next === "function" ? next() : next;
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAskStoreForTests();
});

describe("Ask AI launcher and panel", () => {
  it("is a launcher named exactly “Ask AI” that docks the panel at 1440px", async () => {
    renderAsk();
    const launcher = screen.getByRole("button", { name: "Ask AI" });
    expect(launcher.textContent).toContain("✨");
    launcher.focus();
    await act(async () => fireEvent.click(launcher));

    const panel = screen.getByRole("complementary", { name: "Ask AI" });
    expect(panel).toHaveAttribute("data-docs");
    expect(panel).toHaveAttribute("data-dev-landing", "docs");
    expect(html.dataset.ask).toBe("docked");
    expect(html.style.getPropertyValue("--ask-w")).toBe("420px");
    expect(document.activeElement).toBe(composer());
    // Empty state: four suggestions (no docs page here, so no page row).
    expect(within(panel).getByText("Try asking")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: /What is a program derived/ }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: /Ask about this page/ }),
    ).toBeNull();
    expect(
      within(panel).getByRole("button", { name: "New chat" }),
    ).toBeDisabled();

    await act(async () =>
      fireEvent.click(within(panel).getByRole("button", { name: "Close" })),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(html.hasAttribute("data-ask")).toBe(false);
    expect(document.activeElement).toBe(launcher);
  });

  it("resizes from the keyboard, within its limits", async () => {
    renderAsk();
    await act(async () => askStore.open());
    const handle = screen.getByRole("separator", { name: "Resize panel" });
    expect(handle).toHaveAttribute("aria-valuenow", "420");
    expect(handle).toHaveAttribute("aria-valuemin", "360");
    expect(handle).toHaveAttribute("aria-valuemax", "720");
    await act(async () => fireEvent.keyDown(handle, { key: "ArrowLeft" }));
    expect(handle).toHaveAttribute("aria-valuenow", "444");
    await act(async () =>
      fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true }),
    );
    expect(handle).toHaveAttribute("aria-valuenow", "360");
    await act(async () => fireEvent.keyDown(handle, { key: "End" }));
    expect(html.style.getPropertyValue("--ask-w")).toBe("720px");
    await act(async () => fireEvent.doubleClick(handle));
    expect(handle).toHaveAttribute("aria-valuenow", "420");
  });

  it("is a modal overlay below 1280px; Esc closes it", async () => {
    setViewport(1100);
    renderAsk();
    await act(async () => askStore.open());
    const dialog = screen.getByRole("dialog", { name: "Ask AI" });
    expect(dialog).toHaveAttribute("data-docs");
    expect(html.dataset.ask).toBe("overlay");
    await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(askStore.getState().open).toBe(false);
  });

  it("expands to full screen; Esc returns to the docked panel", async () => {
    renderAsk();
    await act(async () => askStore.open());
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Expand to full screen" }),
      ),
    );
    const dialog = screen.getByRole("dialog", { name: "Ask AI" });
    expect(html.dataset.ask).toBe("fullscreen");
    expect(
      within(dialog).getByRole("button", { name: "Exit full screen" }),
    ).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Ask AI" }),
    ).toBeInTheDocument();
  });

  it("toggles with ⌘I / Ctrl+I, but not from other text fields", async () => {
    renderAsk();
    const input = document.createElement("input");
    document.body.appendChild(input);
    await act(async () =>
      fireEvent.keyDown(input, { key: "i", ctrlKey: true }),
    );
    expect(askStore.getState().open).toBe(false);
    await act(async () =>
      fireEvent.keyDown(document.body, { key: "i", metaKey: true }),
    );
    expect(askStore.getState().open).toBe(true);
    // From our own composer it closes again.
    await act(async () =>
      fireEvent.keyDown(composer(), { key: "I", ctrlKey: true }),
    );
    expect(askStore.getState().open).toBe(false);
  });
});

describe("Ask AI conversation", () => {
  it("streams an answer: summary, folded in-depth part, sources, follow-ups, actions", async () => {
    chats.push(
      answer({
        generative_ui: tokenLifecycleGenerativeUiFixture,
      }),
    );
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    const panel = screen.getByRole("complementary", { name: "Ask AI" });

    // The question, then the answer.
    const items = within(panel).getAllByRole("listitem");
    expect(items[0]!.textContent).toBe("You: What is a mint?");
    expect(chatBodies()[0]).toMatchObject({ message: "What is a mint?" });

    // The visual draws through AskVisual.
    expect(within(panel).getByText("Diagram")).toBeInTheDocument();

    // In-depth part folded behind "Show the full answer".
    expect(within(panel).queryByText(/stores/)).toBeNull();
    await act(async () =>
      fireEvent.click(
        within(panel).getByRole("button", { name: "Show the full answer" }),
      ),
    );
    expect(within(panel).getByText(/mint authority/)).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");

    // Sources, normalized to /developers/docs and numbered.
    const sources = within(panel).getByRole("navigation", { name: "Sources" });
    const source = within(sources).getByRole("link");
    expect(source).toHaveAttribute(
      "href",
      "/developers/docs/tokens/basics/create-mint",
    );
    expect(source.textContent).toBe("1Mint accountsTokens / Basics");

    // The follow-up prompt shows once, above its chip.
    expect(
      within(panel).getAllByText("Want to see this in code?"),
    ).toHaveLength(1);
    chats.push(answer({}, "Here it is."));
    await act(async () =>
      fireEvent.click(
        within(panel).getByRole("button", { name: "TypeScript" }),
      ),
    );
    await screen.findByText("Here it is.", { selector: "p" });
    expect(chatBodies()[1]).toMatchObject({
      message: "Show me the code in TypeScript.",
      conversation_id: "7",
    });
  });

  it("rates an answer and thanks the reader", async () => {
    chats.push(answer());
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    const helpful = await screen.findByRole("button", { name: "Helpful" });
    await act(async () => fireEvent.click(helpful));
    expect(helpful).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Thanks for the feedback.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/feedback")),
      ).toBe(true),
    );
  });

  it("keeps the full answer open when switching to full screen", async () => {
    chats.push(answer());
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Show the full answer" }),
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Expand to full screen" }),
      ),
    );
    const dialog = screen.getByRole("dialog", { name: "Ask AI" });
    expect(
      within(dialog).getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("hides rating when the answer has no run id", async () => {
    chats.push(answer({ run_id: null }));
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByRole("button", { name: "Ask again" });
    expect(screen.queryByRole("button", { name: "Helpful" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy answer" }),
    ).toBeInTheDocument();
  });

  it("sends on Enter, not on Shift+Enter", async () => {
    renderAsk();
    await act(async () => askStore.open());
    fireEvent.change(composer(), { target: { value: "two\nlines" } });
    await act(async () =>
      fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true }),
    );
    expect(chatBodies()).toHaveLength(0);
    expect(composer().value).toBe("two\nlines");
  });

  it("refuses questions over 4,000 characters without sending", async () => {
    renderAsk();
    await act(async () => askStore.open());
    await ask("x".repeat(4001));
    expect(screen.getByRole("alert").textContent).toBe(
      "Shorten your question to under 4,000 characters.",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(chatBodies()).toHaveLength(0);
  });

  it("shows the error kind and asks again on Try again", async () => {
    chats.push(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    chats.push(answer());
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText(
      "You’ve sent several questions in a row. Wait a minute, then try again.",
      { selector: "p" },
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Try again" })),
    );
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers New chat when the conversation is full", async () => {
    chats.push(
      new Response(JSON.stringify({ error: "conversation_limit" }), {
        status: 409,
      }),
    );
    renderAsk();
    await act(async () => askStore.open());
    await ask("One more?");
    const newChat = await screen.findAllByRole("button", { name: "New chat" });
    // The header's, and the callout's.
    expect(newChat).toHaveLength(2);
    await act(async () => fireEvent.click(newChat[1]!));
    expect(askStore.getState().messages).toHaveLength(0);
  });

  it("stops a streaming answer, keeping what arrived", async () => {
    const stream = controllable();
    chats.push(stream.response);
    renderAsk();
    await act(async () => askStore.open());
    await ask("Explain rent");
    await screen.findByText("Preparing an answer", { selector: "span" });
    await act(async () => stream.send("status", { stage: "searching_docs" }));
    await screen.findByText("Searching the docs", { selector: "span" });
    await act(async () => stream.send("delta", { text: "Rent is a deposit" }));
    await screen.findByText("Rent is a deposit", { selector: "p" });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Stop" })),
    );
    expect(screen.getByText("Stopped", { selector: "p" })).toBeInTheDocument();
    expect(
      screen.getByText("Rent is a deposit", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("asks about a code block from the docs page", async () => {
    chats.push(answer());
    document.title = "Create a keypair";
    renderAsk();
    await act(async () => openAskAi("const signer = await generate();"));
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    expect(chatBodies()[0]!.message).toBe(
      "Explain this code from Create a keypair:\n\n```\nconst signer = await generate();\n```",
    );
    // The question shows its code in a box, not as raw fences.
    const question = screen.getAllByRole("listitem")[0]!;
    expect(question.querySelector("pre")!.textContent).toBe(
      "const signer = await generate();",
    );
    expect(question.textContent).not.toContain("```");
  });

  it("attaches this page to the question as a removable chip", async () => {
    chats.push(answer());
    const article = document.createElement("div");
    article.id = "content";
    article.dataset.pageTitle = "Accounts";
    article.dataset.pageHref = "/developers/docs/core/accounts";
    document.body.appendChild(article);
    renderAsk();
    await act(async () => askStore.open());
    // The empty state offers this page until it is attached.
    expect(
      screen.getByRole("button", { name: /Ask about this page/ }),
    ).toBeInTheDocument();
    await act(async () => openAskAi({ aboutPage: true }));
    expect(screen.getByText("This page: Accounts")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ask about this page/ }),
    ).toBeNull();
    expect(document.activeElement).toBe(composer());
    expect(chatBodies()).toHaveLength(0);

    await ask("What is rent?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    expect(chatBodies()[0]).toMatchObject({
      message:
        "Question about the docs page “Accounts” (https://solana.com/developers/docs/core/accounts):\n\nWhat is rent?",
      page_url: "https://solana.com/developers/docs/core/accounts",
    });
    // Shown above the question, and gone from the composer.
    expect(screen.getAllByText("This page: Accounts")).toHaveLength(1);

    await act(async () => askStore.attachCurrentPage());
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Remove page from question" }),
      ),
    );
    expect(askStore.getState().pageContext).toBeNull();
  });
});
