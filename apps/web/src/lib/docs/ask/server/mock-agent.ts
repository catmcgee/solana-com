import "server-only";

import { defaultLocale } from "@workspace/i18n/config";
import { pageMarkdown } from "@/lib/docs/llms";
import { DOCS_LOCALES } from "@/lib/docs/locales.mjs";
import {
  breadcrumbs,
  resolveDocsPage,
  type ResolvedDocsPage,
} from "@/lib/docs/page-data";
import { docsSearchServer } from "@/lib/docs/search";
import { ASK_MAX_MESSAGE_CHARS } from "../config";
import { isRecord, toId } from "../protocol";
import { askRouteMethod } from "./agent-proxy";
import { docTopics, suggestFollowups } from "./followups";
import {
  planMockAnswer,
  type MockCitation,
  type MockPage,
  type MockPlan,
  type MockTopicId,
} from "./mock-answers";
import {
  NO_STORE_HEADERS,
  SSE_HEADERS,
  askError,
  readJsonBody,
  sseEvent,
} from "./request";

/**
 * A stand-in for the docs agent, so the panel can be reviewed end to end
 * (the real client, SSE parser and store) without the agent or its secret.
 * Selected by ./backend.ts (never on a production deployment); the Nous
 * backend also hands it questions that contain a `mock:` trigger.
 *
 * - POST session  → `{ session_token: "mock-…" }`
 * - POST chat     → SSE: status, ~25 ms text deltas, ui_status/ui_done when
 *                   the answer has a visual, then done with numeric
 *                   run_id/conversation_id and citations from the docs
 *                   search index. Answers: ./mock-answers.ts.
 * - POST feedback → 204; GET search → docs search results;
 *   GET runs/:id → a finished run.
 *
 * Review triggers anywhere in a question: `mock:error` (stream error),
 * `mock:429`, `mock:503`, `mock:409` (conversation full), `mock:401`
 * (session refused), `mock:truncate` (stream ends without done),
 * `mock:slow` (10× slower). Over 4,000 characters gets 413.
 */
const MAX_TURNS = 20;
const MAX_REMEMBERED = 200;
const DELAY_MS = { search: 450, delta: 25, visual: 700, settle: 120 };

type Conversation = { topic: MockTopicId | null; turns: number };

/** Per-instance memory; a dev server restart forgets conversations. */
const conversations = new Map<string, Conversation>();
const runs = new Map<string, Record<string, unknown>>();
let lastId = Date.now() % 1_000_000_000;

function nextId(): number {
  lastId += 1 + Math.floor(Math.random() * 7);
  return lastId;
}

function remember<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value as string);
}

