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
import { isAskGenerativeUi, type AskGenerativeUi } from "./generative-ui/types";

export { isAskGenerativeUi };
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

/** A finished answer (`done` event, JSON fallback, or `GET /runs/:id`). */
export type AskDonePayload = {
  /** Full answer text when the server sends it; it replaces the streamed text. */
  response: string | null;
  runId: string | null;
  conversationId: string | null;
  citations: AskCitation[];
  generativeUi: AskGenerativeUi | null;
  codeFollowups: CodeFollowups | null;
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
  | "offline";

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

/**
 * A `done` payload (or any finished-answer JSON) in the client's shape.
 * Accepts the field aliases the agent has used: run_id/runId,
 * conversation_id/conversationId, response/content/text/answer,
 * generative_ui/generativeUi, code_followups/codeFollowups.
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
    generativeUi: isAskGenerativeUi(generativeUi) ? generativeUi : null,
    codeFollowups: normalizeCodeFollowups(
      done.code_followups ?? done.codeFollowups,
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
 * The status row for a raw stage from `status` / `ui_status` events:
 * searching_docs → searching, building_visual → visual, a cache hit →
 * writing, anything else → preparing.
 */
export function askStatusForStage(stage: string): AskStatus {
  const normalized = stage.trim().toLowerCase();
  if (normalized.startsWith("search")) return "searching";
  if (normalized.includes("visual") || normalized.startsWith("ui")) {
    return "visual";
  }
  if (normalized === "cache_hit" || normalized.startsWith("writ")) {
    return "writing";
  }
  return "preparing";
}

/**
 * The error kind for a failed request, from its status and body (the agent
 * and proxy send `{error: "<code>", message?}`). `session` means the token
 * was refused and a fresh one should be tried.
 */
export function askErrorKindFor(
  status: number,
  body: unknown,
): AskErrorKind | "session" {
  const text = (
    typeof body === "string" ? body : JSON.stringify(body ?? "")
  ).toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    status === 419 ||
    /invalid[_ ]session|session[_ ](expired|invalid)/.test(text)
  ) {
    return "session";
  }
  if (status === 429 || /\brate[_ ]limit/.test(text)) return "rateLimited";
  if (status === 413 || /too[_ -]?long|max(imum)?[_ -]?length/.test(text)) {
    return "tooLong";
  }
  if (
    status === 409 ||
    /conversation[_ ](limit|full)|too many messages/.test(text)
  ) {
    return "conversationFull";
  }
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "generic";
}

/** The kind for an `event: error` payload from the stream. */
export function askErrorKindForEvent(payload: unknown): AskErrorKind {
  const kind = askErrorKindFor(0, payload);
  return kind === "session" ? "generic" : kind;
}
