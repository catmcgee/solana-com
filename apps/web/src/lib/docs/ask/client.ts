/**
 * Client for the docs agent API, proxied same-origin at /api/ask:
 *
 *   POST /session     -> { session_token }
 *   POST /chat        -> SSE (status, delta, ui_status, ui_done, done, error)
 *                        or one JSON answer
 *   POST /feedback    -> 2xx
 *   GET  /runs/:id    -> a finished answer
 *
 * Ported from Bri's ui-chrome/ask-solana/api.ts. Changes: a refused session
 * (401, 403, 419 or `{error: "invalid_session"}`) is cleared and retried
 * once, for chat and feedback; failures map to an AskErrorKind the panel
 * has a message for; the page a question is about is sent as
 * `page_url` / `page_title`; recent turns are sent as `history` for
 * backends without conversation memory; and the answer cache only stores
 * real, first-turn answers.
 */
import {
  answerCacheKey,
  readCachedAnswer,
  writeCachedAnswer,
} from "./answer-cache";
import {
  ASK_CLIENT_CAPABILITIES,
  ASK_STORAGE_KEYS,
  askApiBase,
  isPrerendering,
} from "./config";
import type { AskPageContext } from "./page-context";
import {
  askErrorKindFor,
  toDonePayload,
  type AskDonePayload,
  type AskErrorKind,
  type AskGenerativeUi,
  type AskHistoryTurn,
} from "./protocol";
import { consumeAskStream, type AskStreamHandlers } from "./sse";

/** A request that failed with a known kind (session, HTTP status, network). */
export class AskRequestError extends Error {
  constructor(
    readonly kind: AskErrorKind | "session",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AskRequestError";
  }
}

type StoredSession = { token: string; createdAt: number };

