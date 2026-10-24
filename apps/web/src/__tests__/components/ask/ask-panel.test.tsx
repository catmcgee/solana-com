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
    expect(launcher.textContent).toBe("✨Ask AI");
    // No kbd hint: the shortcut is only in the tooltip.
    expect(launcher.querySelector("kbd")).toBeNull();
    expect(launcher).toHaveAttribute("title", "Ctrl I to open or close");
    // A floating pill only from 1280px; the header's ✨ covers narrower screens.
    expect(launcher.parentElement!.className).toContain("max-xl:hidden");
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
    // Nothing to clear yet.
    expect(
      within(panel).queryByRole("button", { name: "New chat" }),
    ).toBeNull();

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

    // One turn: the question as its heading, then the answer.
    const turn = within(panel).getAllByRole("listitem")[0]!;
    expect(within(turn).getByRole("heading", { level: 3 }).textContent).toBe(
      "You: What is a mint?",
    );
    expect(turn.textContent).toContain("A mint account defines a token.");
    expect(chatBodies()[0]).toMatchObject({ message: "What is a mint?" });

    // The visual draws through AskVisual.
    expect(within(panel).getByText("Diagram")).toBeInTheDocument();

    // In-depth part folded behind "Full answer".
    expect(within(panel).queryByText(/stores/)).toBeNull();
    await act(async () =>
      fireEvent.click(
        within(panel).getByRole("button", { name: "Full answer" }),
      ),
    );
    expect(within(panel).getByText(/mint authority/)).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Hide full answer" }),
    ).toHaveAttribute("aria-expanded", "true");

    // Sources, normalized to /developers/docs.
    const sources = within(panel).getByRole("navigation", { name: "Sources" });
    const source = within(sources).getByRole("link");
    expect(source).toHaveAttribute(
      "href",
      "/developers/docs/tokens/basics/create-mint",
    );
    expect(source.textContent).toContain("Mint accounts");

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
    const feedback = await screen.findByRole("group", { name: "Helpful?" });
    const helpful = within(feedback).getByRole("button", { name: "Yes" });
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
      fireEvent.click(screen.getByRole("button", { name: "Full answer" })),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Expand to full screen" }),
      ),
    );
    const dialog = screen.getByRole("dialog", { name: "Ask AI" });
    expect(
      within(dialog).getByRole("button", { name: "Hide full answer" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("hides rating when the answer has no run id", async () => {
    chats.push(answer({ run_id: null }));
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByRole("button", { name: "Ask again" });
    expect(screen.queryByRole("group", { name: "Helpful?" })).toBeNull();
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
      () =>
        new Response(sse("error", { message: "boom" }), {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    chats.push(answer());
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText("The answer didn’t load.", {
      selector: "p > bdi",
    });
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
    expect(
      screen.getByText("Stopped", { selector: "p > bdi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rent is a deposit", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    // One line, "Stopped · Ask again"; no actions row for half an answer.
    expect(screen.getByRole("button", { name: "Ask again" }).tagName).toBe(
      "BUTTON",
    );
    expect(screen.queryByRole("button", { name: "Copy answer" })).toBeNull();
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
    // The question reads as a title, its code in a frame under it, not as
    // raw fences.
    const turn = screen.getAllByRole("listitem")[0]!;
    expect(within(turn).getByRole("heading", { level: 3 }).textContent).toBe(
      "You: Explain this code from Create a keypair",
    );
    expect(turn.querySelector("pre")!.textContent).toBe(
      "const signer = await generate();",
    );
    expect(turn.textContent).not.toContain("```");
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

describe("Ask AI sidebar shell", () => {
  /**
   * Fakes the thread's scroll box (jsdom has no layout): 3000px of content
   * in 500px, scrolled to the top until something scrolls it.
   */
  function scrolledUp() {
    const el = document.querySelector<HTMLElement>(
      "[data-ask-panel] .overflow-y-auto",
    )!;
    let top = 0;
    const scrollTo = (next: number) => {
      top = Math.min(next, 2500);
      el.dispatchEvent(new Event("scroll"));
    };
    Object.defineProperties(el, {
      scrollHeight: { value: 3000, configurable: true },
      clientHeight: { value: 500, configurable: true },
      scrollTop: {
        get: () => top,
        set: (next: number) => scrollTo(next),
        configurable: true,
      },
      scrollTo: {
        value: (options: ScrollToOptions) => scrollTo(options.top ?? 0),
        configurable: true,
      },
    });
    fireEvent.scroll(el);
  }

  it("groups each question with its answer, ruled off from the turn before", async () => {
    chats.push(answer(), answer({}, "Rent is a deposit."));
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    await ask("And rent?");
    await screen.findByText("Rent is a deposit.", { selector: "p" });

    const thread = document.querySelector("[data-ask-panel] ol")!;
    const turns = [...thread.children];
    expect(turns).toHaveLength(2);
    expect(turns[0]!.className).not.toContain("border-t");
    expect(turns[1]!.className).toContain("border-t");
    // Questions are headings in their own direction; answers too.
    const heading = within(turns[1] as HTMLElement).getByRole("heading", {
      level: 3,
    });
    expect(heading).toHaveAttribute("dir", "auto");
    expect(heading.textContent).toBe("You: And rent?");
    // The answer takes its text's direction (and says so, for icons that
    // flip with it): English stays left to right on an Arabic page.
    const answerRoot = within(turns[1] as HTMLElement)
      .getByText("Rent is a deposit.")
      .closest("[data-dir]");
    expect(answerRoot).toHaveAttribute("dir", "ltr");
    expect(answerRoot).toHaveAttribute("data-dir", "ltr");
    // Only the latest answer offers follow-ups; older sources fold away.
    expect(screen.getAllByRole("button", { name: "TypeScript" })).toHaveLength(
      1,
    );
    expect(
      within(turns[0] as HTMLElement).getByText("Sources (1)"),
    ).toBeInTheDocument();
  });

  it("shows New chat as a labelled button once there is a conversation", async () => {
    chats.push(answer());
    renderAsk();
    await act(async () => askStore.open());
    const panel = screen.getByRole("complementary", { name: "Ask AI" });
    expect(
      within(panel).queryByRole("button", { name: "New chat" }),
    ).toBeNull();
    // A phone sheet is already full screen: no Expand there.
    expect(
      within(panel).getByRole("button", { name: "Expand to full screen" })
        .className,
    ).toContain("max-sm:hidden");
    await ask("What is a mint?");
    const newChat = await within(panel).findByRole("button", {
      name: "New chat",
    });
    expect(newChat.textContent).toBe("New chat");
    await act(async () => fireEvent.click(newChat));
    expect(askStore.getState().messages).toHaveLength(0);
    expect(
      within(panel).queryByRole("button", { name: "New chat" }),
    ).toBeNull();
  });

  it("starts with one sentence, this page, unboxed suggestions and the disclaimer last", async () => {
    const article = document.createElement("div");
    article.id = "content";
    article.dataset.pageTitle = "Accounts";
    article.dataset.pageHref = "/developers/docs/core/accounts";
    document.body.appendChild(article);
    renderAsk();
    await act(async () => askStore.open());
    const panel = screen.getByRole("complementary", { name: "Ask AI" });
    expect(within(panel).queryByRole("heading", { level: 3 })).toBeNull();
    const thisPage = within(panel).getByRole("button", {
      name: "Ask about this page Accounts",
    });
    const suggestion = within(panel).getByRole("button", {
      name: "How does one program call another?",
    });
    // Rows follow the page's direction; the words isolate their own, so an
    // English question keeps its "?" at the end on an Arabic page.
    expect(suggestion).not.toHaveAttribute("dir");
    expect(suggestion.querySelector("bdi")!.textContent).toBe(
      "How does one program call another?",
    );
    const paragraphs = [
      ...panel.querySelectorAll(".overflow-y-auto > div > div > p"),
    ];
    expect(paragraphs[0]!.textContent).toBe(
      "Answers draw on the Solana docs and link to the pages they use.",
    );
    expect(paragraphs.at(-1)!.textContent).toBe(
      "Answers can be wrong. Check them against the linked pages.",
    );
    // The disclaimer is no longer under the composer.
    expect(
      within(panel).getAllByText(
        "Answers can be wrong. Check them against the linked pages.",
      ),
    ).toHaveLength(1);
    await act(async () => fireEvent.click(thisPage));
    expect(askStore.getState().pageContext?.title).toBe("Accounts");
  });

  it("shows the asked page above the question", async () => {
    chats.push(answer());
    renderAsk();
    await act(async () =>
      askStore.open({
        aboutPage: {
          title: "Accounts",
          url: "https://solana.com/developers/docs/core/accounts",
        },
      }),
    );
    await ask("What is rent?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    const turn = screen.getAllByRole("listitem")[0]!;
    const context = turn.querySelector("p")!;
    expect(context.textContent).toBe("AccountsThis page: Accounts");
    expect(within(turn).getByRole("heading", { level: 3 }).textContent).toBe(
      "You: What is rent?",
    );
  });

  it("turns the field red and counts characters when the question is too long", async () => {
    renderAsk();
    await act(async () => askStore.open());
    fireEvent.change(composer(), { target: { value: "x".repeat(4100) } });
    expect(composer()).toHaveAttribute("aria-invalid", "true");
    expect(composer().parentElement!.className).toContain("var(--sol-red)");
    expect(screen.getByText("4,100/4,000")).toBeInTheDocument();
    fireEvent.change(composer(), { target: { value: "Short" } });
    expect(composer()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/\/4,000/)).toBeNull();
  });

  it("folds an older failed turn to “Didn’t finish.”", async () => {
    chats.push(
      () =>
        new Response(sse("error", { message: "boom" }), {
          headers: { "content-type": "text/event-stream" },
        }),
      answer(),
    );
    renderAsk();
    await act(async () => askStore.open());
    await ask("First?");
    await screen.findByRole("button", { name: "Try again" });
    await ask("Second?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    const first = screen.getAllByRole("listitem")[0]!;
    expect(within(first).getByText("Didn’t finish.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("puts a rate-limited question back in the composer, with no Try again", async () => {
    chats.push(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText(
      "You’ve asked several questions in a row. Wait a minute, then send it again.",
      { selector: "p > bdi" },
    );
    await waitFor(() => expect(composer().value).toBe("What is a mint?"));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers Jump to latest only while something new is below", async () => {
    chats.push(answer());
    const stream = controllable();
    chats.push(stream.response);
    renderAsk();
    await act(async () => askStore.open());
    await ask("What is a mint?");
    await screen.findByText("A mint account defines a token.", {
      selector: "p",
    });
    // Reading up a finished answer: nothing new, no pill.
    await act(async () => scrolledUp());
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();

    // An answer arriving while the reader is up the thread.
    await ask("And rent?");
    await act(async () => scrolledUp());
    await act(async () => stream.send("delta", { text: "Rent is" }));
    const jump = await screen.findByRole("button", { name: "Jump to latest" });
    expect(jump.className).toContain("end-4");
    await act(async () => fireEvent.click(jump));
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
  });

  it("goes full screen under the docs header, which stays usable", async () => {
    const page = document.createElement("div");
    page.innerHTML =
      '<header class="dh"><button>Theme</button></header><main id="docs-body"></main><footer></footer>';
    document.body.appendChild(page);
    renderAsk();
    await act(async () => askStore.setFullscreen(true));
    const dialog = screen.getByRole("dialog", { name: "Ask AI" });
    expect(dialog.className).toContain("top-16");
    expect(dialog).not.toHaveAttribute("aria-modal");
    // The page behind is inert, the header isn't.
    expect(page.querySelector("main")).toHaveAttribute("inert");
    expect(page.querySelector("footer")).toHaveAttribute("inert");
    expect(page.querySelector("header")).not.toHaveAttribute("inert");
    // Using the header keeps the panel.
    await act(async () => {
      fireEvent.pointerDown(page.querySelector("header button")!);
      fireEvent.focus(page.querySelector("header button")!);
    });
    expect(askStore.getState().layout).toBe("fullscreen");
    await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(askStore.getState().layout).toBe("docked");
    expect(page.querySelector("main")).not.toHaveAttribute("inert");
  });
});
