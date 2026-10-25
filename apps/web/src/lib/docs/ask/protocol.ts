/**
 * Wire types of the docs agent API and the normalizers that turn its
 * payloads into the shapes the panel renders. Ported from Bri's
 * ui-chrome/ask-solana/api.ts, with these fixes:
 * - numeric `run_id` / `conversation_id` are kept (as strings), so feedback
 *   and follow-up memory work against an integer-id backend;
 * - citation and answer links to the old /docs paths point at
 *   /developers/docs, in the reader's locale, so they navigate client-side.
 */
import { DOCS_LOCALES } from "../locales.mjs";
import {
  isAskGenerativeUi,
  toAskGenerativeUi,
  type AskGenerativeUi,
} from "./generative-ui/types";

export { isAskGenerativeUi, toAskGenerativeUi };
export type {
  AskGenerativeUi,
  AskGenerativeUiComponent,
  AskGenerativeUiComponentType,
} from "./generative-ui/types";

export type AskCitation = {
  title: string;
  url: string;
  /** Section path, when the backend sends one (the mock does). */
  breadcrumbs?: string[];
};

export type CodeFollowupButton = {
  type: "show_code" | (string & {});
  label: string;
  language: string;
  /** Sent as the next question when the button is chosen. */
  message: string;
};

export type CodeFollowups = { prompt: string; buttons: CodeFollowupButton[] };

/** One "what next" question; `kind` is the agent's button type ("ask"). */
export type AskSuggestedFollowup = {
  label: string;
  /** Sent as the next question when the pill is chosen. */
  message: string;
  kind: string;
};

/**
 * The agent's `suggested_followups` ("Want to keep going? Try one of
 * these:"): next lessons and related questions, without a code language.
 */
export type AskSuggestedFollowups = {
  prompt: string | null;
  items: AskSuggestedFollowup[];
};

/** A finished answer (`done` event, JSON fallback, or `GET /runs/:id`). */
export type AskDonePayload = {
  /** Full answer text when the server sends it; it replaces the streamed text. */
  response: string | null;
  runId: string | null;
  conversationId: string | null;
  citations: AskCitation[];
  generativeUi: AskGenerativeUi | null;
  codeFollowups: CodeFollowups | null;
  suggestedFollowups: AskSuggestedFollowups | null;
};

/**
 * A finished earlier turn, sent as `history` (capability "history") for
 * backends that keep no conversation memory; the agent proxy drops it.
 */
export type AskHistoryTurn = { role: "user" | "assistant"; content: string };

/** Why an answer failed; each has a `docsAsk.errors.<kind>` string. */
export type AskErrorKind =
  | "generic"
  | "rateLimited"
  | "unavailable"
  | "incomplete"
  | "tooLong"
  | "conversationFull"
  | "offline"
  /** The agent is still finishing this session's previous answer. */
  | "busy";

/** What the status row says while an answer is on its way (`docsAsk.status.<status>`). */
export type AskStatus = "preparing" | "searching" | "writing" | "visual";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A run or conversation id: a non-empty string, or a finite number as a string. */
export function toId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "bigint") return value.toString();
  return toNonEmptyString(value);
}

