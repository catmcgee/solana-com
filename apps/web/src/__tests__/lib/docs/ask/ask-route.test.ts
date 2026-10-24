import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeAskStream, type AskStreamHandlers } from "@/lib/docs/ask/sse";

// The docs index and pages are stand-ins: the mock only needs their shape.
vi.mock("@/lib/docs/search", () => ({
  docsSearchServer: {
    search: vi.fn(async (query: string) => [
      {
        id: "/developers/docs/core/pda",
        type: "page",
        url: "/developers/docs/core/pda",
        content: "Program-derived addresses (PDAs)",
        breadcrumbs: ["Building", "Program-derived addresses"],
      },
      {
        id: "/developers/docs/core/pda#seeds",
        type: "heading",
        url: "/developers/docs/core/pda#seeds",
        content: "Seeds",
      },
      {
        id: `/developers/docs/search/${encodeURIComponent(query)}`,
        type: "page",
        url: `/developers/docs/search/${encodeURIComponent(query)}`,
        content: `Result for ${query}`,
        breadcrumbs: [],
      },
    ]),
  },
}));
vi.mock("@/lib/docs/page-data", () => ({
  // As the real one: a malformed %-escape throws URIError.
  resolveDocsPage: vi.fn((locale: string, slugs: string[]) =>
    slugs.map((slug) => decodeURIComponent(slug)).join("/") ===
    "developers/docs/core/pda/pda-derivation"
      ? {
          locale,
          page: {
            url: "/developers/docs/core/pda/pda-derivation",
            data: {
              title: "PDA Derivation",
              description: "How PDAs are derived.",
            },
          },
        }
      : null,
  ),
  breadcrumbs: () => ["Building", "Program-derived addresses"],
}));
vi.mock("@/lib/docs/llms", () => ({
  pageMarkdown: vi.fn(
    async () =>
      "# PDA Derivation\n\n## Optional Seeds\n\n```ts\n## not a heading\n```\n\n## Bump Seed\n",
  ),
}));

const { GET, POST } = await import("@/app/api/ask/[...path]/route");
const { mockAskRequest, chunkAnswer } =
  await import("@/lib/docs/ask/server/mock-agent");
const { proxyAskRequest, askRouteMethod } =
  await import("@/lib/docs/ask/server/agent-proxy");
const { planMockAnswer } = await import("@/lib/docs/ask/server/mock-answers");

const ORIGIN = "https://solana.com";

