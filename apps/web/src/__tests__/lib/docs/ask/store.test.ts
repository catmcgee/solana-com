import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAskAi } from "@/lib/docs/ask-ai";
import { clearAskSession } from "@/lib/docs/ask/client";
import {
  ASK_PREPAINT_FULLSCREEN_TIMEOUT_MS,
  ASK_STORAGE_KEYS,
  DOCS_ASK_PREPAINT_SCRIPT,
} from "@/lib/docs/ask/config";
import { ASK_HANDOFF_TTL_MS, isThreadId } from "@/lib/docs/ask/handoff";
import {
  askStore,
  connectAskAiEvents,
  resetAskStoreForTests,
  type AskAssistantMessage,
} from "@/lib/docs/ask/store";
import { useAskSelector, useAskState } from "@/lib/docs/ask/use-ask";
import { AGENT_DONE, AGENT_ERRORS, AGENT_VISUAL } from "./agent-contract";

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
  const setPrerendering = (value: boolean) =>
    Object.defineProperty(document, "prerendering", {
      value,
      configurable: true,
    });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    setPrerendering(false);
  });

  it("docks before paint when the panel was left open on a wide screen", () => {
    sessionStorage.setItem(ASK_STORAGE_KEYS.ui, JSON.stringify({ open: true }));
    localStorage.setItem(ASK_STORAGE_KEYS.width, "900");
    run();
    expect(html.getAttribute("data-ask")).toBe("docked");
    expect(html.style.getPropertyValue("--ask-w")).toBe("720px");
  });

  it("does nothing when closed or narrow", () => {
    run();
    window.history.replaceState(null, "", "/developers?ask=docked");
    run();
    sessionStorage.setItem(ASK_STORAGE_KEYS.ui, JSON.stringify({ open: true }));
    Object.defineProperty(window, "innerWidth", {
      value: 1200,
      configurable: true,
    });
    run();
    expect(html.hasAttribute("data-ask")).toBe(false);
  });

  it("hides the page for a full-screen link at any width, whatever was stored", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 390,
      configurable: true,
    });
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.ui,
      JSON.stringify({ open: false }),
    );
    window.history.replaceState(
      null,
      "",
      "/developers/docs/core/accounts?x=1&ask=full&askThread=abc#rent",
    );
    run();
    expect(html.getAttribute("data-ask")).toBe("fullscreen");
    expect(html.style.getPropertyValue("--ask-w")).toBe("");
  });

  it("hides the page for a panel left full screen, except while prerendering", () => {
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.ui,
      JSON.stringify({ open: true, fullscreen: true }),
    );
    // This tab's storage may be stale in a prerender: the store decides.
    setPrerendering(true);
    run();
    expect(html.hasAttribute("data-ask")).toBe(false);
    // The link itself is not stale.
    window.history.replaceState(null, "", "/developers?ask=full");
    run();
    expect(html.getAttribute("data-ask")).toBe("fullscreen");
    html.removeAttribute("data-ask");
    window.history.replaceState(null, "", "/developers");
    setPrerendering(false);
    run();
    expect(html.getAttribute("data-ask")).toBe("fullscreen");
  });

  it("shows the page again if the full-screen panel never mounts", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/developers?ask=full");
    run();
    vi.advanceTimersByTime(ASK_PREPAINT_FULLSCREEN_TIMEOUT_MS - 1);
    expect(html.getAttribute("data-ask")).toBe("fullscreen");
    vi.advanceTimersByTime(1);
    expect(html.hasAttribute("data-ask")).toBe(false);

    // Mounted: the store owns the attribute from then on.
    run();
    const panel = document.createElement("div");
    panel.setAttribute("data-ask-panel", "");
    document.body.appendChild(panel);
    vi.advanceTimersByTime(ASK_PREPAINT_FULLSCREEN_TIMEOUT_MS);
    expect(html.getAttribute("data-ask")).toBe("fullscreen");
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
    chatQueue.push(
      finished("Cached.", {
        suggested_followups: AGENT_DONE.suggested_followups,
      }),
      finished("Follow-up."),
    );
    askStore.send("What is rent?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.reset();
    askStore.send("what is rent?");
    await vi.waitFor(() => expect(lastAssistant().state).toBe("done"));
    expect(lastAssistant()).toMatchObject({
      text: "Cached.",
      runId: "101",
      suggestedFollowups: { prompt: "Want to keep going? Try one of these:" },
    });
    // The replay doesn't join the first thread's agent conversation.
    expect(askStore.getState().conversationId).toBeNull();
    expect(chatBodies()).toHaveLength(1);
    askStore.send("And in Rust?");
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(2));
    expect(chatBodies()[1]).not.toHaveProperty("conversation_id");
  });

  it("moves the status row forward only, through the agent's stages", async () => {
    const stream = controllableStream();
    chatQueue.push(stream.response);
    askStore.send("What is a PDA?");
    stream.send("status", { stage: "accepted" });
    stream.send("status", { stage: "searching_docs" });
    await vi.waitFor(() => expect(lastAssistant().status).toBe("searching"));
    stream.send("status", { stage: "reading_doc", tool: "read_doc" });
    stream.send("answer_status", { stage: "building_plan" });
    stream.send("status", { stage: "starting" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastAssistant().status).toBe("searching");
    stream.send("answer_status", { stage: "rendering_template_answer" });
    await vi.waitFor(() => expect(lastAssistant().status).toBe("writing"));
    stream.send("delta", { text: "A PDA" });
    stream.send("status", { stage: "using_tool" });
    await vi.waitFor(() => expect(lastAssistant().text).toBe("A PDA"));
    expect(lastAssistant().status).toBe("writing");
    stream.end();
  });

  it("takes back a visual the agent withdraws, and keeps it out of the answer", async () => {
    const stream = controllableStream();
    chatQueue.push(stream.response);
    askStore.send("What is a PDA?");
    stream.send("delta", { text: "Not enough cited documentation." });
    stream.send("ui_status", { stage: "building_visual_answer" });
    stream.send("ui_done", { generative_ui: AGENT_VISUAL, cached: false });
    await vi.waitFor(() => expect(lastAssistant().ui).toEqual(AGENT_VISUAL));
    stream.send("ui_done", { generative_ui: null, discarded: true });
    await vi.waitFor(() => expect(lastAssistant().ui).toBeUndefined());
    expect(lastAssistant().status).toBe("writing");
    stream.send("done", { run_id: 1, conversation_id: 2, generative_ui: null });
    stream.end();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(lastAssistant()).not.toHaveProperty("ui");
  });

  it("clears the visual status when no visual comes", async () => {
    const stream = controllableStream();
    chatQueue.push(stream.response);
    askStore.send("What is a PDA?");
    stream.send("delta", { text: "Text." });
    stream.send("ui_status", { stage: "building_visual_answer" });
    await vi.waitFor(() => expect(lastAssistant().status).toBe("visual"));
    stream.send("ui_done", { generative_ui: null, cached: false });
    await vi.waitFor(() => expect(lastAssistant().status).toBe("writing"));
    stream.end();
  });

  it("starts a new agent conversation when the old one is gone", async () => {
    chatQueue.push(
      finished("First."),
      Response.json(AGENT_ERRORS.conversationNotFound.body, { status: 404 }),
      finished("Second.", { conversation_id: 9 }),
    );
    askStore.send("First?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(askStore.getState().conversationId).toBe("7");
    askStore.send("Second?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(chatBodies().map((body) => body.conversation_id)).toEqual([
      undefined,
      "7",
      undefined,
    ]);
    expect(lastAssistant()).toMatchObject({ state: "done", text: "Second." });
    expect(askStore.getState().conversationId).toBe("9");
  });

  it("never retries with a conversation found stale", async () => {
    chatQueue.push(
      finished("First."),
      Response.json(AGENT_ERRORS.conversationNotFound.body, { status: 404 }),
      Response.json(AGENT_ERRORS.budget.body, { status: 503 }),
      finished("Retried."),
    );
    askStore.send("First?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.send("Second?");
    await vi.waitFor(() => expect(lastAssistant().state).toBe("error"));
    expect(lastAssistant().error).toBe("unavailable");
    expect(askStore.getState().conversationId).toBeNull();
    askStore.retry(lastAssistant().id);
    await vi.waitFor(() => expect(lastAssistant().text).toBe("Retried."));
    expect(chatBodies().map((body) => body.conversation_id)).toEqual([
      undefined,
      "7",
      undefined,
      undefined,
    ]);
  });

  it("keeps the agent's suggested follow-ups on the answer", async () => {
    chatQueue.push(
      finished("Answer.", {
        suggested_followups: AGENT_DONE.suggested_followups,
      }),
    );
    askStore.send("What is a PDA?");
    expect(lastAssistant().suggestedFollowups).toBeNull();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(lastAssistant().suggestedFollowups).toEqual({
      prompt: "Want to keep going? Try one of these:",
      items: AGENT_DONE.suggested_followups.buttons.map(
        ({ label, message }) => ({ label, message, kind: "ask" }),
      ),
    });
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

  it("asks about code, cut to 3,500 characters, showing the page title but sending only its URL", async () => {
    docsPage();
    chatQueue.push(finished("Explained."));
    askStore.open({ code: `  ${"a".repeat(4000)}  ` });
    expect(askStore.getState().open).toBe(true);
    const fenced = `\`\`\`\n${"a".repeat(3500)}\n\`\`\``;
    const question = askStore.getState().messages[0];
    expect(question).toMatchObject({
      text: `Explain this code from Accounts:\n\n${fenced}`,
      sent: `Explain this code:\n\n${fenced}`,
    });
    expect(question).not.toHaveProperty("pageContext");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    // The agent's router would turn "Accounts" into a canned answer; the
    // URL lets the answer read the page the code came from.
    expect(chatBodies()[0]!.message).toBe(`Explain this code:\n\n${fenced}`);
    expect(chatBodies()[0]).toMatchObject({
      page_url: "https://solana.com/developers/docs/core/accounts",
    });
    expect(chatBodies()[0]).not.toHaveProperty("page_title");
  });

  it("keeps a code block's language on the fence", async () => {
    docsPage();
    chatQueue.push(finished("Explained."));
    askStore.open({ code: "let x = 1;", language: "rust" });
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(chatBodies()[0]!.message).toBe(
      "Explain this code:\n\n```rust\nlet x = 1;\n```",
    );
  });

  it("sends a code question again without the title", async () => {
    docsPage();
    chatQueue.push(
      Response.json(AGENT_ERRORS.budget.body, { status: 503 }),
      finished("Explained."),
    );
    askStore.open({ code: "let x;" });
    await vi.waitFor(() => expect(lastAssistant().state).toBe("error"));
    askStore.retry(lastAssistant().id);
    await vi.waitFor(() => expect(lastAssistant().state).toBe("done"));
    expect(chatBodies().map((body) => body.message)).toEqual([
      "Explain this code:\n\n```\nlet x;\n```",
      "Explain this code:\n\n```\nlet x;\n```",
    ]);
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

  it("attaches this page without sending, then sends it beside the next question", async () => {
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
    // The question alone: the server builds any page prefix.
    expect(chatBodies()[0]).toEqual({
      session_token: "mock-token",
      message: "What is rent here?",
      page_url: "https://solana.com/developers/docs/core/accounts",
      page_title: "Accounts",
    });
  });

  it("keeps an earlier question's page in the history, and checks the length of what is sent", async () => {
    docsPage();
    chatQueue.push(finished("About accounts."), finished("Second."));
    askStore.open({ aboutPage: true });
    // 4,000 characters fit: the page no longer counts against the limit.
    expect(askStore.send("x".repeat(4000))).toEqual({
      ok: true,
      queued: false,
    });
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.send("And the fees?");
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(2));
    const asked = `Question about the docs page “Accounts” (https://solana.com/developers/docs/core/accounts):\n\n${"x".repeat(4000)}`;
    expect(chatBodies()[1]!.history).toEqual([
      { role: "user", content: `${asked.slice(0, 999)}…` },
      { role: "assistant", content: "About accounts." },
    ]);
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

describe("selected text", () => {
  const ACCOUNTS = {
    title: "Accounts",
    url: "https://solana.com/developers/docs/core/accounts",
  };
  function docsPage() {
    document.body.innerHTML =
      '<div id="content" data-page-title="Accounts" data-page-href="/developers/docs/core/accounts"></div>';
  }
  const chats = () =>
    fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/chat"));

  it("opens with the selection as a quote and focuses the composer, keeping the draft, never sending", () => {
    docsPage();
    askStore.setComposerDraft("Why?");
    const before = askStore.getState().focusRequest;
    askStore.open({
      selection: { text: "  Rent is   a\n\n  deposit,\tkept\u00a0back.  " },
    });
    expect(askStore.getState()).toMatchObject({
      open: true,
      composerDraft: "Why?",
      // Tidied: runs of spaces collapsed, a paragraph break kept as one
      // newline. Its page goes with it.
      composerQuote: {
        text: "Rent is a\ndeposit, kept back.",
        pageContext: ACCOUNTS,
      },
      // Not the page chip: the quote carries its page.
      pageContext: null,
      focusRequest: before + 1,
      messages: [],
    });
    expect(chats()).toHaveLength(0);
  });

  it("replaces an earlier quote", () => {
    askStore.open({ selection: { text: "First" } });
    askStore.open({ selection: { text: "Second" } });
    expect(askStore.getState().composerQuote).toEqual({ text: "Second" });
    // Removed from the composer.
    askStore.setComposerQuote(null);
    expect(askStore.getState().composerQuote).toBeNull();
  });

  it("ignores a selection of whitespace or a single character", () => {
    askStore.open({ selection: { text: " \n\t " } });
    askStore.open({ selection: { text: " x " } });
    expect(askStore.getState()).toMatchObject({
      open: true,
      composerQuote: null,
    });
  });

  it("cuts a long quote at a word, with an ellipsis", () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    askStore.open({ selection: { text: words } });
    const text = askStore.getState().composerQuote!.text;
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text).toMatch(/ word\d+…$/);
    expect(words.startsWith(text.slice(0, -1))).toBe(true);
    expect(words.charAt(text.length - 1)).toBe(" ");
  });

  it("sends the quote ahead of the question, with its page, and clears it", async () => {
    docsPage();
    chatQueue.push(finished("About rent."));
    askStore.open({
      selection: { text: "Rent is a deposit.\nIt comes back." },
    });
    askStore.setComposerDraft("  Why is it needed?  ");
    expect(askStore.submitComposer()).toEqual({ ok: true, queued: false });
    const sent = "> Rent is a deposit.\n> It comes back.\n\nWhy is it needed?";
    expect(askStore.getState()).toMatchObject({
      composerDraft: "",
      composerQuote: null,
    });
    // The bubble shows the words with the quote above them.
    expect(askStore.getState().messages[0]).toEqual({
      id: expect.any(String),
      role: "user",
      text: "Why is it needed?",
      pageContext: ACCOUNTS,
      sent,
      quote: { text: "Rent is a deposit.\nIt comes back." },
    });
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(1));
    expect(chatBodies()[0]).toEqual({
      session_token: "mock-token",
      message: sent,
      page_url: ACCOUNTS.url,
      page_title: "Accounts",
    });
  });

  it("asks the localized explainSelection without a question", async () => {
    askStore.setPrompts({ explainSelection: () => "Explique ça" });
    chatQueue.push(finished("Expliqué."));
    askStore.open({ selection: { text: "Rent is a deposit." } });
    expect(askStore.submitComposer()).toMatchObject({ ok: true });
    expect(askStore.getState().messages[0]).toMatchObject({
      text: "Explique ça",
      sent: "> Rent is a deposit.\n\nExplique ça",
    });
    // No quote and no words: nothing to send.
    expect(askStore.submitComposer()).toEqual({ ok: false, reason: "empty" });
  });

  it("keeps code as it is, fenced with its language (longer than its own fences)", async () => {
    chatQueue.push(finished("Explained."), finished("Again."));
    askStore.open({
      selection: {
        text: "\n  let x = 1;\n\n    y();\n\n",
        code: true,
        language: "rust",
      },
    });
    expect(askStore.getState().composerQuote).toEqual({
      text: "  let x = 1;\n\n    y();",
      code: true,
      language: "rust",
    });
    askStore.submitComposer();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(chatBodies()[0]!.message).toBe(
      "```rust\n  let x = 1;\n\n    y();\n```\n\nExplain this",
    );
    askStore.open({
      selection: { text: "md = `\n```\n`", code: true, language: "<b>" },
    });
    askStore.submitComposer();
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(2));
    expect(chatBodies()[1]!.message).toBe(
      "````\nmd = `\n```\n`\n````\n\nExplain this",
    );
  });

  it("counts the quote against the length limit, keeping both when refused", () => {
    askStore.open({ selection: { text: "q".repeat(1000) } });
    // "> " + 1,000 + "\n\n" + the question: 4,001 characters.
    askStore.setComposerDraft("x".repeat(2997));
    expect(askStore.submitComposer()).toEqual({
      ok: false,
      reason: "tooLong",
    });
    expect(askStore.getState()).toMatchObject({
      composerDraft: "x".repeat(2997),
      composerQuote: { text: "q".repeat(1000) },
      messages: [],
    });
    askStore.setComposerDraft("x".repeat(2996));
    expect(askStore.submitComposer()).toMatchObject({ ok: true });
  });

  it("sends the quote again on retry, and in the history", async () => {
    docsPage();
    chatQueue.push(
      Response.json(AGENT_ERRORS.budget.body, { status: 503 }),
      finished("About rent."),
      finished("Second."),
    );
    askStore.open({ selection: { text: "Rent is a deposit." } });
    askStore.setComposerDraft("Why?");
    askStore.submitComposer();
    await vi.waitFor(() => expect(lastAssistant().state).toBe("error"));
    askStore.retry(lastAssistant().id);
    await vi.waitFor(() => expect(lastAssistant().state).toBe("done"));
    askStore.send("And then?");
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(3));
    const sent = "> Rent is a deposit.\n\nWhy?";
    expect(chatBodies().map((body) => body.message)).toEqual([
      sent,
      sent,
      "And then?",
    ]);
    expect(chatBodies()[2]!.history).toEqual([
      {
        role: "user",
        content: `Question about the docs page “Accounts” (${ACCOUNTS.url}):\n\n${sent}`,
      },
      { role: "assistant", content: "About rent." },
    ]);
  });

  it("keeps a long quote's question in the history, cutting the quote instead", async () => {
    docsPage();
    chatQueue.push(finished("It expires."), finished("In Rust."));
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    askStore.open({ selection: { text: words } });
    askStore.setComposerDraft("Why does it expire?");
    askStore.submitComposer();
    await vi.waitFor(() => expect(lastAssistant().state).toBe("done"));
    // Sent whole: 1,200 characters of quote, then the question.
    expect(chatBodies()[0]!.message).toMatch(
      /^> word0 .{1150,}…\n\nWhy does it expire\?$/s,
    );
    askStore.send("Show me that in Rust");
    await vi.waitFor(() => expect(chatBodies()).toHaveLength(2));
    const [turn] = chatBodies()[1]!.history as Array<{ content: string }>;
    expect(turn!.content.length).toBeLessThanOrEqual(1000);
    expect(turn!.content).toMatch(
      /^Question about the docs page “Accounts” \(.+\):\n\n> word0 word1 .+…\n\nWhy does it expire\?$/s,
    );
  });

  it("clears the quote with New chat, and routes openAskAi selections", () => {
    const disconnect = connectAskAiEvents();
    openAskAi({ selection: { text: "Rent is a deposit." } });
    expect(askStore.getState()).toMatchObject({
      open: true,
      composerQuote: { text: "Rent is a deposit." },
    });
    askStore.reset();
    expect(askStore.getState().composerQuote).toBeNull();
    disconnect();
  });
});

describe("full-screen link", () => {
  const ACCOUNTS = {
    title: "Accounts",
    url: "https://solana.com/developers/docs/core/accounts",
  };
  const ID = "0123456789abcdef01234567";
  const HANDOFF = `${ASK_STORAGE_KEYS.handoff}${ID}`;
  const LINK = `/developers/docs/core/accounts?x=1&ask=full&askThread=${ID}#rent`;
  const handedOff = ({
    savedAt = Date.now(),
    finished = false,
    conversationId = "7",
  } = {}) =>
    JSON.stringify({
      v: 1,
      savedAt,
      messages: [
        {
          id: "u1",
          role: "user",
          text: "What is a PDA?",
          quote: { text: "A program derived address" },
        },
        {
          id: "a1",
          role: "assistant",
          state: "done",
          text: "An address with no key.",
          runId: 5,
        },
        { id: "u2", role: "user", text: "And rent?" },
        finished
          ? {
              id: "a2",
              role: "assistant",
              state: "done",
              text: "Rent is a deposit.",
              runId: 6,
            }
          : // Still streaming in the other tab.
            {
              id: "a2",
              role: "assistant",
              state: "streaming",
              status: "writing",
              text: "Rent is",
            },
      ],
      conversationId,
      pageContext: {
        title: "Accounts",
        url: "https://solana.com/developers/docs/core/accounts",
      },
      composerDraft: "Show me code",
      composerQuote: { text: "Rent is a deposit", pageContext: ACCOUNTS },
    });
  const ownThread = () =>
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.thread,
      JSON.stringify({
        messages: [{ id: "o1", role: "user", text: "This tab's own" }],
        conversationId: "3",
      }),
    );
  const here = () => `${location.pathname}${location.search}${location.hash}`;

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    Object.defineProperty(document, "prerendering", {
      value: false,
      configurable: true,
    });
  });

  it("opens full screen with the thread the link's tab left and cleans the URL", async () => {
    ownThread();
    localStorage.setItem(HANDOFF, handedOff());
    window.history.replaceState({ kept: true }, "", LINK);
    askStore.subscribe(() => undefined);

    const state = askStore.getState();
    expect(state).toMatchObject({
      hydrated: true,
      open: true,
      layout: "fullscreen",
      prevLayout: "docked",
      conversationId: "7",
      pageContext: {
        title: "Accounts",
        url: "https://solana.com/developers/docs/core/accounts",
      },
      composerDraft: "Show me code",
      // The quote waiting in the composer goes with it, and quotes asked.
      composerQuote: { text: "Rent is a deposit", pageContext: ACCOUNTS },
    });
    expect(state.messages[0]).toMatchObject({
      quote: { text: "A program derived address" },
    });
    expect(state.messages.map((m) => m.text)).toEqual([
      "What is a PDA?",
      "An address with no key.",
      "And rent?",
      "Rent is",
    ]);
    // The answer the other tab is still writing shows as still arriving
    // (see "waits for the answer…" below), not as broken.
    expect(lastAssistant()).toMatchObject({
      id: "a2",
      state: "streaming",
      status: "writing",
    });
    expect(lastAssistant().error).toBeUndefined();
    expect(state.busy).toBe(true);
    // The copy is this tab's own from now on.
    expect(isThreadId(state.threadId)).toBe(true);
    expect(state.threadId).not.toBe(ID);
    const saved = JSON.parse(sessionStorage.getItem(ASK_STORAGE_KEYS.thread)!);
    expect(saved).toMatchObject({
      conversationId: "7",
      threadId: state.threadId,
    });
    expect(saved.messages).toHaveLength(4);
    expect(JSON.parse(sessionStorage.getItem(ASK_STORAGE_KEYS.ui)!)).toEqual({
      open: true,
      fullscreen: true,
    });
    expect(html.getAttribute("data-ask")).toBe("fullscreen");

    await vi.waitFor(() =>
      expect(here()).toBe("/developers/docs/core/accounts?x=1#rent"),
    );
    expect(window.history.state).toBeNull();

    // Esc (Exit full screen) goes back to the docked panel.
    askStore.setFullscreen(false);
    expect(html.getAttribute("data-ask")).toBe("docked");
    expect(html.style.getPropertyValue("--ask-w")).toBe("420px");
  });

  it("opens full screen with this tab's own thread when the handoff is gone or expired", async () => {
    ownThread();
    localStorage.setItem(
      HANDOFF,
      handedOff({ savedAt: Date.now() - ASK_HANDOFF_TTL_MS - 1 }),
    );
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    expect(askStore.getState()).toMatchObject({
      layout: "fullscreen",
      conversationId: "3",
    });
    expect(askStore.getState().messages.map((m) => m.text)).toEqual([
      "This tab's own",
    ]);
    expect(localStorage.getItem(HANDOFF)).toBeNull();
    await vi.waitFor(() =>
      expect(here()).toBe("/developers/docs/core/accounts?x=1#rent"),
    );
  });

  it("opens full screen, empty, from a link without a thread", async () => {
    window.history.replaceState(null, "", "/ja/developers?ask=full");
    askStore.subscribe(() => undefined);
    expect(askStore.getState()).toMatchObject({
      layout: "fullscreen",
      messages: [],
    });
    await vi.waitFor(() => expect(here()).toBe("/ja/developers"));
  });

  it("waits for activation before taking a handoff or touching the URL", async () => {
    Object.defineProperty(document, "prerendering", {
      value: true,
      configurable: true,
    });
    localStorage.setItem(HANDOFF, handedOff());
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    askStore.prepareHandoff();
    expect(askStore.getState()).toMatchObject({ hydrated: false, open: false });
    expect(localStorage.getItem(HANDOFF)).not.toBeNull();
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith(ASK_STORAGE_KEYS.handoff),
      ),
    ).toEqual([HANDOFF]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(here()).toBe(LINK);

    Object.defineProperty(document, "prerendering", {
      value: false,
      configurable: true,
    });
    document.dispatchEvent(new Event("prerenderingchange"));
    expect(askStore.getState()).toMatchObject({
      hydrated: true,
      layout: "fullscreen",
      conversationId: "7",
    });
    expect(askStore.getState().messages).toHaveLength(4);
    await vi.waitFor(() =>
      expect(here()).toBe("/developers/docs/core/accounts?x=1#rent"),
    );
  });

  it("gives the thread to every tab opened from the link in time, then deletes it", () => {
    vi.useFakeTimers();
    localStorage.setItem(HANDOFF, handedOff({ finished: true }));
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    expect(askStore.getState().messages).toHaveLength(4);
    expect(askStore.getState().busy).toBe(false);
    // A second Ctrl-click's tab, loading a moment later.
    vi.advanceTimersByTime(250);
    resetAskStoreForTests();
    sessionStorage.clear();
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    expect(askStore.getState()).toMatchObject({
      layout: "fullscreen",
      conversationId: "7",
    });
    expect(askStore.getState().messages.map((m) => m.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ]);
    vi.advanceTimersByTime(14_999);
    expect(localStorage.getItem(HANDOFF)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(localStorage.getItem(HANDOFF)).toBeNull();
  });

  it("waits for the answer the link's tab was still writing, then takes it", async () => {
    localStorage.setItem(HANDOFF, handedOff({ conversationId: "" }));
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    expect(askStore.getState()).toMatchObject({
      busy: true,
      conversationId: null,
    });
    // Asked here meanwhile: it waits rather than going out in a
    // conversation the other tab is still answering in.
    expect(askStore.send("Show me code")).toEqual({ ok: true, queued: true });
    expect(chatBodies()).toHaveLength(0);
    const changed = (key: string, newValue: string | null) =>
      window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
    changed("docs-ask:other", "x");
    changed(HANDOFF, handedOff());
    changed(HANDOFF, null);
    expect(lastAssistant()).toMatchObject({ id: "a2", state: "streaming" });

    chatQueue.push(finished("Here is code."));
    changed(HANDOFF, handedOff({ finished: true, conversationId: "8" }));
    expect(askStore.getState().messages[3]).toMatchObject({
      id: "a2",
      state: "done",
      text: "Rent is a deposit.",
      runId: "6",
    });
    expect(askStore.getState().conversationId).toBe("8");
    // Then the question asked here, in the same conversation.
    await vi.waitFor(() => expect(lastAssistant().text).toBe("Here is code."));
    expect(chatBodies()).toEqual([
      expect.objectContaining({
        message: "Show me code",
        conversation_id: "8",
      }),
    ]);
    // Already ended here: a later snapshot changes nothing.
    changed(HANDOFF, handedOff({ finished: true, conversationId: "9" }));
    expect(askStore.getState().conversationId).toBe("7");
  });

  it("stops waiting on Stop, and when the handoff expires", () => {
    vi.useFakeTimers();
    localStorage.setItem(HANDOFF, handedOff());
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    askStore.stop();
    expect(lastAssistant()).toMatchObject({ id: "a2", state: "stopped" });
    expect(askStore.getState().busy).toBe(false);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: HANDOFF,
        newValue: handedOff({ finished: true }),
      }),
    );
    expect(lastAssistant()).toMatchObject({ id: "a2", state: "stopped" });

    // The link's tab never says (it crashed): incomplete at the expiry.
    resetAskStoreForTests();
    sessionStorage.clear();
    localStorage.setItem(
      HANDOFF,
      handedOff({ savedAt: Date.now() - ASK_HANDOFF_TTL_MS + 1_000 }),
    );
    window.history.replaceState(null, "", LINK);
    askStore.subscribe(() => undefined);
    expect(askStore.getState().busy).toBe(true);
    vi.advanceTimersByTime(999);
    expect(lastAssistant().state).toBe("streaming");
    vi.advanceTimersByTime(1);
    expect(lastAssistant()).toMatchObject({
      id: "a2",
      state: "error",
      error: "incomplete",
      text: "Rent is",
    });
    expect(askStore.getState().busy).toBe(false);
  });

  it("hands a streaming answer over again as it ends: done, New chat or the page going", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const handedOver = (threadId: string) =>
      JSON.parse(
        localStorage.getItem(`${ASK_STORAGE_KEYS.handoff}${threadId}`) ??
          "null",
      );
    const streaming = async (question: string) => {
      const stream = controllableStream();
      chatQueue.push(stream.response);
      askStore.send(question);
      stream.send("delta", { text: "Rent is" });
      await vi.waitFor(() => expect(lastAssistant().text).toBe("Rent is"));
      return stream;
    };

    // Ctrl-click mid-answer, then the answer finishes.
    const first = await streaming("What is rent?");
    const { threadId } = askStore.getState();
    askStore.prepareHandoff();
    expect(handedOver(threadId).messages.at(-1)).toMatchObject({
      state: "streaming",
      text: "Rent is",
    });
    first.send("delta", { text: " a deposit." });
    first.send("done", { run_id: 1, conversation_id: 9 });
    first.end();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(handedOver(threadId)).toMatchObject({
      conversationId: "9",
      messages: [
        { role: "user", text: "What is rent?" },
        { role: "assistant", state: "done", text: "Rent is a deposit." },
      ],
    });
    // Left for the tab to take (it deletes it).
    vi.advanceTimersByTime(20_000);
    expect(handedOver(threadId)).not.toBeNull();

    // A plain click mid-answer: that end is dropped after the grace period.
    const second = await streaming("And fees?");
    askStore.prepareHandoff();
    askStore.releaseHandoff();
    second.send("done", { run_id: 2, conversation_id: 9 });
    second.end();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    expect(handedOver(threadId).messages.at(-1)).toMatchObject({
      state: "done",
    });
    vi.advanceTimersByTime(15_000);
    expect(handedOver(threadId)).toBeNull();

    // New chat mid-answer: stopped.
    await streaming("And PDAs?");
    askStore.prepareHandoff();
    askStore.reset();
    expect(handedOver(threadId).messages.at(-1)).toMatchObject({
      state: "stopped",
      text: "Rent is",
    });

    // The page going mid-answer: incomplete there; this tab is unchanged.
    await streaming("And mints?");
    const next = askStore.getState().threadId;
    askStore.prepareHandoff();
    window.dispatchEvent(new Event("pagehide"));
    expect(handedOver(next).messages.at(-1)).toMatchObject({
      state: "error",
      error: "incomplete",
    });
    expect(lastAssistant().state).toBe("streaming");
  });

  it("leaves the thread for a new tab, never the session token, pruning expired ones", async () => {
    const expired = `${ASK_STORAGE_KEYS.handoff}eeeeeeeeeeeeeeee`;
    localStorage.setItem(
      expired,
      JSON.stringify({ v: 1, savedAt: Date.now() - ASK_HANDOFF_TTL_MS - 1 }),
    );
    chatQueue.push(finished("A PDA is an address."));
    askStore.send("What is a PDA?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    askStore.setComposerDraft("And rent?");
    askStore.setPageContext({
      title: "Accounts",
      url: "https://solana.com/developers/docs/core/accounts",
    });
    askStore.setComposerQuote({ text: "Rent is a deposit" });
    const { threadId } = askStore.getState();
    expect(isThreadId(threadId)).toBe(true);

    askStore.prepareHandoff();
    const raw = localStorage.getItem(`${ASK_STORAGE_KEYS.handoff}${threadId}`)!;
    expect(JSON.parse(raw)).toMatchObject({
      v: 1,
      savedAt: expect.any(Number),
      conversationId: "7",
      pageContext: { title: "Accounts" },
      composerDraft: "And rent?",
      composerQuote: { text: "Rent is a deposit" },
      messages: [
        { role: "user", text: "What is a PDA?" },
        { role: "assistant", state: "done", text: "A PDA is an address." },
      ],
    });
    expect(raw).not.toContain("mock-token");
    expect(localStorage.getItem(expired)).toBeNull();
    // This tab is unchanged.
    expect(askStore.getState()).toMatchObject({ open: false, threadId });
  });

  it("drops a plain click's handoff after a grace period, unless replaced", () => {
    askStore.subscribe(() => undefined);
    vi.useFakeTimers();
    const key = `${ASK_STORAGE_KEYS.handoff}${askStore.getState().threadId}`;
    askStore.prepareHandoff();
    askStore.releaseHandoff();
    vi.advanceTimersByTime(14_000);
    // A tab a middle click opened just before may still want it.
    expect(localStorage.getItem(key)).not.toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(localStorage.getItem(key)).toBeNull();

    askStore.prepareHandoff();
    askStore.releaseHandoff();
    vi.advanceTimersByTime(1);
    askStore.prepareHandoff();
    vi.advanceTimersByTime(20_000);
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it("keeps the thread id across reloads; New chat starts a new one", async () => {
    chatQueue.push(finished("Saved."));
    askStore.send("Saved?");
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));
    const { threadId } = askStore.getState();
    resetAskStoreForTests();
    askStore.subscribe(() => undefined);
    expect(askStore.getState().threadId).toBe(threadId);
    askStore.reset();
    expect(askStore.getState().threadId).not.toBe(threadId);
    expect(isThreadId(askStore.getState().threadId)).toBe(true);
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
        suggestedFollowups: null,
        runId: "5",
      },
    ]);
    expect(askStore.getState().conversationId).toBe("9");
  });

  it("keeps a question's quote across a reload; threads from before quotes still load", async () => {
    document.body.innerHTML =
      '<div id="content" data-page-title="Accounts" data-page-href="/developers/docs/core/accounts"></div>';
    chatQueue.push(finished("Quoted answer."));
    askStore.open({ selection: { text: "Rent is a deposit" } });
    askStore.submitComposer();
    await vi.waitFor(() => expect(askStore.getState().busy).toBe(false));

    resetAskStoreForTests();
    askStore.subscribe(() => undefined);
    expect(askStore.getState().messages[0]).toEqual({
      id: expect.any(String),
      role: "user",
      text: "Explain this",
      pageContext: {
        title: "Accounts",
        url: "https://solana.com/developers/docs/core/accounts",
      },
      sent: "> Rent is a deposit\n\nExplain this",
      quote: { text: "Rent is a deposit" },
    });

    resetAskStoreForTests();
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.thread,
      JSON.stringify({
        messages: [
          // Saved before quotes existed.
          { id: "1", role: "user", text: "Old question" },
          { id: "2", role: "user", text: "Bad quote", quote: { text: 7 } },
          {
            id: "3",
            role: "user",
            text: "Code",
            quote: { text: "let x;", code: true, language: "rust" },
          },
        ],
      }),
    );
    askStore.subscribe(() => undefined);
    expect(askStore.getState().messages).toEqual([
      { id: "1", role: "user", text: "Old question" },
      { id: "2", role: "user", text: "Bad quote" },
      {
        id: "3",
        role: "user",
        text: "Code",
        quote: { text: "let x;", code: true, language: "rust" },
      },
    ]);
  });

  it("restores the code question as sent, follow-ups and a busy error", () => {
    sessionStorage.setItem(
      ASK_STORAGE_KEYS.thread,
      JSON.stringify({
        messages: [
          {
            id: "1",
            role: "user",
            text: "Explain this code from Accounts:\n\n```\nx\n```",
            sent: "Explain this code:\n\n```\nx\n```",
          },
          {
            id: "2",
            role: "assistant",
            state: "done",
            text: "Answer.",
            suggestedFollowups: {
              prompt: "Next?",
              items: [{ label: "Rent", message: "What is rent?", kind: "ask" }],
            },
            runId: 5,
          },
          { id: "3", role: "user", text: "Again?" },
          {
            id: "4",
            role: "assistant",
            state: "error",
            error: "busy",
            text: "",
          },
        ],
      }),
    );
    askStore.subscribe(() => undefined);
    const [question, answer, , failed] = askStore.getState().messages;
    expect(question).toMatchObject({
      sent: "Explain this code:\n\n```\nx\n```",
    });
    expect(answer).toMatchObject({
      suggestedFollowups: {
        prompt: "Next?",
        items: [{ label: "Rent", message: "What is rent?", kind: "ask" }],
      },
    });
    expect(failed).toMatchObject({ state: "error", error: "busy" });
  });
});