const SOLANA_ORIGIN = /^https?:\/\/(?:www\.)?solana\.com(?=[/?#]|$)/i;
const DOCS_PATH =
  /^\/(?:([a-z]{2})\/)?(docs|developers\/docs|developers\/cookbook)(?=[/?#]|$)(.*)$/;

/**
 * A docs link as the panel should open it:
 * - `/docs/x` (the pre-move path) becomes `/developers/docs/x`;
 * - `https://solana.com/...docs...` becomes a site-relative path;
 * - an unprefixed English docs path gets the reader's locale prefix when
 *   the docs are translated into it (`/ja/developers/docs/x`);
 * - `/en/...` and `/el/...` (Greek docs were dropped) lose the prefix.
 * Anything else is returned unchanged.
 */
export function normalizeDocsHref(
  href: string,
  locale?: string | null,
): string {
  const trimmed = href.trim();
  const path = trimmed.replace(SOLANA_ORIGIN, "") || "/";
  const match = DOCS_PATH.exec(path);
  if (!match) return trimmed;
  const [, prefix, section, rest] = match;
  const base = section === "docs" ? "developers/docs" : section;
  const pathLocale =
    prefix && DOCS_LOCALES.includes(prefix)
      ? prefix
      : prefix
        ? null
        : locale && DOCS_LOCALES.includes(locale)
          ? locale
          : null;
  return `${pathLocale ? `/${pathLocale}` : ""}/${base}${rest}`;
}

function normalizeBreadcrumbs(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : [value];
  const breadcrumbs = items.flatMap((item) => {
    const text = isRecord(item)
      ? (toNonEmptyString(item.title) ??
        toNonEmptyString(item.label) ??
        toNonEmptyString(item.name))
      : toNonEmptyString(item);
    return text ? [text] : [];
  });
  return breadcrumbs.length > 0 ? breadcrumbs : undefined;
}

/** Citations with a URL, deduplicated by URL, links normalized. */
export function normalizeCitations(
  value: unknown,
  locale?: string | null,
): AskCitation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const rawUrl = toNonEmptyString(item.url) ?? toNonEmptyString(item.href);
    if (!rawUrl) return [];
    const url = normalizeDocsHref(rawUrl, locale);
    if (seen.has(url)) return [];
    seen.add(url);
    const breadcrumbs = normalizeBreadcrumbs(item.breadcrumbs);
    return [
      {
        title: toNonEmptyString(item.title) ?? "",
        url,
        ...(breadcrumbs ? { breadcrumbs } : {}),
      },
    ];
  });
}

function normalizeCodeFollowupButton(
  value: unknown,
): CodeFollowupButton | null {
  if (!isRecord(value)) return null;
  const label = toNonEmptyString(value.label);
  const language = toNonEmptyString(value.language);
  const message = toNonEmptyString(value.message);
  if (!label || !language || !message) return null;
  return {
    type: toNonEmptyString(value.type) ?? "show_code",
    label,
    language,
    message,
  };
}

export function normalizeCodeFollowups(value: unknown): CodeFollowups | null {
  if (!isRecord(value)) return null;
  const prompt = toNonEmptyString(value.prompt);
  const buttons = (Array.isArray(value.buttons) ? value.buttons : []).flatMap(
    (item) => {
      const button = normalizeCodeFollowupButton(item);
      return button ? [button] : [];
    },
  );
  if (!prompt || buttons.length === 0) return null;
  return { prompt, buttons };
}

/** The agent sends at most three. */
const MAX_SUGGESTED_FOLLOWUPS = 3;

/**
 * Suggested follow-ups in the panel's shape. Reads the agent's
 * `{prompt, buttons: [{type, label, message}]}`, a bare list of buttons,
 * and a stored copy (`{prompt, items: [{kind, label, message}]}`). Items
 * need a label and a message; repeats (by message) are dropped. Null when
 * none is left.
 */
export function normalizeSuggestedFollowups(
  value: unknown,
): AskSuggestedFollowups | null {
  const record = isRecord(value) ? value : {};
  const list = Array.isArray(value)
    ? value
    : Array.isArray(record.buttons)
      ? record.buttons
      : Array.isArray(record.items)
        ? record.items
        : [];
  const seen = new Set<string>();
  const items = list
    .flatMap((item) => {
      if (!isRecord(item)) return [];
      const label = toNonEmptyString(item.label);
      const message = toNonEmptyString(item.message);
      if (!label || !message || seen.has(message.toLowerCase())) return [];
      seen.add(message.toLowerCase());
      const kind =
        toNonEmptyString(item.kind) ?? toNonEmptyString(item.type) ?? "ask";
      return [{ label, message, kind }];
    })
    .slice(0, MAX_SUGGESTED_FOLLOWUPS);
  return items.length > 0
    ? { prompt: toNonEmptyString(record.prompt), items }
    : null;
}

/**
 * A `done` payload (or any finished-answer JSON) in the client's shape.
 * Accepts the field aliases the agent has used: run_id/runId,
 * conversation_id/conversationId, response/content/text/answer,
 * generative_ui/generativeUi, code_followups/codeFollowups,
 * suggested_followups/suggestedFollowups.
 */
export function toDonePayload(
  value: unknown,
  locale?: string | null,
): AskDonePayload {
  const done = isRecord(value) ? value : {};
  const response =
    [done.response, done.content, done.text, done.answer].find(
      (candidate): candidate is string => typeof candidate === "string",
    ) ?? null;
  const generativeUi = done.generative_ui ?? done.generativeUi;
  return {
    response,
    runId: toId(done.run_id) ?? toId(done.runId),
    conversationId: toId(done.conversation_id) ?? toId(done.conversationId),
    citations: normalizeCitations(done.citations, locale),
    generativeUi: toAskGenerativeUi(generativeUi),
    codeFollowups: normalizeCodeFollowups(
      done.code_followups ?? done.codeFollowups,
    ),
    suggestedFollowups: normalizeSuggestedFollowups(
      done.suggested_followups ?? done.suggestedFollowups,
    ),
  };
}

/**
 * The agent repeats `code_followups.prompt` as the answer's last line. When
 * it does, `body` is the answer without it, so the prompt shows once, with
 * its buttons.
 */
export function splitCodeFollowupPrompt(
  response: string,
  followups?: CodeFollowups | null,
): { body: string; prompt: string | null } {
  const prompt = followups?.prompt?.trim();
  if (!prompt) return { body: response, prompt: null };
  const trimmed = response.trimEnd();
  if (!trimmed.endsWith(prompt)) return { body: response, prompt };
  return { body: trimmed.slice(0, -prompt.length).trimEnd(), prompt };
}

const SUMMARY_HEADING =
  /^#{1,6}[ \t]*summary(?:[ \t]+response)?[ \t]*:?[ \t]*(?:\r?\n|$)/im;
const IN_DEPTH_HEADING =
  /^#{1,6}[ \t]*in[- ]?depth(?:[ \t]+response)?[ \t]*:?[ \t]*(?:\r?\n|$)/im;
const SECTION_HEADINGS = [
  "summary response",
  "indepth response",
  "in-depth response",
  "in depth response",
];

/** Drops a half-streamed section heading ("### Indep") from the end of the text. */
function dropPartialHeading(text: string): string {
  const tail = text.slice(text.lastIndexOf("\n") + 1);
  if (!/^#{1,6}/.test(tail)) return text;
  const words = tail
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return SECTION_HEADINGS.some((heading) => heading.startsWith(words))
    ? text.slice(0, text.length - tail.length)
    : text;
}

/**
 * The agent writes `### Summary response` then `### Indepth response`. The
 * panel shows the summary and folds the in-depth part behind "Show the full
 * answer". Headings are removed; text without them is all summary. Safe on
 * partial (streaming) text.
 */
export function splitAnswerSections(text: string): {
  summary: string;
  inDepth: string | null;
} {
  const inDepth = IN_DEPTH_HEADING.exec(text);
  const before = inDepth
    ? text.slice(0, inDepth.index)
    : dropPartialHeading(text);
  const summary = before.replace(SUMMARY_HEADING, "").trim();
  const rest = inDepth
    ? text.slice(inDepth.index + inDepth[0].length).trim()
    : "";
  return { summary, inDepth: rest || null };
}

/**
 * The status row for a raw stage from `status`, `answer_status` and
 * `ui_status` events:
 * - searching: searching_docs, reading_doc, using_tool, retrieving_docs,
 *   building_plan (the agent is still gathering what to answer from);
 * - writing: writing, a response cache hit, a rendered template answer;
 * - visual: building_visual_answer and other ui stages;
 * - preparing: accepted, starting and anything unknown.
 */
export function askStatusForStage(stage: string): AskStatus {
  const normalized = stage.trim().toLowerCase();
  if (normalized.includes("visual") || normalized.startsWith("ui")) {
    return "visual";
  }
  if (/^(?:search|read|retriev|using_tool|building_plan)/.test(normalized)) {
    return "searching";
  }
  if (/^(?:writ|rendering_template)|cache_hit$/.test(normalized)) {
    return "writing";
  }
  return "preparing";
}

const STATUS_ORDER: readonly AskStatus[] = [
  "preparing",
  "searching",
  "writing",
  "visual",
];

/**
 * The status row only moves forward: the agent reports `searching_docs`,
 * then `reading_doc` per page, then (with a canonical page) `building_plan`,
 * so a later stage of an earlier step must not send "Writing" back to
 * "Searching".
 */
export function advanceAskStatus(
  current: AskStatus | undefined,
  next: AskStatus,
): AskStatus {
  if (!current) return next;
  return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current)
    ? next
    : current;
}

/** The agent's 401 text, and the `invalid_session` code of the review backends. */
const SESSION_REFUSED =
  /invalid[_ ]session|session[_ ](?:expired|invalid)|valid session_token/;

/**
 * The error kind for a failed request, from its status and body (the agent
 * sends `{error: "<text>"}`, Laravel validation `{message, errors}`, the
 * proxy and review backends `{error: "<code>", message?}`). `session`
 * means the token was refused and a fresh one should be tried.
 *
 * - 403 is not a session problem: the agent answers 403 only to a wrong
 *   proxy secret (the proxy turns that into 502), and our own 403s
 *   (`invalid_origin`, `bot`) won't pass with a new token either.
 * - 429 has three causes: the per-minute throttle (`rateLimited`), the
 *   agent's two-pending-answers cap, "Please wait for your previous
 *   question to finish." (`busy`; the agent keeps answering after Stop),
 *   and a capacity limit in front of the agent, which sends no JSON
 *   (`unavailable`).
 * - 422 with `errors`: a rejected `message` is too long; anything else
 *   (a stale `conversation_id`, an over-long feedback comment) is generic.
 */
export function askErrorKindFor(
  status: number,
  body: unknown,
): AskErrorKind | "session" {
  const text = (
    typeof body === "string" ? body : JSON.stringify(body ?? "")
  ).toLowerCase();
  if (status === 401 || status === 419 || SESSION_REFUSED.test(text)) {
    return "session";
  }
  if (status === 429) {
    if (!isRecord(body)) return "unavailable";
    return /previous question/.test(text) ? "busy" : "rateLimited";
  }
  if (/\brate[_ ]limit/.test(text)) return "rateLimited";
  if (status === 422 && isRecord(body) && isRecord(body.errors)) {
    return "message" in body.errors ? "tooLong" : "generic";
  }
  if (
    status === 413 ||
    /too[_ -]?long|max(?:imum)?[_ -]?length|max_chars/.test(text)
  ) {
    return "tooLong";
  }
  if (
    status === 409 ||
    /conversation[_ ](?:limit|full)|too many messages/.test(text)
  ) {
    return "conversationFull";
  }
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "generic";
}

/**
 * True when the request named a conversation this session can't use: the
 * agent's 404 "Conversation not found for this session." (a new token, a
 * second tab, a backend switch) or a 422 that rejects `conversation_id`.
 * The client then starts a new conversation and sends the question again.
 */
export function isStaleConversation(status: number, body: unknown): boolean {
  if (status === 404) {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    return /conversation not found/i.test(text);
  }
  return (
    status === 422 &&
    isRecord(body) &&
    isRecord(body.errors) &&
    "conversation_id" in body.errors
  );
}

/**
 * Our own codes for a service that is down or slow. The nous backend can
 * start the stream (with a template visual) before the gateway answers, so
 * its refusal arrives as an error event instead of an HTTP status.
 */
const UNAVAILABLE_CODES = new Set([
  "ask_unavailable",
  "ask_timeout",
  "ask_misconfigured",
]);

/** The kind for an `event: error` payload from the stream. */
export function askErrorKindForEvent(payload: unknown): AskErrorKind {
  if (isRecord(payload) && typeof payload.error === "string") {
    if (UNAVAILABLE_CODES.has(payload.error)) return "unavailable";
    // The answer started, then the model stopped (nous `ask_failed`).
    if (payload.error === "ask_failed") return "incomplete";
  }
  const kind = askErrorKindFor(0, payload);
  return kind === "session" ? "generic" : kind;
}
