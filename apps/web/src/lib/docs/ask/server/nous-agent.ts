import "server-only";

import { createHash } from "node:crypto";
import { checkRateLimit } from "@vercel/firewall";
import { defaultLocale } from "@workspace/i18n/config";
import { checkBotId } from "botid/server";
import {
  allow,
  clientKey,
  ipKey,
} from "@/lib/delivery-vs-payment/server/rateLimit";
import { pageMarkdown } from "@/lib/docs/llms";
import { DOCS_LOCALES } from "@/lib/docs/locales.mjs";
import {
  breadcrumbs,
  resolveDocsPage,
  type ResolvedDocsPage,
} from "@/lib/docs/page-data";
import { docsSearchServer } from "@/lib/docs/search";
import { ASK_HISTORY_LIMITS, ASK_MAX_MESSAGE_CHARS } from "../config";
import type { AskGenerativeUi } from "../generative-ui/types";
import {
  isRecord,
  toId,
  type AskCitation,
  type AskHistoryTurn,
} from "../protocol";
import { askRouteMethod } from "./agent-proxy";
import {
  docsLinkPaths,
  sanitizeDocsLinks,
  withoutSourceList,
} from "./answer-links";
import { errorReference, type ErrorReference } from "./error-catalog";
import {
  availableCodeLanguages,
  codeFollowupsFor,
  docTopics,
  finalAnswer,
  suggestFollowups,
} from "./followups";
import { guidanceFor, guidanceLinks } from "./guidance";
import {
  hasDebugIntent,
  visualIntent,
  wantsVisual,
  type VisualIntent,
} from "./intent";
import { mockAskRequest } from "./mock-agent";
import { NOUS_SYSTEM_PROMPT, RULES_REMINDER } from "./nous-prompt";
import { CODE_FOLLOWUP, pinnedPaths, workflowFor } from "./pins";
import {
  NO_STORE_HEADERS,
  SSE_HEADERS,
  askError,
  isSameOriginBrowserRequest,
  readJsonBody,
  sseEvent,
} from "./request";
import { templateFor } from "./templates";
import {
  startVisualCall,
  type VisualCall,
  type VisualOutcome,
  type VisualUsage,
} from "./visual-llm";

/**
 * Review backend: answers from a model on the Nous inference gateway
 * (OpenAI-compatible), grounded in docs pages found with the docs search
 * index, so a review deployment gives real answers without the docs agent.
 * It answers as the docs agent does: its soul and answer skills as the
 * system prompt (./nous-prompt.ts), its canonical pages for common
 * questions (./pins.ts), its guidance packs (./guidance.ts), error
 * decoding (./error-catalog.ts) and made-up-link check (./answer-links.ts),
 * its template visuals or a second model call
 * for one (./templates.ts, ./visual-llm.ts), and its code and suggested
 * follow-ups (./followups.ts). Selected with ASK_SOLANA_BACKEND=nous
 * (./backend.ts; never on production). Env, read per request: NOUS_API_KEY
 * (required), NOUS_BASE_URL, ASK_NOUS_MODEL, ASK_NOUS_VISUALS ("templates"
 * skips the visual model call, "off" every visual).
 *
 * The key only ever goes into the Authorization header of the upstream
 * requests. Nothing from the upstream responses other than the answer text
 * and a validated visual reaches the reader: no bodies, headers or URLs in
 * responses or logs (logs carry status codes, timings and counts only).
 *
 * - POST session  → an opaque random token (nothing is stored)
 * - POST chat     → SSE in the agent's protocol: status, a template visual
 *                   (ui_status, ui_done) when one fits, delta…, a model
 *                   visual (ui_done) as soon as it validates, then done
 *                   (random numeric ids, the final response, citations =
 *                   the given pages the answer links to, generative_ui,
 *                   code_followups, suggested_followups) or error. A
 *                   template visual goes out right after retrieval, before
 *                   the gateway answers. Stateless: the client
 *                   sends recent turns as `history`, which the model gets
 *                   as context inside the question; the question is the
 *                   reader's own words, with the page from `page_url`
 *                   (a client's older page prefix is removed). A question
 *                   with a review trigger (`mock:visual`, `mock:error`, …)
 *                   goes to the mock, so reviewers can still see visuals
 *                   and error states.
 * - POST feedback → 204 (not recorded); GET search → docs search results.
 *
 * The Origin check only stops browsers on other sites, so chat also needs
 * BotId (fails closed off Vercel), the per-IP and per-instance limits here
 * and the WAF rule `ask-ai-nous-chat` across instances. Deploy it only where
 * deployment protection covers every domain (ssoProtection "all"), with a
 * key of its own that has a spend cap.
 */

const DEFAULT_BASE_URL = "https://inference-api.nousresearch.com/v1";
const DEFAULT_MODEL = "z-ai/glm-5.3-flash:US";

const LIMITS = {
  // Summary + in-depth answers run longer than 1,800 tokens; a cut answer
  // is reported as incomplete.
  maxTokens: 2_500,
  firstByteMs: 30_000,
  totalMs: 120_000,
  /** Pages from search given to the model, after the attached and pinned ones. */
  searchPages: 3,
  /** Canonical pages read before searching (./pins.ts, decoded errors). */
  pinnedPages: 3,
  /** Pages besides the attached one. */
  pages: 5,
  pageChars: 5_000,
  attachedPageChars: 8_000,
  citations: 4,
  /** How long `done` waits after the text for a visual still being written. */
  visualGraceMs: 2_000,
  /** An answer this long is an answer even when it links nothing. */
  declineChars: 1_200,
} as const;

/**
 * How the model opens a decline ("I can't help with that here", the soul's
 * wording), after an optional heading. A decline that links pages anyway
 * (a wallet-draining request answered with wallet docs) is still one: no
 * sources, visual or follow-ups.
 */