/** Word-aligned chunks of about 24 characters, like a model's deltas. */
export function chunkAnswer(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of text.match(/\s*\S+\s*/g) ?? []) {
    current += word;
    if (current.length >= 24) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function searchPages(query: string): Promise<MockCitation[]> {
  try {
    const results = await docsSearchServer.search(query, {
      locale: defaultLocale,
      limit: 20,
    });
    return results.flatMap((result) =>
      result.type === "page"
        ? [
            {
              title: String(result.content),
              url: result.url,
              breadcrumbs: result.breadcrumbs,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

/** Up to four real docs pages: the plan's preferred ones first. */
async function citationsFor(
  plan: MockPlan,
  page: MockPage | null,
): Promise<MockCitation[]> {
  const found = new Map<string, MockCitation>();
  if (page) {
    found.set(page.path, {
      title: page.title,
      url: page.path,
      breadcrumbs: page.breadcrumbs,
    });
  }
  for (const query of plan.searchQueries.slice(0, 3)) {
    for (const citation of await searchPages(query)) {
      if (!found.has(citation.url)) found.set(citation.url, citation);
    }
  }
  const preferred = plan.preferredUrls.flatMap((url) => found.get(url) ?? []);
  const rest = [...found.values()].filter(
    (citation) => !plan.preferredUrls.includes(citation.url),
  );
  return [...preferred, ...rest].slice(0, 4);
}

/** The docs page behind `page_url`, with its description and section headings. */
async function resolvePage(pageUrl: unknown): Promise<MockPage | null> {
  if (typeof pageUrl !== "string") return null;
  let segments: string[];
  try {
    segments = new URL(pageUrl, "https://solana.com").pathname
      .split("/")
      .filter(Boolean);
  } catch {
    return null;
  }
  const locale = DOCS_LOCALES.includes(segments[0] ?? "")
    ? segments[0]!
    : defaultLocale;
  const slugs = locale === defaultLocale ? segments : segments.slice(1);
  let resolved: ResolvedDocsPage | null;
  try {
    resolved = resolveDocsPage(locale, slugs);
  } catch {
    // A malformed %-escape (URIError from decodeURIComponent).
    return null;
  }
  if (!resolved) return null;
  const data = resolved.page.data as { title?: string; description?: string };
  let headings: string[] = [];
  try {
    const markdown = await pageMarkdown(resolved.page);
    let inFence = false;
    for (const line of markdown.split("\n")) {
      if (/^\s*```/.test(line)) inFence = !inFence;
      const heading = !inFence && /^##\s+(.+?)\s*$/.exec(line)?.[1];
      if (heading)
        headings.push(
          heading.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`/g, ""),
        );
    }
  } catch {
    headings = [];
  }
  return {
    title: data.title ?? resolved.page.url,
    path: resolved.page.url,
    description: data.description,
    headings,
    breadcrumbs: breadcrumbs(resolved),
  };
}

/** The question without review triggers or the page prefix the client adds. */
function questionText(message: string, pageUrl: unknown): string {
  let text = message.replace(/mock:[\w-]+/g, " ").trim();
  if (typeof pageUrl === "string") {
    const [first = "", ...rest] = text.split(/\n\s*\n/);
    if (rest.length > 0 && first.includes(pageUrl)) text = rest.join("\n\n");
  }
  return text.replace(/[ \t]+/g, " ").trim();
}

type MockOptions = {
  /** Speeds up (0) or slows down the stream; tests use 0. */
  delayScale?: number;
  /** Session tokens to accept besides the mock's own `mock-…` ones. */
  acceptSession?: (token: string) => boolean;
};

async function mockChat(
  request: Request,
  options: MockOptions,
): Promise<Response> {
  const delayScale = options.delayScale ?? 1;
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const body = isRecord(read.value) ? read.value : {};

  const token = body.session_token;
  if (
    typeof token !== "string" ||
    !(token.startsWith("mock-") || options.acceptSession?.(token))
  ) {
    return askError(
      401,
      "invalid_session",
      "The session is invalid or has expired.",
    );
  }
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) {
    return askError(400, "invalid_request", "The message is required.");
  }
  if (message.length > ASK_MAX_MESSAGE_CHARS) {
    return askError(
      413,
      "message_too_long",
      "Messages are limited to 4,000 characters.",
    );
  }

  const triggers = new Set(message.match(/mock:[\w-]+/g) ?? []);
  if (triggers.has("mock:429")) {
    return askError(
      429,
      "rate_limited",
      "Too many messages. Try again in a minute.",
      {
        "Retry-After": "60",
      },
    );
  }
  if (triggers.has("mock:503")) {
    return askError(503, "unavailable", "The docs agent is unavailable.");
  }
  if (triggers.has("mock:401")) {
    return askError(
      401,
      "invalid_session",
      "The session is invalid or has expired.",
    );
  }

  const priorId = toId(body.conversation_id);
  const prior = priorId ? conversations.get(priorId) : undefined;
  if (triggers.has("mock:409") || (prior && prior.turns >= MAX_TURNS)) {
    return askError(
      409,
      "conversation_limit",
      "This conversation is full. Start a new conversation.",
    );
  }

  const page = await resolvePage(body.page_url);
  const question = questionText(message, body.page_url);
  const plan = planMockAnswer({
    question,
    priorTopic: prior?.topic,
    followUp: priorId !== null,
    page,
  });
  const citations = await citationsFor(plan, page);
  const text = plan.render(citations);
  // As the Nous backend builds them: the pages' topics, then the pages the
  // answer did not link.
  const suggestedFollowups = suggestFollowups({
    question,
    answer: text,
    pages: citations.map((citation) => ({
      url: citation.url,
      title: citation.title,
      topics: docTopics(`${citation.url}\n${citation.title}\n${text}`),
    })),
    citations: citations.filter((citation) => text.includes(citation.url)),
  });

  const conversationId = priorId ?? String(nextId());
  remember(conversations, conversationId, {
    topic: plan.topic ?? prior?.topic ?? null,
    turns: (prior?.turns ?? 0) + 1,
  });
  const runId = String(nextId());
  const done = {
    run_id: Number(runId),
    conversation_id: /^\d+$/.test(conversationId)
      ? Number(conversationId)
      : conversationId,
    citations,
    code_followups: plan.codeFollowups,
    suggested_followups: suggestedFollowups,
  };
  remember(runs, runId, {
    ...done,
    response: text,
    generative_ui: plan.visual,
  });

  const slow = (triggers.has("mock:slow") ? 10 : 1) * delayScale;
  const failAt = triggers.has("mock:error")
    ? 0.3
    : triggers.has("mock:truncate")
      ? 0.45
      : 1;
  const chunks = chunkAnswer(text);
  const deltaCount = Math.max(1, Math.ceil(chunks.length * failAt));
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const live = () => open && !request.signal.aborted;
      const send = (event: string, data: unknown) => {
        if (!live()) return;
        try {
          controller.enqueue(sseEvent(event, data));
        } catch {
          open = false;
        }
      };
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          if (!live()) return resolve();
          const timer = setTimeout(resolve, ms * slow);
          request.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });

      send("status", { stage: "searching_docs" });
      await wait(DELAY_MS.search);
      for (const chunk of chunks.slice(0, deltaCount)) {
        if (!live()) break;
        send("delta", { text: chunk });
        await wait(DELAY_MS.delta);
      }
      if (triggers.has("mock:error")) {
        send("error", {
          error: "agent_error",
          message: "The agent stopped while writing the answer.",
        });
      } else if (!triggers.has("mock:truncate")) {
        if (plan.visual) {
          send("ui_status", { stage: "building_visual" });
          await wait(DELAY_MS.visual);
          send("ui_done", { generative_ui: plan.visual });
          await wait(DELAY_MS.settle);
        }
        send("done", done);
      }
      if (open) {
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the reader.
        }
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

async function mockSearch(request: Request): Promise<Response> {
  const query =
    new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const results = query ? await searchPages(query) : [];
  return Response.json(
    { results: results.slice(0, 8) },
    { headers: NO_STORE_HEADERS },
  );
}

/** Answers one /api/ask request. */
export async function mockAskRequest(
  request: Request,
  path: string[],
  options: MockOptions = {},
): Promise<Response> {
  const method = askRouteMethod(path);
  if (!method) return askError(404, "not_found");
  if (request.method !== method) {
    return askError(405, "method_not_allowed", undefined, { Allow: method });
  }
  const [head, id = ""] = path;
  switch (head) {
    case "session":
      return Response.json(
        { session_token: `mock-${crypto.randomUUID()}` },
        { headers: NO_STORE_HEADERS },
      );
    case "chat":
      return mockChat(request, options);
    case "feedback": {
      const read = await readJsonBody(request);
      if (!read.ok) return read.response;
      return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
    }
    case "search":
      return mockSearch(request);
    case "runs": {
      const run = runs.get(id);
      return run
        ? Response.json(run, { headers: NO_STORE_HEADERS })
        : askError(404, "not_found");
    }
    default:
      return askError(404, "not_found");
  }
}
