import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAskSession,
  getAskRun,
  sendFeedback,
  streamChat,
  warmAskSession,
  type AskChatHandlers,
} from "@/lib/docs/ask/client";
import { ASK_STORAGE_KEYS } from "@/lib/docs/ask/config";
import { createTokenGenerativeUiFixture } from "@/lib/docs/ask/fixtures/create-token";
import type { AskDonePayload } from "@/lib/docs/ask/protocol";

// Ported from Bri's ui-chrome ask-solana-api.test.ts, plus a case for
// every defect fixed in the port.

type FetchArgs = Parameters<typeof fetch>;

function urlOf(input: FetchArgs[0]): string {
  return typeof input === "string" || input instanceof URL
    ? String(input)
    : input.url;
}

function sse(events: string[], { trailing = true } = {}): Response {
  return new Response(`${events.join("\n\n")}${trailing ? "\n\n" : ""}`, {
    headers: { "content-type": "text/event-stream" },
  });
}

/** fetch stub: /session mints tokens, /chat answers from `chat` in order. */
function stubFetch(
  chat: Array<Response | (() => Response | Promise<Response>)>,
) {
  let sessions = 0;
  const fetchMock = vi.fn(async (...[input]: FetchArgs) => {
    const url = urlOf(input);
    if (url.endsWith("/session")) {
      sessions += 1;
      return Response.json({ session_token: `token-${sessions}` });
    }
    if (url.endsWith("/chat")) {
      const next = chat.shift();
      if (!next) throw new Error("unexpected chat request");
      return typeof next === "function" ? next() : next;
    }
    if (url.endsWith("/feedback")) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function chatBodies(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls
    .filter(([input]) => urlOf(input).endsWith("/chat"))
    .map(
      ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
}

function collect() {
  const result = {
    text: "",
    statuses: [] as string[],
    uiStatuses: [] as string[],
    visuals: [] as unknown[],
    done: null as AskDonePayload | null,
    errors: [] as string[],
  };
  const handlers: AskChatHandlers = {
    onStatus: (stage) => result.statuses.push(stage),
    onDelta: (text) => {
      result.text += text;
    },
    onUiStatus: (stage) => result.uiStatuses.push(stage),
    onGenerativeUi: (ui) => result.visuals.push(ui),
    onDone: (payload) => {
      result.done = payload;
    },
    onError: (kind) => result.errors.push(kind),
  };
  return { result, handlers };
}

function ask(
  handlers: AskChatHandlers,
  overrides: Partial<Parameters<typeof streamChat>[0]> = {},
) {
  return streamChat(
    {
      message: "What is a PDA?",
      conversationId: null,
      signal: new AbortController().signal,
      ...overrides,
    },
    handlers,
  );
}

const DONE = `event: done\ndata: ${JSON.stringify({
  run_id: 101,
  conversation_id: 7,
  citations: [{ title: "PDA", url: "/docs/core/pda" }],
})}`;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearAskSession();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("reuses an in-flight warm-up session for the first question", async () => {
    let resolveSession: (response: Response) => void = () => {};
    let sessionRequests = 0;
    const fetchMock = vi.fn(async (...[input]: FetchArgs) => {
      if (urlOf(input).endsWith("/session")) {
        sessionRequests += 1;
        return new Promise<Response>((resolve) => {
          resolveSession = resolve;
        });
      }
      return sse(['event: delta\ndata: {"text":"Warm."}', DONE]);
    });
    vi.stubGlobal("fetch", fetchMock);

    warmAskSession();
    const { handlers } = collect();
    const done = ask(handlers);
    resolveSession(Response.json({ session_token: "warm-session" }));
    await done;

    expect(sessionRequests).toBe(1);
    expect(chatBodies(fetchMock as never)[0]).toMatchObject({
      session_token: "warm-session",
    });
  });

  it("does not warm a session on a prerendered page", () => {
    const fetchMock = stubFetch([]);
    Object.defineProperty(document, "prerendering", {
      value: true,
      configurable: true,
    });
    try {
      warmAskSession();
    } finally {
      Object.defineProperty(document, "prerendering", {
        value: false,
        configurable: true,
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends capabilities, the conversation and the page", async () => {
    const fetchMock = stubFetch([
      sse(['event: delta\ndata: {"text":"A."}', DONE]),
    ]);
    const timings: string[] = [];
    const { handlers } = collect();
    await ask(
      { ...handlers, onTiming: (timing) => timings.push(timing.phase) },
      {
        conversationId: "7",
        page: {
          title: "Accounts",
          url: "https://solana.com/developers/docs/core/accounts",
        },
      },
    );

    const [, init] = fetchMock.mock.calls.find(([input]) =>
      urlOf(input).endsWith("/chat"),
    )!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.accept).toContain("text/event-stream");
    expect(headers["x-ask-client-capabilities"]).toBe(
      "early-status,ui-done,deferred-generative-ui,fast-path,code-followups,page-context,history",
    );
    expect(chatBodies(fetchMock)[0]).toEqual({
      session_token: "token-1",
      conversation_id: "7",
      message: "What is a PDA?",
      page_url: "https://solana.com/developers/docs/core/accounts",
      page_title: "Accounts",
    });
    expect(timings).toEqual(
      expect.arrayContaining([
        "session_start",
        "session_ready",
        "chat_request_start",
        "chat_response_start",
        "first_delta",
        "done",
      ]),
    );
  });

  it("sends earlier turns as history, and none on a first question", async () => {
    const fetchMock = stubFetch([
      sse(['event: delta\ndata: {"text":"A."}', DONE]),
      sse(['event: delta\ndata: {"text":"B."}', DONE]),
    ]);
    const history = [
      { role: "user" as const, content: "What is a PDA?" },
      {
        role: "assistant" as const,
        content: "### Summary response\nAn address.",
      },
    ];
    await ask(collect().handlers, { conversationId: "7", history });
    await ask(collect().handlers, { history: [] });
    const [followUp, first] = chatBodies(fetchMock);
    expect(followUp).toMatchObject({ conversation_id: "7", history });
    expect(first).not.toHaveProperty("history");
  });

  it("keeps numeric run and conversation ids", async () => {
    stubFetch([sse(['event: delta\ndata: {"text":"A."}', DONE])]);
    const { result, handlers } = collect();
    await ask(handlers);
    expect(result.done).toMatchObject({
      runId: "101",
      conversationId: "7",
      citations: [{ title: "PDA", url: "/developers/docs/core/pda" }],
    });
  });

  it("serves a repeated first question from the cache, with its run and conversation", async () => {
    const fetchMock = stubFetch([
      sse([
        'event: delta\ndata: {"text":"Cached answer."}',
        `event: done\ndata: ${JSON.stringify({
          run_id: "run_1",
          conversation_id: "conv_1",
          citations: [{ title: "Docs", url: "/developers/docs" }],
          code_followups: {
            prompt: "Code?",
            buttons: [{ label: "Rust", language: "rust", message: "In Rust." }],
          },
        })}`,
      ]),
    ]);
    await ask(collect().handlers, { cache: true });
    const replay = collect();
    await ask(replay.handlers, {
      cache: true,
      message: "  what   is a pda?  ",
    });

    expect(chatBodies(fetchMock)).toHaveLength(1);
    expect(replay.result.statuses).toEqual(["cache_hit"]);
    expect(replay.result.text).toBe("Cached answer.");
    expect(replay.result.done).toMatchObject({
      runId: "run_1",
      conversationId: "conv_1",
      citations: [{ title: "Docs", url: "/developers/docs" }],
      codeFollowups: { prompt: "Code?" },
    });
  });

  it("keys the cache by locale and page", async () => {
    const fetchMock = stubFetch([
      sse(['event: delta\ndata: {"text":"One."}', DONE]),
      sse(['event: delta\ndata: {"text":"Two."}', DONE]),
      sse(['event: delta\ndata: {"text":"Three."}', DONE]),
    ]);
    await ask(collect().handlers, { cache: true, locale: "en" });
    await ask(collect().handlers, { cache: true, locale: "ja" });
    await ask(collect().handlers, {
      cache: true,
      locale: "en",
      page: {
        title: "Fees",
        url: "https://solana.com/developers/docs/core/fees",
      },
    });
    expect(chatBodies(fetchMock)).toHaveLength(3);
  });

  it("never caches a stream that ended without done", async () => {
    const fetchMock = stubFetch([
      sse(['event: delta\ndata: {"text":"Partial"}']),
      sse(['event: delta\ndata: {"text":"Full."}', DONE]),
    ]);
    const first = collect();
    await ask(first.handlers, { cache: true });
    expect(first.result.errors).toEqual(["incomplete"]);
    expect(first.result.done).toBeNull();

    const second = collect();
    await ask(second.handlers, { cache: true });
    expect(second.result.text).toBe("Full.");
    expect(chatBodies(fetchMock)).toHaveLength(2);
  });

  it("does not use the cache for follow-ups or when not asked to", async () => {
    const fetchMock = stubFetch([
      sse(['event: delta\ndata: {"text":"A."}', DONE]),
      sse(['event: delta\ndata: {"text":"B."}', DONE]),
      sse(['event: delta\ndata: {"text":"C."}', DONE]),
    ]);
    await ask(collect().handlers, { cache: true, conversationId: "7" });
    await ask(collect().handlers, { cache: true, conversationId: "7" });
    await ask(collect().handlers);
    expect(chatBodies(fetchMock)).toHaveLength(3);
    expect(sessionStorage.getItem(ASK_STORAGE_KEYS.answers)).toBeNull();
  });

  it("surfaces an early visual and visual status before done", async () => {
    stubFetch([
      sse([
        'event: ui_status\ndata: {"stage":"building_visual"}',
        `event: ui_done\ndata: ${JSON.stringify({ generative_ui: createTokenGenerativeUiFixture })}`,
        `event: done\ndata: ${JSON.stringify({ response: "Token flow complete." })}`,
      ]),
    ]);
    const { result, handlers } = collect();
    await ask(handlers);
    expect(result.uiStatuses).toEqual(["building_visual"]);
    expect(result.visuals).toEqual([createTokenGenerativeUiFixture]);
    expect(result.text).toBe("Token flow complete.");
  });

  it("passes the done response on as authoritative after provisional deltas", async () => {
    stubFetch([
      sse([
        'event: delta\ndata: {"text":"Draft."}',
        `event: done\ndata: ${JSON.stringify({ response: "Final." })}`,
      ]),
    ]);
    const { result, handlers } = collect();
    await ask(handlers);
    expect(result.text).toBe("Draft.");
    expect(result.done?.response).toBe("Final.");
  });

  it("reads a non-streaming JSON answer", async () => {
    stubFetch([Response.json({ answer: "JSON answer.", run_id: 5 })]);
    const { result, handlers } = collect();
    await ask(handlers);
    expect(result.text).toBe("JSON answer.");
    expect(result.done?.runId).toBe("5");
  });

  it.each([401, 403, 419])(
    "clears a refused session (%i) and retries once",
    async (status) => {
      localStorage.setItem(
        ASK_STORAGE_KEYS.session,
        JSON.stringify({ token: "stale", createdAt: Date.now() }),
      );
      const fetchMock = stubFetch([
        Response.json({ error: "unauthorized" }, { status }),
        sse(['event: delta\ndata: {"text":"OK."}', DONE]),
      ]);
      const { result, handlers } = collect();
      await ask(handlers);
      expect(chatBodies(fetchMock).map((body) => body.session_token)).toEqual([
        "stale",
        "token-1",
      ]);
      expect(result.text).toBe("OK.");
      expect(
        JSON.parse(localStorage.getItem(ASK_STORAGE_KEYS.session)!).token,
      ).toBe("token-1");
    },
  );

  it("retries on an invalid_session body but only once", async () => {
    const fetchMock = stubFetch([
      Response.json({ error: "invalid_session" }, { status: 400 }),
      Response.json({ error: "invalid_session" }, { status: 400 }),
    ]);
    const { result, handlers } = collect();
    await ask(handlers);
    expect(chatBodies(fetchMock)).toHaveLength(2);
    expect(result.errors).toEqual(["generic"]);
  });

  it.each([
    [Response.json({ error: "rate_limited" }, { status: 429 }), "rateLimited"],
    [
      Response.json({ error: "ask_not_configured" }, { status: 503 }),
      "unavailable",
    ],
    [Response.json({ error: "message_too_long" }, { status: 413 }), "tooLong"],
    [Response.json({ error: "message too long" }, { status: 422 }), "tooLong"],
    [
      Response.json({ error: "conversation_limit" }, { status: 409 }),
      "conversationFull",
    ],
    [new Response("oops", { status: 500 }), "generic"],
  ] as const)(
    "maps a failed response to an error kind (%#)",
    async (response, kind) => {
      stubFetch([response]);
      const { result, handlers } = collect();
      await ask(handlers);
      expect(result.errors).toEqual([kind]);
    },
  );

  it("reports offline when the request cannot be made", async () => {
    stubFetch([
      () => {
        throw new TypeError("Failed to fetch");
      },
    ]);
    const { result, handlers } = collect();
    await ask(handlers);
    expect(result.errors).toEqual(["offline"]);
  });

  it("reports a failed session request with its kind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "rate_limited" }, { status: 429 }),
      ),
    );
    const { result, handlers } = collect();
    await ask(handlers);
    expect(result.errors).toEqual(["rateLimited"]);
  });

  it("reports nothing after the reader stops", async () => {
    const controller = new AbortController();
    stubFetch([
      () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    ]);
    const { result, handlers } = collect();
    await ask(handlers, { signal: controller.signal });
    expect(result.errors).toEqual([]);
    expect(result.done).toBeNull();
  });
});

describe("sendFeedback", () => {
  it("sends the session token with the rating", async () => {
    const fetchMock = stubFetch([]);
    await expect(sendFeedback({ runId: "101", rating: "up" })).resolves.toBe(
      true,
    );
    const [, init] = fetchMock.mock.calls.find(([input]) =>
      urlOf(input).endsWith("/feedback"),
    )!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      session_token: "token-1",
      run_id: "101",
      rating: "up",
    });
  });

  it("retries once with a fresh session when the token is refused", async () => {
    localStorage.setItem(
      ASK_STORAGE_KEYS.session,
      JSON.stringify({ token: "stale", createdAt: Date.now() }),
    );
    const tokens: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (...[input, init]: FetchArgs) => {
        if (urlOf(input).endsWith("/session"))
          return Response.json({ session_token: "fresh" });
        const token = JSON.parse(String(init?.body)).session_token as string;
        tokens.push(token);
        return new Response(null, { status: token === "stale" ? 401 : 204 });
      }),
    );
    await expect(sendFeedback({ runId: "1", rating: "down" })).resolves.toBe(
      true,
    );
    expect(tokens).toEqual(["stale", "fresh"]);
  });
});

describe("getAskRun", () => {
  it("normalizes a finished run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          run_id: 9,
          conversation_id: 4,
          response:
            "### Summary response\nA CPI lets one program call another.",
          citations: [{ title: "CPI", url: "/docs/core/cpi" }],
        }),
      ),
    );
    await expect(
      getAskRun("9", new AbortController().signal),
    ).resolves.toMatchObject({
      runId: "9",
      conversationId: "4",
      citations: [{ title: "CPI", url: "/developers/docs/core/cpi" }],
    });
  });
});