const DECLINE =
  /^\s*(?:#{1,6}[^\n]*\n+\s*)?(?:I can(?:'|’|no)t (?:help|assist|do that|share)|I won(?:'|’)t|That(?:'|’)s off-topic)/i;

/** Per IP (per instance), checked in order; then a per-instance ceiling. */
const RATE_LIMITS = [
  { name: "minute", limit: 12, windowMs: 60_000 },
  { name: "hour", limit: 120, windowMs: 60 * 60_000 },
] as const;
const GLOBAL_RATE_LIMIT = { limit: 600, windowMs: 60 * 60_000 } as const;
/**
 * A Vercel WAF rule with an `@vercel/firewall` condition of this ID
 * (ASK_NOUS_WAF_RULE overrides it). "off" skips the check, for review
 * projects whose deployment protection covers every domain: on a protected
 * preview the check calls back into the deployment and would need a
 * protection bypass secret.
 */
const DEFAULT_WAF_RULE = "ask-ai-nous-chat";

const UNAVAILABLE = "Ask AI is unavailable.";

const SESSION_TOKEN = /^[\w-]{8,128}$/;
/** The mock's review triggers; any other "mock:" is part of a question. */
const MOCK_TRIGGER =
  /(?:^|\s)mock:(?:visual|error|truncate|slow|401|409|429|503)\b/;

/**
 * Our structural tags, removed from the reader's text so a question or an
 * earlier turn cannot close its block and pose as docs, guidance or rules.
 * Lowercase only: pasted JSX (`<Page />`) stays as written.
 */
const STRUCTURE_TAG =
  /<\/?(?:previous_turns|turn|docs|page|reference|guidance|question)\b[^>]*>/g;

type NousConfig = { apiKey: string; endpoint: string; model: string };

/** The gateway settings, or null when the key (or a usable base URL) is missing. */
function nousConfig(): NousConfig | null {
  const apiKey = process.env.NOUS_API_KEY?.trim();
  if (!apiKey) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(process.env.NOUS_BASE_URL?.trim() || DEFAULT_BASE_URL);
  } catch {
    return null;
  }
  // The key travels in a header: never over plain HTTP.
  if (endpoint.protocol !== "https:") return null;
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/chat/completions`;
  endpoint.search = "";
  endpoint.hash = "";
  return {
    apiKey,
    endpoint: endpoint.toString(),
    model: process.env.ASK_NOUS_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && SESSION_TOKEN.test(value);
}

/** Nothing is stored, so ids only need to be numbers the client can echo. */
function randomId(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! + 1;
}

function withinRateLimit(request: Request): boolean {
  const ip = ipKey(clientKey(request));
  return (
    RATE_LIMITS.every(({ name, limit, windowMs }) =>
      allow(`ask:nous:${name}:${ip}`, limit, windowMs),
    ) &&
    allow(
      "ask:nous:global",
      GLOBAL_RATE_LIMIT.limit,
      GLOBAL_RATE_LIMIT.windowMs,
    )
  );
}

const RATE_LIMITED = () =>
  askError(429, "rate_limited", "Too many questions. Try again in a minute.", {
    "Retry-After": "60",
  });

/**
 * The per-client limit across instances (the limits above are per
 * instance), or the response to send instead. Production builds only:
 * checkRateLimit allows everything in dev, and off Vercel BotId has already
 * refused the request. Fails closed, as the Inkeep proxy does: without the
 * rule (or when the check fails) no question reaches the model.
 */
async function wafRateLimit(request: Request): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production") return null;
  const rule = process.env.ASK_NOUS_WAF_RULE?.trim() || DEFAULT_WAF_RULE;
  if (rule === "off") return null;
  try {
    const { rateLimited, error } = await checkRateLimit(rule, {
      request,
      rateLimitKey: ipKey(clientKey(request)),
    });
    if (error === "not-found") {
      console.error("[ask/nous] WAF rate limit rule is missing", {
        rateLimitId: rule,
      });
      return askError(503, "ask_not_configured");
    }
    return rateLimited ? RATE_LIMITED() : null;
  } catch {
    console.error("[ask/nous] WAF rate limit check failed", {
      rateLimitId: rule,
    });
    return askError(503, "ask_unavailable", UNAVAILABLE);
  }
}

/** Earlier turns from the client, capped again here. */
export function readHistory(value: unknown): AskHistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-ASK_HISTORY_LIMITS.turns).flatMap((item) => {
    if (!isRecord(item) || typeof item.content !== "string") return [];
    if (item.role !== "user" && item.role !== "assistant") return [];
    const content = item.content.trim();
    if (!content) return [];
    const max =
      item.role === "user"
        ? ASK_HISTORY_LIMITS.userChars
        : ASK_HISTORY_LIMITS.assistantChars;
    return [{ role: item.role, content: content.slice(0, max) }];
  });
}

// --- Retrieval ---------------------------------------------------------------

const STOP_WORDS = new Set(
  `a able about after all also am an and any anything are as at be been being
  best but by can could did do does doing doc docs documentation everything
  explain for from give good had has have how i if in into is it its just know
  like me might more most my need no not of on one ones or our page please
  possible question really should show so some something tell than that the
  their them then there these they thing things this those to too use used
  using very want was way we were what whats when where which while who why
  will with work works would you your`.split(/\s+/),
);

/** Search terms for a question: no code, URLs or filler words. */
export function searchTerms(text: string): string {
  const words = text
    .replace(/(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}@/._-]+/u)
    .map((word) => word.replace(/^[._/-]+|[._/-]+$/g, ""))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 12).join(" ");
}

const SUFFIXES = [
  "ations",
  "ation",
  "ings",
  "ing",
  "ers",
  "er",
  "ed",
  "es",
  "s",
  "e",
];

/** A rough stem, so "derive", "derived" and "derivation" compare equal. */
function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (suffix === "s" && word.endsWith("ss")) continue;
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);
}

/**
 * Whether a page mentions enough of a search's terms (half, at most three)
 * for at least one of `queries`. Search matches titles loosely ("bread"
 * finds "Read the code"); this drops hits that have nothing to do with
 * the question, so an off-topic question gets no pages and no sources.
 */
export function mentionsTerms(markdown: string, queries: string[]): boolean {
  const words = new Set(stems(markdown));
  return queries.some((query) => {
    const terms = query.split(" ").filter(Boolean);
    const found = terms.filter((term) =>
      stems(term).every((part) => words.has(part)),
    ).length;
    return (
      terms.length > 0 && found >= Math.min(3, Math.ceil(terms.length / 2))
    );
  });
}

/** Docs pages for a search, best first, without section anchors or repeats. */
async function searchPages(query: string): Promise<AskCitation[]> {
  if (!query) return [];
  try {
    const results = await docsSearchServer.search(query, {
      locale: defaultLocale,
      limit: 12,
    });
    const seen = new Set<string>();
    return results.flatMap((result) => {
      const url = result.url.split("#")[0] ?? "";
      if (result.type !== "page" || !url || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          title: String(result.content),
          url,
          ...(result.breadcrumbs?.length
            ? { breadcrumbs: result.breadcrumbs }
            : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

const RRF_K = 10;

/**
 * Pages for the searches, merged by reciprocal rank. The index only has
 * titles and descriptions, so a broad term can bury a specific one ("rent
 * accounts" lists every Accounts page first): each of `concepts` whose own
 * page (last URL segment, e.g. /core/rent) is a top hit for that term alone
 * counts as a first-place hit.
 */
async function rankPages(
  queries: string[],
  concepts: string[],
): Promise<AskCitation[]> {
  const [lists, conceptLists] = await Promise.all([
    Promise.all(queries.map(searchPages)),
    Promise.all(concepts.map(searchPages)),
  ]);
  const scores = new Map<string, { page: AskCitation; score: number }>();
  const add = (page: AskCitation, score: number) => {
    const entry = scores.get(page.url) ?? { page, score: 0 };
    entry.score += score;
    scores.set(page.url, entry);
  };
  for (const list of lists) {
    list.forEach((page, rank) => add(page, 1 / (RRF_K + rank)));
  }
  conceptLists.forEach((list, index) => {
    const concept = stem(concepts[index] ?? "");
    for (const page of list.slice(0, 3)) {
      if (stem(page.url.split("/").at(-1) ?? "") === concept) {
        add(page, 1 / RRF_K);
      }
    }
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.page);
}

const FENCE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm;
const JSX_TAG = /<([A-Za-z][\w.]*)(?=[\s/>])((?:[^<>{}]|\{[^{}]*\})*)\/?>/g;

function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match?.[1] ?? match?.[2];
}

/** Prose with MDX/HTML tags removed; cards and titled blocks keep their title (and link). */
function cleanProse(text: string): string {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
            .replace(JSX_TAG, (_tag, _name, attrs: string) => {
              const title = attribute(attrs, "title");
              const href = attribute(attrs, "href");
              if (title && href) return `[${title}](${href}) `;
              return title ? `**${title}** ` : "";
            })
            .replace(/<\/[A-Za-z][\w.]*\s*>/g, ""),
    )
    .join("");
}

/** `text` cut to about `maxChars` at a paragraph break, closing a code block the cut leaves open. */
function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let cut = text.slice(0, maxChars);
  const paragraph = cut.lastIndexOf("\n\n");
  if (paragraph > maxChars * 0.8) cut = cut.slice(0, paragraph);
  if ((cut.match(/^[ \t]*(?:`{3,}|~{3,})/gm)?.length ?? 0) % 2 === 1) {
    cut += "\n```";
  }
  return `${cut.trimEnd()}\n\n[…]`;
}

