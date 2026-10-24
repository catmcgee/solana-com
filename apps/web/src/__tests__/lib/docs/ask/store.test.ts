import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAskAi } from "@/lib/docs/ask-ai";
import { clearAskSession } from "@/lib/docs/ask/client";
import {
  ASK_STORAGE_KEYS,
  DOCS_ASK_PREPAINT_SCRIPT,
} from "@/lib/docs/ask/config";
import {
  askStore,
  connectAskAiEvents,
  resetAskStoreForTests,
  type AskAssistantMessage,
} from "@/lib/docs/ask/store";
import { useAskSelector, useAskState } from "@/lib/docs/ask/use-ask";

type FetchArgs = Parameters<typeof fetch>;

const encoder = new TextEncoder();
const event = (name: string, data: unknown) =>
  encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

/** A chat response the test feeds event by event. */
function controllableStream() {
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
      controller.enqueue(event(name, data)),
    end: () => controller.close(),
  };
}

function finished(text: string, done: Record<string, unknown> = {}) {
  return new Response(
    [
      event("status", { stage: "searching_docs" }),
      event("delta", { text }),
      event("done", { run_id: 101, conversation_id: 7, ...done }),
    ]
      .map((bytes) => new TextDecoder().decode(bytes))
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

let chatQueue: Array<Response | (() => Response)> = [];
let fetchMock: ReturnType<typeof vi.fn>;

function chatBodies() {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith("/chat"))
    .map(
      ([, init]) =>
        JSON.parse(String((init as RequestInit).body)) as Record<
          string,
          unknown
        >,
    );
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

function lastAssistant(): AskAssistantMessage {
  const message = askStore.getState().messages.at(-1);
  if (message?.role !== "assistant") throw new Error("no assistant message");
  return message;
}

const html = document.documentElement;

beforeEach(() => {
  resetAskStoreForTests();
  clearAskSession();
  localStorage.clear();
  sessionStorage.clear();
  html.removeAttribute("data-ask");
  html.style.removeProperty("--ask-w");
  html.lang = "en";
  document.body.innerHTML = "";
  Object.defineProperty(window, "innerWidth", {
    value: 1440,
    configurable: true,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: window.innerWidth >= Number(/(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  chatQueue = [];
  fetchMock = vi.fn(async (...[input]: FetchArgs) => {
    const url = String(input);
    if (url.endsWith("/session"))
      return Response.json({ session_token: "mock-token" });
    if (url.endsWith("/feedback")) return new Response(null, { status: 204 });
    if (url.endsWith("/chat")) {
      const next = chatQueue.shift();
      if (!next) throw new Error("unexpected chat request");
      return typeof next === "function" ? next() : next;
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  resetAskStoreForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("panel state", () => {
  it("serves a closed, empty snapshot to the server render", () => {
    expect(askStore.getServerState()).toMatchObject({
      hydrated: false,
      open: false,
      messages: [],
    });
  });

  it("docks from 1280px, overlays below, and mirrors the layout on <html>", () => {
    askStore.open();
    expect(askStore.getState()).toMatchObject({
      open: true,
      layout: "docked",
      width: 420,
    });
    expect(html.getAttribute("data-ask")).toBe("docked");
    expect(html.style.getPropertyValue("--ask-w")).toBe("420px");

    setViewport(1000);
    expect(askStore.getState().layout).toBe("overlay");
    expect(html.getAttribute("data-ask")).toBe("overlay");

    askStore.setFullscreen(true);
    expect(askStore.getState()).toMatchObject({
      layout: "fullscreen",
      prevLayout: "overlay",
    });
    expect(html.getAttribute("data-ask")).toBe("fullscreen");

    askStore.toggle();
    expect(askStore.getState()).toMatchObject({
      open: false,
      layout: "overlay",
    });
    expect(html.hasAttribute("data-ask")).toBe(false);
    expect(html.style.getPropertyValue("--ask-w")).toBe("");
    expect(JSON.parse(sessionStorage.getItem(ASK_STORAGE_KEYS.ui)!)).toEqual({
      open: false,
      fullscreen: false,
    });
  });

  it("clamps the width to 360..min(720, half the viewport) and saves it", async () => {
    vi.useFakeTimers();
    askStore.open();
    askStore.setWidth(1000);
    expect(askStore.getState()).toMatchObject({
      width: 720,
      widthMin: 360,
      widthMax: 720,
    });
    setViewport(1300);
    expect(askStore.getState()).toMatchObject({ width: 650, widthMax: 650 });
    askStore.setWidth(100);
    expect(askStore.getState().width).toBe(360);
    askStore.setWidth(500);
    vi.advanceTimersByTime(250);
    expect(localStorage.getItem(ASK_STORAGE_KEYS.width)).toBe("500");
    expect(html.style.getPropertyValue("--ask-w")).toBe("500px");
    askStore.resetWidth();
    expect(askStore.getState().width).toBe(420);
    expect(localStorage.getItem(ASK_STORAGE_KEYS.width)).toBeNull();
  });

  it("restores the open panel and width from storage", () => {
    sessionStorage.setItem(ASK_STORAGE_KEYS.ui, JSON.stringify({ open: true }));
    localStorage.setItem(ASK_STORAGE_KEYS.width, "480");
    const { result } = renderHook(() => useAskState());
    expect(result.current).toMatchObject({
      hydrated: true,
      open: true,
      width: 480,
    });
    expect(html.getAttribute("data-ask")).toBe("docked");
  });
});

describe("prepaint script", () => {
  const run = () => new Function(DOCS_ASK_PREPAINT_SCRIPT)();

  it("docks before paint when the panel was left open on a wide screen", () => {
    sessionStorage.setItem(ASK_STORAGE_KEYS.ui, JSON.stringify({ open: true }));
    localStorage.setItem(ASK_STORAGE_KEYS.width, "900");
    run();
    expect(html.getAttribute("data-ask")).toBe("docked");
    expect(html.style.getPropertyValue("--ask-w")).toBe("720px");
  });

  it("does nothing when closed, full screen or narrow", () => {
    run();
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.ui,
      JSON.stringify({ open: true, fullscreen: true }),
    );
    run();
    sessionStorage.setItem(ASK_STORAGE_KEYS.ui, JSON.stringify({ open: true }));
    Object.defineProperty(window, "innerWidth", {
      value: 1200,
      configurable: true,
    });
    run();
    expect(html.hasAttribute("data-ask")).toBe(false);
  });
});

describe("prerendering", () => {
  afterEach(() => {
    Object.defineProperty(document, "prerendering", {
      value: false,
      configurable: true,
    });
  });

  it("waits for activation before reading storage or touching <html>", () => {
    Object.defineProperty(document, "prerendering", {
      value: true,
      configurable: true,
    });
    sessionStorage.setItem(ASK_STORAGE_KEYS.ui, JSON.stringify({ open: true }));
    html.setAttribute("data-ask", "docked");
    const listener = vi.fn();
    const unsubscribe = askStore.subscribe(listener);
    expect(askStore.getState()).toMatchObject({ hydrated: false, open: false });
    expect(html.getAttribute("data-ask")).toBe("docked");
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(document, "prerendering", {
      value: false,
      configurable: true,
    });
    document.dispatchEvent(new Event("prerenderingchange"));
    expect(askStore.getState()).toMatchObject({ hydrated: true, open: true });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe("conversation", () => {
  it("streams an answer, attaching an early visual and keeping numeric ids", async () => {
    const stream = controllableStream();
    chatQueue.push(stream.response);
    const result = askStore.send("What is a PDA?");
    expect(result).toEqual({ ok: true, queued: false });
    expect(askStore.getState().busy).toBe(true);
    expect(lastAssistant()).toMatchObject({
      state: "pending",
      status: "preparing",
    });

    stream.send("status", { stage: "searching_docs" });
    await vi.waitFor(() => expect(lastAssistant().status).toBe("searching"));
    stream.send("delta", { text: "### Summary response\nA PDA" });
    await vi.waitFor(() =>
      expect(lastAssistant()).toMatchObject({
        state: "streaming",
        status: "writing",
      }),
    );
    stream.send("ui_status", { stage: "building_visual" });
    await vi.waitFor(() => expect(lastAssistant().status).toBe("visual"));
    const ui = {
      version: "solana-docs-ui/v1",
      kind: "answer",
      components: [{ type: "answer_intro" }],
    };
    stream.send("ui_done", { generative_ui: ui });
    await vi.waitFor(() => expect(lastAssistant().ui).toEqual(ui));
    expect(lastAssistant().state).toBe("streaming");

    stream.send("done", {
      run_id: 101,
      conversation_id: 7,
      citations: [{ title: "PDA", url: "/docs/core/pda" }],
    });
    stream.end();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(lastAssistant()).toMatchObject({
      state: "done",
      status: undefined,
      text: "### Summary response\nA PDA",
      runId: "101",
      citations: [{ title: "PDA", url: "/developers/docs/core/pda" }],
      ui,
    });
    expect(askStore.getState().conversationId).toBe("7");
    expect(chatBodies()[0]).toMatchObject({ message: "What is a PDA?" });
    expect(chatBodies()[0]).not.toHaveProperty("conversation_id");
  });

  it("sends follow-ups with the conversation id", async () => {
    chatQueue.push(finished("First."), finished("Second."));
    askStore.send("First?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.send("Second?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(chatBodies()[1]).toMatchObject({
      conversation_id: "7",
      message: "Second?",
    });
  });

  it("sends the last finished turns, cut to size, as history", async () => {
    chatQueue.push(
      finished("A".repeat(2_000)),
      finished("Second answer."),
      finished("Third answer."),
    );
    askStore.send("Q".repeat(1_200));
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.send("Second?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.send("Third?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));

    const [first, second, third] = chatBodies();
    expect(first).not.toHaveProperty("history");
    expect(second!.history).toEqual([
      { role: "user", content: `${"Q".repeat(999)}…` },
      { role: "assistant", content: `${"A".repeat(1_499)}…` },
    ]);
    expect(third!.history).toEqual([
      ...(second!.history as unknown[]),
      { role: "user", content: "Second?" },
      { role: "assistant", content: "Second answer." },
    ]);
  });

  it("leaves failed and empty answers out of the history", async () => {
    chatQueue.push(
      Response.json({ error: "rate_limited" }, { status: 429 }),
      finished("Answer."),
    );
    askStore.send("First?");
    await vi.waitFor(() => expect(lastAssistant().state).toBe("error"));
    askStore.send("Second?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(chatBodies()[1]).not.toHaveProperty("history");
  });

  it("queues a question that arrives while an answer streams", async () => {
    const first = controllableStream();
    chatQueue.push(first.response, finished("Second answer."));
    askStore.send("First?");
    expect(askStore.send("Second?")).toEqual({ ok: true, queued: true });
    expect(askStore.getState().queued).toBe(1);

    first.send("delta", { text: "First answer." });
    first.send("done", { run_id: 1, conversation_id: 2 });
    first.end();
    await vi.waitFor(() =>
      expect(askStore.getState().messages).toHaveLength(4),
    );
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(askStore.getState().queued).toBe(0);
    expect(lastAssistant()).toMatchObject({
      state: "done",
      text: "Second answer.",
    });
  });

  it("stops an answer and keeps what arrived", async () => {
    const stream = controllableStream();
    chatQueue.push(stream.response);
    askStore.send("Long question?");
    stream.send("delta", { text: "Partial" });
    await vi.waitFor(() => expect(lastAssistant().text).toBe("Partial"));
    askStore.stop();
    expect(askStore.getState().busy).toBe(false);
    expect(lastAssistant()).toMatchObject({
      state: "stopped",
      text: "Partial",
    });
    stream.send("delta", { text: " more" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastAssistant().text).toBe("Partial");
  });

  it("marks a truncated stream as incomplete, keeping the partial text", async () => {
    const stream = controllableStream();
    chatQueue.push(stream.response);
    askStore.send("Question?");
    stream.send("delta", { text: "Partial" });
    stream.end();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(lastAssistant()).toMatchObject({
      state: "error",
      error: "incomplete",
      text: "Partial",
    });
  });

  it("maps request failures to error kinds", async () => {
    chatQueue.push(Response.json({ error: "rate_limited" }, { status: 429 }));
    askStore.send("Question?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(lastAssistant()).toMatchObject({
      state: "error",
      error: "rateLimited",
    });
  });

  it("re-asks the latest question in place, skipping the cache", async () => {
    chatQueue.push(finished("One."), finished("Two."));
    askStore.send("Same?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    const answerId = lastAssistant().id;
    askStore.retry(answerId);
    await vi.waitFor(() => expect(lastAssistant().text).toBe("Two."));
    expect(askStore.getState().messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(chatBodies()).toHaveLength(2);
    expect(chatBodies()[1]).not.toHaveProperty("conversation_id");
  });

  it("re-asks an older question as a new turn", async () => {
    chatQueue.push(finished("A1."), finished("A2."), finished("A1 again."));
    askStore.send("Q1?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    const firstAnswer = lastAssistant().id;
    askStore.send("Q2?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.retry(firstAnswer);
    await vi.waitFor(() => expect(lastAssistant().text).toBe("A1 again."));
    const texts = askStore.getState().messages.map((m) => m.text);
    expect(texts).toEqual(["Q1?", "A1.", "Q2?", "A2.", "Q1?", "A1 again."]);
  });

  it("caches first questions only, so a new chat answers a repeat at once", async () => {
    chatQueue.push(finished("Cached."));
    askStore.send("What is rent?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.reset();
    askStore.send("what is rent?");
    await vi.waitFor(() => expect(lastAssistant().state).toBe("done"));
    expect(lastAssistant()).toMatchObject({ text: "Cached.", runId: "101" });
    expect(askStore.getState().conversationId).toBe("7");
    expect(chatBodies()).toHaveLength(1);
  });

  it("rates answers with a run id once per choice", async () => {
    chatQueue.push(finished("Answer."));
    askStore.send("Q?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    const id = lastAssistant().id;
    askStore.rate(id, "up");
    askStore.rate(id, "up");
    expect(lastAssistant().rating).toBe("up");
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith("/feedback"),
        ),
      ).toHaveLength(1),
    );
  });

  it("resets to an empty conversation", async () => {
    chatQueue.push(finished("Answer."));
    askStore.send("Q?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    const before = askStore.getState().focusRequest;
    askStore.reset();
    expect(askStore.getState()).toMatchObject({
      messages: [],
      conversationId: null,
      busy: false,
      focusRequest: before + 1,
    });
  });

  it("rejects empty and over-long questions", () => {
    expect(askStore.send("   ")).toEqual({ ok: false, reason: "empty" });
    expect(askStore.send("x".repeat(4001))).toEqual({
      ok: false,
      reason: "tooLong",
    });
    expect(askStore.getState().messages).toEqual([]);
  });

  it("sends the composer draft and clears it", async () => {
    chatQueue.push(finished("Answer."));
    askStore.setComposerDraft("From the composer");
    expect(askStore.submitComposer()).toEqual({ ok: true, queued: false });
    expect(askStore.getState().composerDraft).toBe("");
    expect(askStore.getState().messages[0]).toMatchObject({
      role: "user",
      text: "From the composer",
    });
  });
});

describe("entry points", () => {
  function docsPage() {
    document.body.innerHTML =
      '<div id="content" data-page-title="Accounts" data-page-href="/developers/docs/core/accounts"></div>';
  }

  it("asks about code with the page title, cut to 3,500 characters", async () => {
    docsPage();
    chatQueue.push(finished("Explained."));
    askStore.open({ code: `  ${"a".repeat(4000)}  ` });
    expect(askStore.getState().open).toBe(true);
    const sent = askStore.getState().messages[0];
    expect(sent?.text).toBe(
      `Explain this code from Accounts:\n\n\`\`\`\n${"a".repeat(3500)}\n\`\`\``,
    );
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
  });

  it("uses localized prompts", () => {
    askStore.setPrompts({ explainCode: (title) => `Explique (${title}) :` });
    chatQueue.push(finished("OK."));
    document.title = "Doc";
    askStore.open("let x;");
    expect(askStore.getState().messages[0]?.text).toBe(
      "Explique (Doc) :\n\n```\nlet x;\n```",
    );
  });

  it("attaches this page without sending, then prefixes the next question", async () => {
    docsPage();
    const before = askStore.getState().focusRequest;
    askStore.open({ aboutPage: true });
    expect(askStore.getState()).toMatchObject({
      open: true,
      messages: [],
      pageContext: {
        title: "Accounts",
        url: "https://solana.com/developers/docs/core/accounts",
      },
      focusRequest: before + 1,
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/chat")),
    ).toBe(false);

    chatQueue.push(finished("About accounts."));
    askStore.send("What is rent here?");
    expect(askStore.getState().pageContext).toBeNull();
    expect(askStore.getState().messages[0]).toMatchObject({
      text: "What is rent here?",
      pageContext: { title: "Accounts" },
    });
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(1));
    expect(chatBodies()[0]).toMatchObject({
      message:
        "Question about the docs page “Accounts” (https://solana.com/developers/docs/core/accounts):\n\nWhat is rent here?",
      page_url: "https://solana.com/developers/docs/core/accounts",
      page_title: "Accounts",
    });
  });

  it("routes openAskAi events and [data-docs-ask-open] clicks", async () => {
    const disconnect = connectAskAiEvents();
    chatQueue.push(finished("Answer."));
    openAskAi({ question: "How do fees work?" });
    expect(askStore.getState().messages[0]).toMatchObject({
      text: "How do fees work?",
    });
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));

    askStore.close();
    docsPage();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<button data-docs-ask-open="page"><span>✨</span></button>',
    );
    document
      .querySelector("button span")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(askStore.getState()).toMatchObject({
      open: true,
      pageContext: { title: "Accounts" },
    });
    disconnect();
  });
});

describe("persistence", () => {
  it("saves the thread and restores it, marking interrupted answers incomplete", async () => {
    chatQueue.push(finished("Saved answer."));
    askStore.send("Saved question?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    const stream = controllableStream();
    chatQueue.push(stream.response);
    askStore.send("Interrupted?");
    stream.send("delta", { text: "Half" });
    await vi.waitFor(() => expect(lastAssistant().text).toBe("Half"));
    window.dispatchEvent(new Event("pagehide"));

    const saved = JSON.parse(sessionStorage.getItem(ASK_STORAGE_KEYS.thread)!);
    expect(saved.conversationId).toBe("7");
    expect(saved.messages).toHaveLength(4);

    // A reload: fresh module state, same storage.
    resetAskStoreForTests();
    const { result } = renderHook(() =>
      useAskSelector((state) => state.messages),
    );
    expect(result.current.map((m) => m.text)).toEqual([
      "Saved question?",
      "Saved answer.",
      "Interrupted?",
      "Half",
    ]);
    expect(result.current[3]).toMatchObject({
      state: "error",
      error: "incomplete",
    });
    expect(askStore.getState().conversationId).toBe("7");
    act(() => askStore.reset());
    expect(
      JSON.parse(sessionStorage.getItem(ASK_STORAGE_KEYS.thread)!).messages,
    ).toEqual([]);
  });

  it("ignores malformed stored messages", () => {
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.thread,
      JSON.stringify({
        messages: [
          { id: "1", role: "user", text: "Kept" },
          {
            id: "2",
            role: "assistant",
            state: "done",
            text: "Kept too",
            ui: { bad: true },
            runId: 5,
          },
          { role: "user", text: "No id" },
          { id: "3", role: "system", text: "Wrong role" },
        ],
        conversationId: 9,
      }),
    );
    askStore.subscribe(() => undefined);
    expect(askStore.getState().messages).toEqual([
      { id: "1", role: "user", text: "Kept" },
      {
        id: "2",
        role: "assistant",
        state: "done",
        text: "Kept too",
        citations: [],
        codeFollowups: null,
        runId: "5",
      },
    ]);
    expect(askStore.getState().conversationId).toBe("9");
  });
});