/** The server's token lifetime; a refused token is replaced sooner. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ERROR_BODY_CHARS = 2_000;

let sessionInFlight: Promise<string> | null = null;

function readStoredSession(): string | null {
  try {
    const raw = window.localStorage.getItem(ASK_STORAGE_KEYS.session);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.token !== "string" ||
      !parsed.token ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > SESSION_TTL_MS
    ) {
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function storeSession(token: string) {
  try {
    window.localStorage.setItem(
      ASK_STORAGE_KEYS.session,
      JSON.stringify({ token, createdAt: Date.now() } satisfies StoredSession),
    );
  } catch {
    // Private mode or blocked storage: the token lives for this page only.
  }
}

export function clearAskSession(): void {
  try {
    window.localStorage.removeItem(ASK_STORAGE_KEYS.session);
  } catch {
    // ignore
  }
  sessionInFlight = null;
}

/** The response body as JSON when it parses, else as (bounded) text. */
async function readErrorBody(res: Response): Promise<unknown> {
  try {
    const text = (await res.text()).slice(0, MAX_ERROR_BODY_CHARS);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

async function requestSession(): Promise<string> {
  const res = await fetch(`${askApiBase()}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const kind = askErrorKindFor(res.status, await readErrorBody(res));
    throw new AskRequestError(
      kind === "session" ? "generic" : kind,
      `session request failed (${res.status})`,
      res.status,
    );
  }
  const data = (await res.json()) as { session_token?: unknown };
  if (typeof data.session_token !== "string" || !data.session_token) {
    throw new AskRequestError("generic", "session response has no token");
  }
  storeSession(data.session_token);
  return data.session_token;
}

/** The stored session token, or a new one (concurrent callers share one request). */
export function getSessionToken(): Promise<string> {
  const stored = readStoredSession();
  if (stored) return Promise.resolve(stored);
  sessionInFlight ??= requestSession().finally(() => {
    sessionInFlight = null;
  });
  return sessionInFlight;
}

/**
 * Mints a session ahead of the first question (launcher hover/focus, panel
 * open). Not for every visitor, and never on a prerendered page.
 */
export function warmAskSession(): void {
  if (typeof window === "undefined" || isPrerendering()) return;
  if (readStoredSession()) return;
  void getSessionToken().catch(() => {
    // The send path reports errors; warming never blocks the UI.
  });
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** The error kind for something a fetch or stream read threw. */
function errorKindForThrown(
  error: unknown,
  streamStarted: boolean,
): AskErrorKind {
  if (error instanceof AskRequestError) {
    return error.kind === "session" ? "generic" : error.kind;
  }
  if (isOffline()) return "offline";
  if (streamStarted) return "incomplete";
  // fetch() rejects with a TypeError when the network request itself fails.
  return error instanceof TypeError ? "offline" : "generic";
}

export type AskChatTiming = {
  phase:
    | "cache_hit"
    | "session_start"
    | "session_ready"
    | "chat_request_start"
    | "chat_response_start"
    | "session_retry"
    | "first_status"
    | "first_delta"
    | "first_ui"
    | "done"
    | "error";
  elapsedMs: number;
  detail?: string | number | null;
};

export type AskChatHandlers = AskStreamHandlers & {
  onTiming?: (timing: AskChatTiming) => void;
};

export type AskChatRequest = {
  /** The text sent to the agent (prompts and page prefix included). */
  message: string;
  conversationId: string | null;
  /** The page the question is about, sent as page_url / page_title. */
  page?: AskPageContext | null;
  /** Earlier turns of this conversation, already capped (see store.ts). */
  history?: AskHistoryTurn[];
  /** Reader's locale, for the cache key and docs link prefixes. */
  locale?: string | null;
  signal: AbortSignal;
  /**
   * Read and write the answer cache. Only for a thread's first question,
   * and not for "Ask again". Ignored when `conversationId` is set.
   */
  cache?: boolean;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Sends one question and streams the answer to `handlers`. Calls exactly
 * one of onDone / onError, or neither when `signal` aborts.
 */
export async function streamChat(
  request: AskChatRequest,
  handlers: AskChatHandlers,
): Promise<void> {
  const { message, conversationId, page, history, locale, signal } = request;
  const startedAt = nowMs();
  const cacheKey =
    request.cache && conversationId === null
      ? answerCacheKey({ message, locale, pageUrl: page?.url })
      : null;
  let text = "";
  let ui: AskGenerativeUi | null = null;
  let sawStatus = false;
  let sawDelta = false;
  let sawUi = false;
  let finished = false;

  const report = (
    phase: AskChatTiming["phase"],
    detail?: AskChatTiming["detail"],
  ) => {
    handlers.onTiming?.({
      phase,
      elapsedMs: Math.max(0, Math.round(nowMs() - startedAt)),
      detail,
    });
  };

  const wrapped: AskStreamHandlers = {
    onStatus: (stage) => {
      if (!sawStatus) {
        sawStatus = true;
        report("first_status", stage);
      }
      handlers.onStatus?.(stage);
    },
    onDelta: (delta) => {
      if (!sawDelta) {
        sawDelta = true;
        report("first_delta");
      }
      text += delta;
      handlers.onDelta(delta);
    },
    onUiStatus: (stage) => handlers.onUiStatus?.(stage),
    onGenerativeUi: (generativeUi) => {
      if (!sawUi) {
        sawUi = true;
        report("first_ui");
      }
      ui = generativeUi;
      handlers.onGenerativeUi?.(generativeUi);
    },
    onDone: (payload) => {
      if (finished || signal.aborted) return;
      finished = true;
      report("done");
      if (cacheKey) {
        writeCachedAnswer({
          key: cacheKey,
          content: payload.response ?? text,
          citations: payload.citations,
          generativeUi: payload.generativeUi ?? ui,
          codeFollowups: payload.codeFollowups,
          runId: payload.runId,
          conversationId: payload.conversationId,
        });
      }
      handlers.onDone(payload);
    },
    onError: (kind, detail) => {
      if (finished || signal.aborted) return;
      finished = true;
      report("error", detail ?? kind);
      handlers.onError(kind, detail);
    },
  };

  const cached = cacheKey ? readCachedAnswer(cacheKey) : null;
  if (cached) {
    report("cache_hit");
    handlers.onStatus?.("cache_hit");
    if (cached.content) handlers.onDelta(cached.content);
    if (cached.generativeUi) handlers.onGenerativeUi?.(cached.generativeUi);
    handlers.onDone({
      response: cached.content,
      runId: cached.runId,
      conversationId: cached.conversationId,
      citations: cached.citations,
      generativeUi: cached.generativeUi,
      codeFollowups: cached.codeFollowups,
    });
    return;
  }

  const send = (sessionToken: string) =>
    fetch(`${askApiBase()}/chat`, {
      method: "POST",
      headers: {
        accept: "text/event-stream, application/json",
        "content-type": "application/json",
        "x-ask-client-capabilities": ASK_CLIENT_CAPABILITIES,
      },
      body: JSON.stringify({
        session_token: sessionToken,
        conversation_id: conversationId ?? undefined,
        message,
        page_url: page?.url,
        page_title: page?.title,
        history: history?.length ? history : undefined,
      }),
      signal,
    });

  let streamStarted = false;
  try {
    for (let attempt = 0; ; attempt++) {
      report("session_start");
      const sessionToken = await getSessionToken();
      report("session_ready");
      report("chat_request_start");
      const res = await send(sessionToken);
      report("chat_response_start", res.status);

      if (!res.ok) {
        const kind = askErrorKindFor(res.status, await readErrorBody(res));
        if (kind === "session" && attempt === 0) {
          // Expired or rotated token: mint a fresh one and retry once.
          report("session_retry", res.status);
          clearAskSession();
          continue;
        }
        wrapped.onError(kind === "session" ? "generic" : kind);
        return;
      }
      if (!res.body) {
        wrapped.onError("generic");
        return;
      }

      streamStarted = true;
      if (
        (res.headers.get("content-type") ?? "").includes("text/event-stream")
      ) {
        await consumeAskStream(res.body, wrapped, locale);
        return;
      }

      // Non-streaming fallback: one JSON answer.
      const done = toDonePayload(await res.json(), locale);
      if (done.response) wrapped.onDelta(done.response);
      wrapped.onDone(done);
      return;
    }
  } catch (error) {
    if (signal.aborted) return;
    wrapped.onError(errorKindForThrown(error, streamStarted));
  }
}

/**
 * Rates an answer. Retries once with a fresh session when the token is
 * refused. Resolves to whether the server accepted it; never throws.
 */
export async function sendFeedback(options: {
  runId: string;
  rating: "up" | "down";
  comment?: string;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sessionToken = await getSessionToken();
      const res = await fetch(`${askApiBase()}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_token: sessionToken,
          run_id: options.runId,
          rating: options.rating,
          comment: options.comment,
        }),
      });
      if (res.ok) return true;
      const kind = askErrorKindFor(res.status, await readErrorBody(res));
      if (kind !== "session") return false;
      clearAskSession();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * A finished run, for a later "202 + run_id, then poll" fallback when the
 * agent cannot stream.
 */
export async function getAskRun(
  runId: string,
  signal: AbortSignal,
  locale?: string | null,
): Promise<AskDonePayload> {
  const res = await fetch(`${askApiBase()}/runs/${encodeURIComponent(runId)}`, {
    signal,
  });
  if (!res.ok) {
    const kind = askErrorKindFor(res.status, await readErrorBody(res));
    throw new AskRequestError(
      kind,
      `run request failed (${res.status})`,
      res.status,
    );
  }
  return toDonePayload(await res.json(), locale);
}