/** Splits Markdown before each ## and ### heading outside code blocks. */
function sections(text: string): string[] {
  const parts: string[] = [];
  let lines: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const marker = /^[ \t]*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !fence) fence = marker;
    else if (marker && fence && marker.startsWith(fence)) fence = null;
    else if (!fence && /^#{2,3}\s/.test(line) && lines.length > 0) {
      parts.push(lines.join("\n"));
      lines = [];
    }
    lines.push(line);
  }
  if (lines.length > 0) parts.push(lines.join("\n"));
  return parts;
}

/**
 * A page's Markdown (lib/docs/llms pageMarkdown) as model context, without
 * the agent preamble and MDX markup, in about `maxChars`. A longer page
 * keeps its introduction and the sections that mention the most `terms`
 * (in page order, gaps marked […]), so the example a question needs is
 * not cut off with the end of the page; without terms it is cut at the end.
 */
export function docsExcerpt(
  markdown: string,
  maxChars: number,
  terms: string[] = [],
): string {
  const body = markdown.replace(/^(?:>[^\n]*\n|[ \t]*\n)+/, "");
  let text = "";
  let last = 0;
  for (const match of body.matchAll(FENCE)) {
    text += cleanProse(body.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  text = (text + cleanProse(body.slice(last)))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= maxChars) return text;

  const wanted = [...new Set(terms.flatMap(stems))];
  const [intro = "", ...rest] = sections(text);
  if (rest.length === 0 || wanted.length === 0) return clip(text, maxChars);
  const head = clip(intro, Math.floor(maxChars / 3));
  let budget = maxChars - head.length;
  const ranked = rest
    .map((part, index) => {
      const words = new Set(stems(part));
      const lineEnd = part.indexOf("\n");
      const heading = new Set(
        stems(lineEnd === -1 ? part : part.slice(0, lineEnd)),
      );
      const score =
        wanted.filter((word) => words.has(word)).length +
        wanted.filter((word) => heading.has(word)).length / 2;
      return { part, index, score };
    })
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen: typeof ranked = [];
  for (const section of ranked) {
    if (section.part.length + 8 <= budget) {
      chosen.push(section);
      budget -= section.part.length + 8;
    } else if (chosen.length === 0 && budget > 500) {
      // The best section alone is too long: keep its start.
      chosen.push({ ...section, part: clip(section.part, budget - 8) });
      break;
    }
  }
  if (chosen.length === 0) return clip(text, maxChars);
  let excerpt = head;
  let previous = -1;
  for (const section of chosen.sort((a, b) => a.index - b.index)) {
    excerpt += `${section.index === previous + 1 ? "" : "\n\n[…]"}\n\n${section.part}`;
    previous = section.index;
  }
  return previous < rest.length - 1 ? `${excerpt}\n\n[…]` : excerpt;
}

type DocsExcerpt = AskCitation & {
  text: string;
  /** The page's topics, as the docs agent's index tags them (./followups.ts). */
  topics: string[];
  /** Code languages in the whole page, not only the excerpt (code buttons). */
  languages: string[];
};

/**
 * The English docs page at a URL or path, or null. Always English, as
 * search is: translated pages compile from source files at request time,
 * and this route's function does not ship them (docs-trace-includes.mjs).
 * The client adds the reader's locale to the links.
 */
function resolveUrl(url: string): ResolvedDocsPage | null {
  let segments: string[];
  try {
    segments = new URL(url, "https://solana.com").pathname
      .split("/")
      .filter(Boolean);
  } catch {
    return null;
  }
  if (DOCS_LOCALES.includes(segments[0] ?? "")) segments = segments.slice(1);
  try {
    return resolveDocsPage(defaultLocale, segments);
  } catch {
    // A malformed %-escape (URIError from decodeURIComponent).
    return null;
  }
}

/** A docs page as a citation (title, URL, breadcrumbs), without its text. */
function pageRef(url: string): AskCitation | null {
  const resolved = resolveUrl(url);
  if (!resolved) return null;
  const crumbs = breadcrumbs(resolved);
  const data = resolved.page.data as { title?: string };
  return {
    title: data.title ?? resolved.page.url,
    url: resolved.page.url,
    ...(crumbs.length ? { breadcrumbs: crumbs } : {}),
  };
}

/** A docs page by URL or path: its excerpt and its full Markdown, or null. */
async function loadPage(
  url: string,
  maxChars: number,
  terms: string[],
  fallbackTitle?: string,
): Promise<{ excerpt: DocsExcerpt; markdown: string } | null> {
  const resolved = resolveUrl(url);
  if (!resolved) return null;
  try {
    const markdown = await pageMarkdown(resolved.page);
    const crumbs = breadcrumbs(resolved);
    const data = resolved.page.data as { title?: string };
    const body = markdown.replace(/^(?:>[^\n]*\n|[ \t]*\n)+/, "");
    return {
      excerpt: {
        title: data.title ?? fallbackTitle ?? resolved.page.url,
        url: resolved.page.url,
        ...(crumbs.length ? { breadcrumbs: crumbs } : {}),
        text: docsExcerpt(markdown, maxChars, terms),
        topics: docTopics(`${resolved.page.url}\n${body}`),
        languages: availableCodeLanguages(body),
      },
      markdown,
    };
  } catch {
    return null;
  }
}

const FENCED = /(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g;

/** A first paragraph that is only "… (https://solana.com/…):", any language. */
const PAGE_PREFIX =
  /^[^\n]*\(https?:\/\/(?:www\.)?solana\.com\/[^\s)]*\)\s*:\s*$/;

export type AskQuestion = {
  /** What the model reads: the reader's words, without our structure tags. */
  text: string;
  /** Without code blocks: what search, intent and templates read. */
  prose: string;
  /** "Explain this code": a code block with a few words around it. */
  code: boolean;
};

/**
 * The question as the reader wrote it. Older clients start it with the
 * page ("Question about the docs page “Rent” (https://…):", in the
 * reader's language); that line goes, as the page comes from page_url. A
 * bare code block is asked about as "Explain this code".
 */
export function readQuestion(message: string, pageUrl?: string): AskQuestion {
  const [first = "", ...rest] = message.split(/\n\s*\n/);
  const prefixed =
    rest.length > 0 &&
    ((!!pageUrl && first.includes(pageUrl)) || PAGE_PREFIX.test(first.trim()));
  let text = (prefixed ? rest.join("\n\n") : message)
    .replace(STRUCTURE_TAG, "")
    .trim();
  const prose = text.replace(FENCED, " ").replace(/\s+/g, " ").trim();
  const hasCode = /^[ \t]*(?:`{3,}|~{3,})/m.test(text);
  if (hasCode && !prose) text = `Explain this code:\n\n${text}`;
  return {
    text,
    prose: prose || (hasCode ? "Explain this code" : ""),
    code: hasCode && prose.length < 160 && !hasDebugIntent(prose),
  };
}

/** Words from the identifiers in a question's code ("getProgramDerivedAddress"). */
function codeTerms(text: string): string {
  const code = (text.match(FENCED) ?? []).join("\n");
  const identifiers =
    code.match(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b|\b[a-z]+(?:_[a-z0-9]+)+\b/g) ??
    [];
  return searchTerms(
    [...new Set(identifiers)]
      .slice(0, 6)
      .map((id) => id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " "))
      .join(" ")
      // Accessor verbs say nothing about the topic.
      .replace(/\b(?:get|set|new)\b/gi, " "),
  );
}

type GatheredDocs = {
  pages: DocsExcerpt[];
  attached: DocsExcerpt | null;
  /** The canonical pages read before searching (./pins.ts), best first. */
  pinned: DocsExcerpt[];
  /**
   * What the question is about, as docs topic facets: its workflow route,
   * the RPC methods it names, the page it was asked on (./followups.ts
   * ranks their questions first).
   */
  topics: string[];
};

/**
 * Words that find the sections with code in a page (a fence's language and
 * title, "```ts Kit"), for a request for code in a language.
 */
function codeSectionTerms(prose: string): string[] {
  const text = prose.toLowerCase();
  return [
    "example",
    ...(/\b(?:typescript|ts|javascript|js)\b/.test(text)
      ? ["ts", "typescript", "kit"]
      : []),
    ...(/\brust\b/.test(text) ? ["rs", "rust"] : []),
    ...(/\bpython\b/.test(text) ? ["py", "python"] : []),
  ];
}

/**
 * The docs the model gets: the attached page, the canonical pages for the
 * question (./pins.ts: RPC method pages and the docs agent's workflow
 * routes; `extraPins` from decoded errors), then the best search hits that
 * mention the question's terms. A follow-up ("show me that in Rust") is
 * also searched together with the previous question; code is searched by
 * its identifiers. A request for code reads the route's code pages first
 * (the canonical pages explain without code); a short one ("Show me the
 * code for that in TypeScript.") searches the previous question alone, as
 * its own words find QR-code pages.
 */
async function gatherDocs(
  question: AskQuestion,
  pageUrl: string | undefined,
  history: AskHistoryTurn[],
  extraPins: string[],
): Promise<GatheredDocs> {
  const previous = history.findLast((turn) => turn.role === "user");
  const previousProse = previous ? readQuestion(previous.content).prose : "";
  // A short follow-up ("show me that in Rust") reads the pages its
  // question would have.
  const ownPins = pinnedPaths(question.prose);
  const followUp =
    !!previous && ownPins.length === 0 && question.prose.length < 80;
  const route =
    workflowFor(question.prose) ??
    (followUp ? workflowFor(previousProse) : null);
  const codeAsk = !question.code && CODE_FOLLOWUP.test(question.prose);
  const pins = [
    ...(codeAsk ? (route?.code ?? []) : []),
    ...(followUp ? pinnedPaths(previousProse) : ownPins),
  ];
  const own = searchTerms(question.prose);
  const queries = (
    codeAsk && followUp
      ? [searchTerms(previousProse)]
      : [
          ...new Set([
            own,
            previous
              ? searchTerms(`${question.prose}\n\n${previousProse}`)
              : "",
            question.code ? codeTerms(question.text) : "",
          ]),
        ]
  ).filter(Boolean);
  const terms = [
    ...queries.flatMap((query) => query.split(" ")),
    ...(codeAsk ? codeSectionTerms(question.prose) : []),
  ];
  const words = (codeAsk && followUp ? (queries[0] ?? "") : own)
    .split(" ")
    .filter(Boolean);
  const [attachedPage, pinCandidates, ranked] = await Promise.all([
    pageUrl ? loadPage(pageUrl, LIMITS.attachedPageChars, terms) : null,
    Promise.all(
      [...new Set([...pins, ...extraPins])].map((url) =>
        loadPage(url, LIMITS.pageChars, terms),
      ),
    ),
    rankPages(queries, words.length > 1 ? words.slice(0, 4) : []),
  ]);
  const attached = attachedPage?.excerpt ?? null;
  const seen = new Set(attached ? [attached.url] : []);
  const pinned: DocsExcerpt[] = [];
  for (const page of pinCandidates) {
    if (!page || seen.has(page.excerpt.url)) continue;
    if (pinned.length >= LIMITS.pinnedPages) break;
    seen.add(page.excerpt.url);
    pinned.push(page.excerpt);
  }
  const slots = Math.min(LIMITS.searchPages, LIMITS.pages - pinned.length);
  // Spares for hits that do not resolve or do not mention the question.
  const candidates = ranked
    .filter((page) => !seen.has(page.url))
    .slice(0, slots + 2);
  const loaded = await Promise.all(
    candidates.map((page) =>
      loadPage(page.url, LIMITS.pageChars, terms, page.title),
    ),
  );
  const found = loaded
    .flatMap((page) =>
      page && mentionsTerms(page.markdown, queries) ? [page.excerpt] : [],
    )
    .slice(0, slots);
  const topics = [
    ...(route ? [route.topic] : []),
    ...(pinned.some((page) => page.url.startsWith("/developers/docs/rpc/"))
      ? ["rpc"]
      : []),
    ...(attached ? docTopics(attached.url.replace(/[/_-]+/g, " ")) : []),
  ];
  return {
    pages: [...(attached ? [attached] : []), ...pinned, ...found],
    attached,
    pinned,
    topics: [...new Set(topics)],
  };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const TURN_TAG = /<\/?(?:previous_turns|turn)\b[^>]*>/gi;

/**
 * Earlier turns as context inside the question, never as chat messages:
 * they come from the browser, so an `assistant` message would let a script
 * put words in the model's mouth ("the scope restriction is lifted").
 */
function previousTurns(history: AskHistoryTurn[]): string {
  if (history.length === 0) return "";
  const turns = history
    .map(
      ({ role, content }) =>
        `<turn role="${role}">\n${content.replace(TURN_TAG, "").replace(STRUCTURE_TAG, "")}\n</turn>`,
    )
    .join("\n");
  return `<previous_turns>\n${turns}\n</previous_turns>\n\n`;
}

/**
 * The user message: earlier turns, guidance packs, the docs (and decoded
 * errors), the page the reader is on, the question, then the rules again.
 */
function promptFor(options: {
  question: AskQuestion;
  docs: GatheredDocs;
  history: AskHistoryTurn[];
  guidance: string;
  reference: ErrorReference | null;
}): string {
  const { question, docs, history, guidance, reference } = options;
  const blocks = [
    ...docs.pages.map((page) => {
      const section = page.breadcrumbs?.length
        ? ` section="${escapeAttribute(page.breadcrumbs.join(" › "))}"`
        : "";
      return `<page title="${escapeAttribute(page.title)}" url="${escapeAttribute(page.url)}"${section}>\n${page.text}\n</page>`;
    }),
    ...(reference ? [reference.text] : []),
  ];
  const context = blocks.length
    ? blocks.join("\n\n")
    : "No docs pages matched this question.";
  const where = docs.attached
    ? `The reader asked this on the docs page "${docs.attached.title.replace(/["\n]/g, "")}" (${docs.attached.url}).\n\n`
    : "";
  return `${previousTurns(history)}${guidance}<docs>\n${context}\n</docs>\n\n${where}<question>\n${question.text}\n</question>\n\n${RULES_REMINDER}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The pages `answer` links to, in the order given (with a locale prefix,
 * the site origin or a #section allowed; a longer path such as
 * /core/pda/pda-derivation is not a link to /core/pda). A page the model
 * was given but did not use, as for an off-topic question, is no source.
 */
export function linkedPages<T extends { url: string }>(
  answer: string,
  pages: T[],
): T[] {
  return pages.filter((page) =>
    new RegExp(`${escapeRegExp(page.url)}/?(?![\\w/-])`).test(answer),
  );
}

// --- Upstream ----------------------------------------------------------------

function upstreamAbort(requestSignal: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromRequest = () => controller.abort(requestSignal.reason);
  if (requestSignal.aborted) abortFromRequest();
  else
    requestSignal.addEventListener("abort", abortFromRequest, { once: true });
  const timeout = () => {
    timedOut = true;
    controller.abort(
      new DOMException("Upstream request timed out", "TimeoutError"),
    );
  };
  const firstByte = setTimeout(timeout, LIMITS.firstByteMs);
  const total = setTimeout(timeout, LIMITS.totalMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    firstByte: () => clearTimeout(firstByte),
    abort: () => controller.abort(),
    cleanup: () => {
      clearTimeout(firstByte);
      clearTimeout(total);
      requestSignal.removeEventListener("abort", abortFromRequest);
    },
  };
}

/** One `data:` payload of the upstream stream (OpenAI chat.completion.chunk). */
function readChunk(data: string): {
  content: string;
  finished: boolean;
  failed: boolean;
  truncated: boolean;
} {
  const none = {
    content: "",
    finished: false,
    failed: false,
    truncated: false,
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return none;
  }
  if (!isRecord(parsed)) return none;
  if (parsed.error) return { ...none, failed: true };
  const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
  if (!isRecord(choice)) return none;
  // reasoning_content / reasoning_details are the model thinking: never shown.
  const delta = isRecord(choice.delta) ? choice.delta : {};
  const reason = choice.finish_reason;
  return {
    content: typeof delta.content === "string" ? delta.content : "",
    finished: typeof reason === "string" && reason !== "" && reason !== "error",
    failed: reason === "error",
    // Cut off at max_tokens: it ends like a finished answer, but is not one.
    truncated: reason === "length",
  };
}

type RelayResult = {
  /** `[DONE]` or a finish_reason arrived. */
  finished: boolean;
  failed: boolean;
  /** The model stopped at max_tokens (finish_reason "length"). */
  truncated: boolean;
  chars: number;
  firstDeltaAt: number | null;
};

/** Reads the upstream stream, passing each read's answer text to `onText`. */
async function relayAnswer(
  body: ReadableStream<Uint8Array>,
  abort: ReturnType<typeof upstreamAbort>,
  onText: (text: string) => void,
): Promise<RelayResult> {
  const result: RelayResult = {
    finished: false,
    failed: false,
    truncated: false,
    chars: 0,
    firstDeltaAt: null,
  };
  const reader = body.getReader();
  // A cancelled read resolves as done, so a timeout or a reader leaving
  // ends the loop below even when fetch ignores the signal.
  const stop = () => void reader.cancel().catch(() => undefined);
  if (abort.signal.aborted) stop();
  else abort.signal.addEventListener("abort", stop, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let firstByte = true;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (firstByte) {
        firstByte = false;
        abort.firstByte();
      }
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      let text = "";
      let end = done;
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          result.finished = true;
          end = true;
          break;
        }
        const chunk = readChunk(data);
        text += chunk.content;
        if (chunk.finished) result.finished = true;
        if (chunk.truncated) result.truncated = true;
        if (chunk.failed) {
          result.failed = true;
          end = true;
          break;
        }
      }
      // One delta per read, so token-sized chunks that arrive together go out together.
      if (text) {
        result.chars += text.length;
        result.firstDeltaAt ??= nowMs();
        onText(text);
      }
      if (end) break;
    }
  } catch {
    result.failed = true;
  } finally {
    abort.signal.removeEventListener("abort", stop);
    stop();
  }
  return result;
}

/** No "assistant": earlier turns go inside the question (previousTurns). */
type ChatMessage = { role: "system" | "user"; content: string };

/**
 * Starts the model's answer. Returns the streaming upstream response, or
 * the response to send instead: upstream statuses are mapped (a 401/403 is
 * about our key, not the reader's session, so it must not reach the client
 * as one) and their bodies are never read.
 */
async function callModel(
  config: NousConfig,
  messages: ChatMessage[],
  abort: ReturnType<typeof upstreamAbort>,
  requestSignal: AbortSignal,
): Promise<
  | { ok: true; body: ReadableStream<Uint8Array>; status: number }
  | { ok: false; response: Response }
> {
  const startedAt = nowMs();
  let upstream: Response;
  try {
    upstream = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        temperature: 0.2,
        max_tokens: LIMITS.maxTokens,
        // GLM thinks before it answers by default: about 3 s more before
        // the first word, spent from max_tokens. The excerpts ground it.
        reasoning: { enabled: false },
        messages,
      }),
      cache: "no-store",
      redirect: "manual",
      signal: abort.signal,
    });
  } catch {
    abort.cleanup();
    // The reader left: the request was aborted, or (once the stream has
    // started) the stream was cancelled.
    if (requestSignal.aborted || (abort.signal.aborted && !abort.timedOut())) {
      return { ok: false, response: new Response(null, { status: 499 }) };
    }
    const timedOut = abort.timedOut();
    console.error("[ask/nous] upstream request failed", {
      timedOut,
      ms: Math.round(nowMs() - startedAt),
    });
    return {
      ok: false,
      // Not "too long": the client reads that wording as a long question.
      response: timedOut
        ? askError(504, "ask_timeout", "Ask AI timed out.")
        : askError(502, "ask_unavailable", UNAVAILABLE),
    };
  }
  if (upstream.ok && upstream.body) {
    return { ok: true, body: upstream.body, status: upstream.status };
  }
  abort.cleanup();
  await upstream.body?.cancel().catch(() => undefined);
  console.warn("[ask/nous] upstream refused", {
    status: upstream.status,
    ms: Math.round(nowMs() - startedAt),
  });
  return {
    ok: false,
    response:
      upstream.status === 429
        ? askError(
            429,
            "rate_limited",
            "Ask AI is busy. Try again in a minute.",
            {
              "Retry-After": "60",
            },
          )
        : askError(503, "ask_unavailable", UNAVAILABLE),
  };
}

type ModelCall = Awaited<ReturnType<typeof callModel>>;

type Outcome =
  | "done"
  | "incomplete"
  | "length"
  | "empty"
  | "failed"
  | "timeout"
  | "aborted"
  /** The gateway refused the answer after a template visual went out. */
  | "refused";

const NOTHING_RELAYED: RelayResult = {
  finished: false,
  failed: false,
  truncated: false,
  chars: 0,
  firstDeltaAt: null,
};

/** How the answer gets its visual (see planVisual). */
type VisualPlan =
  | { mode: "none" }
  | { mode: "template" | "cache"; name: string; ui: AskGenerativeUi }
  | { mode: "llm"; key: string; call: VisualCall };

/** For the log line: what happened to the visual, and what it cost. */
type VisualReport = {
  plan: string;
  outcome: VisualOutcome | "template" | "cache" | "late" | null;
  ms: number | null;
  holdMs: number;
  usage: VisualUsage | null;
  retracted: boolean;
};

/** What the stream needs once the answer text is complete. */
type Completion = {
  /** Text to add to the answer (the code question), or "". */
  extra: string;
  /** False for a decline: no visual, no follow-ups. */
  grounded: boolean;
  /** The done payload (with the final `response`), without generative_ui. */
  payload: Record<string, unknown>;
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Our SSE stream for the model's answer: status, a template visual, a
 * delta per upstream read (a model visual as soon as it validates), then
 * done (built from the whole answer), an error event, or (when the
 * upstream stream was cut, or the model hit max_tokens) nothing, which the
 * client reports as incomplete and does not cache. The client stops
 * reading at done, so a visual still being written gets up to
 * LIMITS.visualGraceMs after the text. A template visual can go out before
 * the gateway has answered (see nousChat): if it then refuses, the visual
 * is withdrawn and the refusal sent as an error event.
 */
function answerStream(options: {
  upstream: Promise<ModelCall>;
  abort: ReturnType<typeof upstreamAbort>;
  requestSignal: AbortSignal;
  visual: VisualPlan;
  complete: (answer: string) => Completion;
  onVisual: (ui: AskGenerativeUi) => void;
  onEnd: (outcome: Outcome, result: RelayResult, visual: VisualReport) => void;
}): ReadableStream<Uint8Array> {
  const { abort, requestSignal, visual } = options;
  let open = true;
  let finished = false;
  let settled = visual.mode !== "llm";
  let shown: AskGenerativeUi | null = null;
  const report: VisualReport = {
    plan: visual.mode === "template" ? `template:${visual.name}` : visual.mode,
    outcome: null,
    ms: null,
    holdMs: 0,
    usage: null,
    retracted: false,
  };
  const stopVisual = () => {
    if (visual.mode === "llm") visual.call.abort();
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(sseEvent(event, data));
        } catch {
          open = false;
          abort.abort();
          stopVisual();
        }
      };
      const close = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the reader.
        }
      };
      // As the agent does for its uncited fallback: no visual beside a
      // decline (or an error).
      const withdraw = () => {
        if (!shown) return;
        send("ui_done", { generative_ui: null, discarded: true });
        shown = null;
        report.retracted = true;
      };
      send("status", { stage: "searching_docs" });
      if (visual.mode === "template" || visual.mode === "cache") {
        // A known shape goes out before the first word, as the agent's do.
        send("ui_status", { stage: "building_visual" });
        send("ui_done", { generative_ui: visual.ui });
        shown = visual.ui;
        report.outcome = visual.mode;
      }
      const upstream = await options.upstream;
      if (!upstream.ok) {
        finished = true;
        stopVisual();
        withdraw();
        // Our own error body (callModel), never the gateway's.
        const { status } = upstream.response;
        const error =
          status === 499
            ? null
            : await upstream.response.json().catch(() => null);
        if (error) send("error", error);
        options.onEnd(
          status === 499 || requestSignal.aborted || !open
            ? "aborted"
            : "refused",
          NOTHING_RELAYED,
          report,
        );
        close();
        return;
      }
      const pending =
        visual.mode === "llm"
          ? visual.call.result.then((result) => {
              settled = true;
              report.outcome = result.outcome;
              report.ms = result.ms;
              report.usage = result.usage;
              if (!result.ui || finished) return;
              send("ui_done", { generative_ui: result.ui });
              shown = result.ui;
              options.onVisual(result.ui);
            })
          : null;

      let answer = "";
      const result = await relayAnswer(upstream.body, abort, (text) => {
        answer += text;
        send("delta", { text });
      });
      abort.cleanup();
      const outcome: Outcome =
        requestSignal.aborted || !open
          ? "aborted"
          : abort.timedOut()
            ? "timeout"
            : result.failed
              ? "failed"
              : result.chars === 0
                ? "empty"
                : result.truncated
                  ? "length"
                  : result.finished
                    ? "done"
                    : "incomplete";
      if (outcome === "done") {
        const end = options.complete(answer);
        if (end.extra) send("delta", { text: end.extra });
        if (pending && !settled) {
          send("ui_status", { stage: "building_visual" });
          const holdStart = nowMs();
          await Promise.race([
            pending,
            delay(LIMITS.visualGraceMs, requestSignal),
          ]);
          report.holdMs = Math.round(nowMs() - holdStart);
        }
        finished = true;
        if (!settled) report.outcome = "late";
        stopVisual();
        if (!end.grounded) withdraw();
        send("done", { ...end.payload, generative_ui: shown });
      } else {
        finished = true;
        stopVisual();
        if (outcome === "timeout") {
          send("error", {
            error: "ask_timeout",
            message: "Ask AI timed out before finishing the answer.",
          });
        } else if (outcome === "failed" || outcome === "empty") {
          send("error", {
            error: "ask_failed",
            message: "Ask AI stopped before finishing the answer.",
          });
        }
      }
      options.onEnd(outcome, result, report);
      close();
    },
    cancel() {
      // The reader left: stop the model (and the visual) too.
      open = false;
      abort.abort();
      stopVisual();
    },
  });
}

/** Validated model visuals by question, intent and docs, per instance. */
const VISUAL_CACHE = new Map<string, AskGenerativeUi>();
const VISUAL_CACHE_SIZE = 100;

/** A hash, so the cache holds no reader's words. */
function visualCacheKey(
  question: string,
  intent: VisualIntent,
  pages: DocsExcerpt[],
): string {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@/.\-\s]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update(
      [intent, words, ...pages.slice(0, 4).map((page) => page.url)].join("\n"),
    )
    .digest("hex");
}

function rememberVisual(key: string, ui: AskGenerativeUi) {
  VISUAL_CACHE.delete(key);
  VISUAL_CACHE.set(key, ui);
  if (VISUAL_CACHE.size > VISUAL_CACHE_SIZE) {
    VISUAL_CACHE.delete(VISUAL_CACHE.keys().next().value as string);
  }
}

/** ASK_NOUS_VISUALS: "off", "templates" (no model call), else templates and the model. */
function visualsSetting(): "off" | "templates" | "llm" {
  const value = process.env.ASK_NOUS_VISUALS?.trim().toLowerCase();
  return value === "off" || value === "templates" ? value : "llm";
}

/**
 * The visual for a question, as the docs agent picks it: none for code
 * explanations, comparisons, unclear questions or when no docs matched (an
 * off-topic question); a template when one fits; else a model call,
 * started now so it runs beside the answer.
 */
function planVisual(
  config: NousConfig,
  question: AskQuestion,
  intent: VisualIntent,
  docs: GatheredDocs,
  signal: AbortSignal,
): VisualPlan {
  const { pages } = docs;
  const setting = visualsSetting();
  if (
    setting === "off" ||
    question.code ||
    pages.length === 0 ||
    !wantsVisual(intent)
  ) {
    return { mode: "none" };
  }
  const template = templateFor(
    question.prose,
    intent,
    workflowFor(question.prose),
    // Not search hits: those match titles loosely.
    docs.pinned.map((page) => page.title),
  );
  if (template) {
    return { mode: "template", name: template.name, ui: template.ui };
  }
  if (setting !== "llm") return { mode: "none" };
  const key = visualCacheKey(question.prose, intent, pages);
  const cached = VISUAL_CACHE.get(key);
  if (cached) return { mode: "cache", name: "cache", ui: cached };
  return {
    mode: "llm",
    key,
    call: startVisualCall(
      config,
      { question: question.text, intent, pages },
      signal,
    ),
  };
}

type NousOptions = {
  /** Passed to the mock for `mock:` questions; tests use 0. */
  delayScale?: number;
};

async function nousChat(
  request: Request,
  config: NousConfig,
  options: NousOptions,
): Promise<Response> {
  const startedAt = nowMs();
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const body = isRecord(read.value) ? read.value : {};

  if (!isSessionToken(body.session_token)) {
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

  // A script can send any Origin and session token: BotId (this path is
  // registered in instrumentation-client.ts) is what tells a browser from
  // it. Before the limits, so bots fill no limiter buckets. Fails closed:
  // off Vercel, a production build's checkBotId throws (dev answers human).
  const human = await checkBotId().then(
    (verdict) => !verdict.isBot,
    () => false,
  );
  if (!human) {
    return askError(403, "bot", "This request is not allowed.");
  }
  if (!withinRateLimit(request)) return RATE_LIMITED();
  const limited = await wafRateLimit(request);
  if (limited) return limited;

  if (MOCK_TRIGGER.test(message)) {
    // Review triggers (mock:error, mock:429, "mock:visual token") keep working.
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return mockAskRequest(
      new Request(request.url, {
        method: "POST",
        headers,
        body: read.text,
        signal: request.signal,
      }),
      ["chat"],
      { acceptSession: isSessionToken, delayScale: options.delayScale },
    );
  }

  const history = readHistory(body.history);
  const pageUrl = typeof body.page_url === "string" ? body.page_url : undefined;
  const question = readQuestion(message, pageUrl);
  const previous = history.findLast((turn) => turn.role === "user");
  const previousProse = previous ? readQuestion(previous.content).prose : "";
  const guidance = guidanceFor(question.prose, previousProse);
  const reference = errorReference(question.text);
  const docs = await gatherDocs(
    question,
    pageUrl,
    history,
    reference?.docs ?? [],
  );
  // The pages a guidance pack lists: the answer may link them as the docs.
  const guidePages = guidanceLinks(question.prose, previousProse).flatMap(
    (url) => pageRef(url) ?? [],
  );
  const retrievalMs = nowMs() - startedAt;

  const abort = upstreamAbort(request.signal);
  let upstreamStatus: number | null = null;
  let upstreamMs: number | null = null;
  // The answer's request goes first (it is what the reader waits for); a
  // model visual starts right after it, so the two overlap.
  const answering = callModel(
    config,
    [
      { role: "system", content: NOUS_SYSTEM_PROMPT },
      {
        role: "user",
        content: promptFor({ question, docs, history, guidance, reference }),
      },
    ],
    abort,
    request.signal,
  ).then((call) => {
    upstreamStatus = call.ok ? call.status : call.response.status;
    upstreamMs = nowMs() - startedAt - retrievalMs;
    return call;
  });
  const intent = visualIntent(question.prose);
  const visual = planVisual(config, question, intent, docs, request.signal);
  // A template (or remembered) visual goes out now, before the gateway
  // answers, as the agent sends its templates right after retrieval; a
  // refusal then arrives as an error event. Without one, a refusal keeps
  // its HTTP status.
  const early = visual.mode === "template" || visual.mode === "cache";
  if (!early) {
    const upstream = await answering;
    if (!upstream.ok) {
      if (visual.mode === "llm") visual.call.abort();
      return upstream.response;
    }
  }

  const priorId = toId(body.conversation_id);
  // A page can be both read and listed by a pack: cite it once.
  const linkableUrls = new Set<string>();
  const linkable: AskCitation[] = [
    ...docs.pages,
    ...(reference?.sources ?? []),
    ...guidePages,
  ].filter(
    ({ url }) => !linkableUrls.has(url) && Boolean(linkableUrls.add(url)),
  );
  const context = docs.pages.map((page) => page.text).join("\n");
  const languages = [...new Set(docs.pages.flatMap((page) => page.languages))];
  let cited = 0;
  let deadLinks = 0;
  let codeButtons = 0;
  let suggestions = 0;
  const complete = (answer: string): Completion => {
    const declined = DECLINE.test(answer);
    // As the agent: made-up docs links lose their link, and the code
    // question is added when the model left it out. `response` (which the
    // client shows from done) also moves the question to the end, or drops
    // it from a decline; `extra` streams what is added.
    const links = sanitizeDocsLinks(
      answer,
      (path) => resolveUrl(path) !== null,
    );
    deadLinks = links.removed;
    // The pages it was given that it links, then other real docs pages it
    // links (a sibling of a page it read), so Sources lists what it used.
    const given = linkedPages(answer, linkable);
    const givenUrls = new Set(given.map(({ url }) => url));
    const others = docsLinkPaths(links.answer).flatMap((path) => {
      const page = pageRef(path);
      if (!page || givenUrls.has(page.url)) return [];
      givenUrls.add(page.url);
      return [page];
    });
    const citations = declined
      ? []
      : [...given, ...others]
          .slice(0, LIMITS.citations)
          .map(({ title, url, breadcrumbs: crumbs }) => ({
            title,
            url,
            ...(crumbs ? { breadcrumbs: crumbs } : {}),
          }));
    // The agent swaps an uncited docs answer for its fallback; this one
    // streams, so a short answer that links nothing counts as a decline.
    const grounded =
      !declined &&
      (citations.length > 0 || answer.trim().length >= LIMITS.declineChars);
    const codeFollowups = codeFollowupsFor({
      question: question.prose,
      answer,
      context,
      languages,
      grounded,
      aboutCode: question.code,
      citations,
    });
    // A closing "Sources:" list repeats the panel's Sources: it goes.
    const body = withoutSourceList(
      finalAnswer(links.answer, false),
      citations.map(({ url }) => url),
    );
    const response = finalAnswer(body, codeFollowups !== null);
    const streamed = answer.trim();
    const extra = response.startsWith(streamed)
      ? response.slice(streamed.length)
      : "";
    const suggested = grounded
      ? suggestFollowups({
          question: question.prose,
          answer,
          pages: docs.pages,
          citations,
          topics: docs.topics,
        })
      : null;
    cited = citations.length;
    codeButtons = codeFollowups?.buttons.length ?? 0;
    suggestions = suggested?.buttons.length ?? 0;
    return {
      extra,
      grounded,
      payload: {
        run_id: randomId(),
        conversation_id:
          priorId && /^\d{1,15}$/.test(priorId) ? Number(priorId) : randomId(),
        response,
        citations,
        code_followups: codeFollowups,
        suggested_followups: suggested,
      },
    };
  };

  const stream = answerStream({
    upstream: answering,
    abort,
    requestSignal: request.signal,
    visual,
    complete,
    onVisual: (ui) => {
      if (visual.mode === "llm") rememberVisual(visual.key, ui);
    },
    onEnd: (outcome, result, report) => {
      // Counts and timings only: never the question, answer or upstream detail.
      console.info("[ask/nous] chat", {
        status: upstreamStatus,
        outcome,
        intent,
        pages: docs.pages.length,
        cited,
        deadLinks,
        codeButtons,
        suggestions,
        guidance: guidance.length > 0,
        errorReference: reference !== null,
        history: history.length,
        retrievalMs: Math.round(retrievalMs),
        upstreamHeaderMs: upstreamMs === null ? null : Math.round(upstreamMs),
        firstDeltaMs:
          result.firstDeltaAt === null
            ? null
            : Math.round(result.firstDeltaAt - startedAt),
        totalMs: Math.round(nowMs() - startedAt),
        chars: result.chars,
        visual: report.plan,
        visualOutcome: report.outcome,
        visualMs: report.ms,
        visualHoldMs: report.holdMs,
        visualInputTokens: report.usage?.input ?? null,
        visualOutputTokens: report.usage?.output ?? null,
        visualCachedTokens: report.usage?.cached ?? null,
        visualRetracted: report.retracted,
      });
    },
  });
  const timing = [`ask_retrieval;dur=${Math.round(retrievalMs)}`];
  if (upstreamMs !== null)
    timing.push(`ask_upstream;dur=${Math.round(upstreamMs)}`);
  return new Response(stream, {
    headers: { ...SSE_HEADERS, "Server-Timing": timing.join(", ") },
  });
}

async function nousSearch(request: Request): Promise<Response> {
  const query =
    new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const results = query ? await searchPages(query) : [];
  return Response.json(
    { results: results.slice(0, 8) },
    { headers: NO_STORE_HEADERS },
  );
}

/** Answers one /api/ask request from the Nous gateway. */
export async function nousAskRequest(
  request: Request,
  path: string[],
  options: NousOptions = {},
): Promise<Response> {
  const config = nousConfig();
  // No detail: the reader only needs to know it is unavailable.
  if (!config) return askError(503, "ask_not_configured");

  const method = askRouteMethod(path);
  if (!method) return askError(404, "not_found");
  if (request.method !== method) {
    return askError(405, "method_not_allowed", undefined, { Allow: method });
  }
  if (
    !isSameOriginBrowserRequest(request, {
      allowRefererFallback: method === "GET",
    })
  ) {
    return askError(403, "invalid_origin", "This request is not allowed.");
  }

  switch (path[0]) {
    case "session":
      return Response.json(
        { session_token: `ask-${crypto.randomUUID()}` },
        { headers: NO_STORE_HEADERS },
      );
    case "chat":
      return nousChat(request, config, options);
    case "feedback": {
      // Accepted and dropped: there is nowhere to record it.
      const read = await readJsonBody(request);
      if (!read.ok) return read.response;
      return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
    }
    case "search":
      return nousSearch(request);
    default:
      // runs/:id, conversations/:id: nothing is stored.
      return askError(404, "not_found");
  }
}