function post(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`${ORIGIN}/api/ask/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const context = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});

/** Runs a mock chat through the real stream parser. */
async function mockChat(body: Record<string, unknown>) {
  const response = await mockAskRequest(
    post("chat", { session_token: "mock-test", ...body }),
    ["chat"],
    { delayScale: 0 },
  );
  const result = {
    status: response.status,
    events: [] as string[],
    text: "",
    ui: null as unknown,
    done: null as Parameters<AskStreamHandlers["onDone"]>[0] | null,
    error: null as string | null,
    outcome: null as string | null,
  };
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return { ...result, json: await response.json() };
  }
  result.outcome = await consumeAskStream(response.body!, {
    onStatus: (stage) => result.events.push(`status:${stage}`),
    onDelta: (text) => {
      result.text += text;
    },
    onUiStatus: (stage) => result.events.push(`ui_status:${stage}`),
    onGenerativeUi: (ui) => {
      result.events.push("ui_done");
      result.ui = ui;
    },
    onDone: (payload) => {
      result.events.push("done");
      result.done = payload;
    },
    onError: (kind) => {
      result.error = kind;
    },
  });
  return { ...result, json: null };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/ask route", () => {
  it("serves the mock when ASK_SOLANA_MOCK=1 outside production", async () => {
    vi.stubEnv("ASK_SOLANA_MOCK", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await POST(post("session", {}), context("session"));
    expect(response.status).toBe(200);
    expect((await response.json()).session_token).toMatch(/^mock-/);
  });

  it("never serves the mock on production", async () => {
    vi.stubEnv("ASK_SOLANA_MOCK", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ASK_AGENT_URL", "");
    const response = await POST(post("session", {}), context("session"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "ask_not_configured",
    });
  });

  it("answers GET search through the mock", async () => {
    vi.stubEnv("ASK_SOLANA_MOCK", "1");
    const response = await GET(
      new Request(`${ORIGIN}/api/ask/search?q=pda`),
      context("search"),
    );
    const { results } = await response.json();
    expect(results[0]).toMatchObject({ url: "/developers/docs/core/pda" });
    expect(results.every((r: { url: string }) => !r.url.includes("#"))).toBe(
      true,
    );
  });
});

describe("mock agent", () => {
  it("streams a topic answer with a visual, numeric ids and real citations", async () => {
    const result = await mockChat({
      message: "What is a program derived address?",
    });
    expect(result.outcome).toBe("done");
    expect(result.events).toEqual([
      "status:searching_docs",
      "ui_status:building_visual",
      "ui_done",
      "done",
    ]);
    expect(result.text).toMatch(/^### Summary response\n/);
    expect(result.text).toContain("### Indepth response");
    expect(result.text).toContain("```ts");
    expect(result.text).toContain("```bash");
    expect(result.done).toMatchObject({
      runId: expect.stringMatching(/^\d+$/),
      conversationId: expect.stringMatching(/^\d+$/),
      codeFollowups: {
        prompt: "Want to see this in code?",
        buttons: [
          expect.objectContaining({ label: "TypeScript" }),
          expect.objectContaining({ label: "Rust" }),
        ],
      },
    });
    expect(result.done?.citations[0]).toEqual({
      title: "Program-derived addresses (PDAs)",
      url: "/developers/docs/core/pda",
      breadcrumbs: ["Building", "Program-derived addresses"],
    });
    expect(result.done?.citations.length).toBeLessThanOrEqual(4);
  });

  it("answers a follow-up in the conversation's context", async () => {
    const first = await mockChat({ message: "How does a CPI work?" });
    const followUp = await mockChat({
      message: "Show me the code for that in Anchor.",
      conversation_id: Number(first.done!.conversationId),
    });
    expect(followUp.done?.conversationId).toBe(first.done?.conversationId);
    expect(followUp.text).toContain("CpiContext::new");
    expect(followUp.text).not.toContain("### Indepth response");
    expect(followUp.ui).toBeNull();
  });

  it("answers fees with a table and no visual", async () => {
    const result = await mockChat({
      message: "How are transaction fees calculated?",
    });
    expect(result.text).toContain("| Base fee |");
    expect(result.text).toContain("5,000 lamports");
    expect(result.ui).toBeNull();
    expect(result.done?.codeFollowups).toBeNull();
  });

  it("explains code without a visual", async () => {
    const result = await mockChat({
      message:
        "Explain this code from PDA Derivation:\n\n```\nconst [pda, bump] = await getProgramDerivedAddress({ programAddress, seeds });\n```",
    });
    expect(result.text).toContain("derives a program derived address");
    expect(result.ui).toBeNull();
  });

  it("answers about the attached page from its sections", async () => {
    const pageUrl =
      "https://solana.com/developers/docs/core/pda/pda-derivation";
    const result = await mockChat({
      message: `Question about the docs page “PDA Derivation” (${pageUrl}):\n\nWhat is the canonical bump?`,
      page_url: pageUrl,
      page_title: "PDA Derivation",
    });
    expect(result.text).toContain(
      "[PDA Derivation](/developers/docs/core/pda/pda-derivation)",
    );
    expect(result.text).toContain(
      "read [Bump Seed](/developers/docs/core/pda/pda-derivation#bump-seed)",
    );
    expect(result.text).not.toContain("not a heading");
    expect(result.done?.citations[0]?.url).toBe(
      "/developers/docs/core/pda/pda-derivation",
    );
  });

  it("answers without the page when page_url has a malformed escape", async () => {
    const result = await mockChat({
      message: "What is a PDA?",
      page_url: "/developers/docs/%E0%A4%A",
    });
    expect(result).toMatchObject({ status: 200, outcome: "done" });
  });

  it("supports the review triggers", async () => {
    expect((await mockChat({ message: "mock:429 hi" })).status).toBe(429);
    expect((await mockChat({ message: "mock:503 hi" })).status).toBe(503);
    expect((await mockChat({ message: "mock:409 hi" })).status).toBe(409);
    expect((await mockChat({ message: "x".repeat(4001) })).status).toBe(413);

    const failed = await mockChat({ message: "mock:error What is a token?" });
    expect(failed).toMatchObject({ outcome: "error", error: "generic" });
    expect(failed.text.length).toBeGreaterThan(0);

    const truncated = await mockChat({
      message: "mock:truncate What is an account?",
    });
    expect(truncated).toMatchObject({
      outcome: "incomplete",
      error: "incomplete",
      done: null,
    });
  });

  it("refuses sessions it did not mint", async () => {
    const response = await mockAskRequest(
      post("chat", { session_token: "real-token", message: "hi" }),
      ["chat"],
      { delayScale: 0 },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_session" });
  });

  it("accepts feedback and serves finished runs", async () => {
    const answer = await mockChat({ message: "What is rent?" });
    const feedback = await mockAskRequest(
      post("feedback", { session_token: "mock-test", run_id: 1, rating: "up" }),
      ["feedback"],
    );
    expect(feedback.status).toBe(204);
    const run = await mockAskRequest(
      new Request(`${ORIGIN}/api/ask/runs/${answer.done!.runId}`),
      ["runs", answer.done!.runId!],
    );
    expect(await run.json()).toMatchObject({ response: answer.text });
  });

  it("chunks answers on word boundaries without losing text", () => {
    const text = "### Summary response\nA PDA is\n\n```ts\nconst x = 1;\n```\n";
    const chunks = chunkAnswer(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("routes questions to topics", () => {
    const topic = (question: string) => planMockAnswer({ question }).topic;
    expect(topic("How do I create a token with Token Extensions?")).toBe(
      "createToken",
    );
    expect(topic("What is a program derived address?")).toBe("pda");
    expect(topic("How are transaction fees calculated?")).toBe("fees");
    expect(topic("How does one program call another?")).toBe("cpi");
    expect(topic("How do I sign a transaction?")).toBe("transaction");
    expect(topic("Which RPC endpoint should I use?")).toBe("rpc");
    expect(topic("What is an account?")).toBe("account");
    expect(topic("How do I stake SOL?")).toBeNull();
  });
});

describe("agent proxy", () => {
  beforeEach(() => {
    vi.stubEnv("ASK_SOLANA_MOCK", "");
    vi.stubEnv("ASK_AGENT_URL", "https://agent.example/");
    vi.stubEnv("ASK_SOLANA_PROXY_SECRET", "s3cret");
  });

  it("needs the agent URL and the secret", async () => {
    vi.stubEnv("ASK_SOLANA_PROXY_SECRET", "");
    const response = await proxyAskRequest(post("session", {}), ["session"]);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "ask_not_configured",
      message: "Ask AI is not configured.",
    });
  });

  it("streams the agent's response with the secret added", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('event: done\ndata: {"run_id":1}\n\n', {
        headers: {
          "content-type": "text/event-stream",
          "x-secret-upstream": "no",
        },
      }),
    );
    const response = await POST(
      post(
        "chat",
        { session_token: "t", message: "hi" },
        {
          "x-ask-client-capabilities": "early-status",
          cookie: "private",
        },
      ),
      context("chat"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe(
      "no-cache, no-transform",
    );
    expect(response.headers.get("x-secret-upstream")).toBeNull();
    expect(await response.text()).toBe('event: done\ndata: {"run_id":1}\n\n');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://agent.example/api/ask/chat");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-ask-proxy-secret")).toBe("s3cret");
    expect(headers.get("x-ask-client-capabilities")).toBe("early-status");
    expect(headers.get("cookie")).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({
      session_token: "t",
      message: "hi",
    });
  });

  it("forwards chat bodies without the client's history", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const body = {
      session_token: "t",
      conversation_id: "12",
      message: "And in Rust?",
      page_url: "/developers/docs/core/pda",
      history: [{ role: "assistant", content: "A PDA is…" }],
    };
    await POST(post("chat", body), context("chat"));
    const { history: _history, ...forwarded } = body;
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual(
      forwarded,
    );

    await POST(
      post("feedback", { run_id: 1, rating: "up" }),
      context("feedback"),
    );
    expect(String(fetchMock.mock.calls[1]![1]?.body)).toBe(
      JSON.stringify({ run_id: 1, rating: "up" }),
    );
  });

  it("passes agent errors through for the client to map", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "rate_limited" },
        { status: 429, headers: { "retry-after": "60" } },
      ),
    );
    const response = await proxyAskRequest(post("chat", { message: "hi" }), [
      "chat",
    ]);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("rejects cross-site requests, unknown paths, wrong methods and large bodies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(
      (
        await proxyAskRequest(
          post("chat", {}, { origin: "https://evil.example" }),
          ["chat"],
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await proxyAskRequest(
          post("chat", {}, { "sec-fetch-site": "cross-site" }),
          ["chat"],
        )
      ).status,
    ).toBe(403);
    expect((await proxyAskRequest(post("admin", {}), ["admin"])).status).toBe(
      404,
    );
    expect(
      (await proxyAskRequest(new Request(`${ORIGIN}/api/ask/chat`), ["chat"]))
        .status,
    ).toBe(405);
    expect(
      (
        await proxyAskRequest(post("chat", { message: "x".repeat(70_000) }), [
          "chat",
        ])
      ).status,
    ).toBe(413);
    expect(
      (await proxyAskRequest(post("chat", "{not json"), ["chat"])).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows same-origin GETs by referer and forwards the query", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ results: [] }));
    const response = await proxyAskRequest(
      new Request(`${ORIGIN}/api/ask/search?q=pda`, {
        headers: { referer: `${ORIGIN}/developers/docs` },
      }),
      ["search"],
    );
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://agent.example/api/ask/search?q=pda",
    );
  });

  it("maps unreachable agents and timeouts", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("fetch failed"),
    );
    expect(
      (await proxyAskRequest(post("session", {}), ["session"])).status,
    ).toBe(502);

    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
        }),
    );
    const pending = proxyAskRequest(post("session", {}), ["session"]);
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await pending;
    vi.useRealTimers();
    expect(response.status).toBe(504);
  });

  it("knows which paths the agent serves", () => {
    expect(askRouteMethod(["chat"])).toBe("POST");
    expect(askRouteMethod(["search"])).toBe("GET");
    expect(askRouteMethod(["runs", "123"])).toBe("GET");
    expect(askRouteMethod(["runs", "../admin"])).toBeNull();
    expect(askRouteMethod(["chat", "x"])).toBeNull();
    expect(askRouteMethod([])).toBeNull();
  });
});
