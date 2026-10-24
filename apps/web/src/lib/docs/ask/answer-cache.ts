/**
 * Short-lived sessionStorage cache of first-turn answers, so asking the same
 * question again in a tab (a suggestion clicked twice, the same code block)
 * answers at once. Unlike Bri's cache:
 * - the key includes the locale and the attached page, so the same words
 *   about different pages are different entries;
 * - entries are written only after a real `done` on a first turn (see
 *   client.ts), never for truncated streams or follow-ups.
 */
import { ASK_STORAGE_KEYS } from "./config";
import {
  isAskGenerativeUi,
  isRecord,
  normalizeCitations,
  normalizeCodeFollowups,
  toId,
  type AskCitation,
  type AskGenerativeUi,
  type CodeFollowups,
} from "./protocol";

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 12;

export type CachedAnswer = {
  key: string;
  createdAt: number;
  content: string;
  citations: AskCitation[];
  generativeUi: AskGenerativeUi | null;
  codeFollowups: CodeFollowups | null;
  /** The original run, so feedback on a replay rates the same answer. */
  runId: string | null;
  /** The original conversation, so a follow-up keeps the first turn's context. */
  conversationId: string | null;
};

/** Cache key, or null for an empty question. */
export function answerCacheKey(options: {
  message: string;
  locale?: string | null;
  pageUrl?: string | null;
}): string | null {
  const message = options.message.trim().toLowerCase().replace(/\s+/g, " ");
  if (!message) return null;
  return [options.locale || "en", options.pageUrl || "", message].join("\n");
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeEntry(value: unknown): CachedAnswer | null {
  if (!isRecord(value)) return null;
  const key = typeof value.key === "string" && value.key ? value.key : null;
  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : null;
  const content = typeof value.content === "string" ? value.content : "";
  const generativeUi = isAskGenerativeUi(value.generativeUi)
    ? value.generativeUi
    : null;
  if (!key || !createdAt || (!content.trim() && !generativeUi)) return null;
  return {
    key,
    createdAt,
    content,
    citations: normalizeCitations(value.citations),
    generativeUi,
    codeFollowups: normalizeCodeFollowups(value.codeFollowups),
    runId: toId(value.runId),
    conversationId: toId(value.conversationId),
  };
}

function readEntries(): CachedAnswer[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(
      store.getItem(ASK_STORAGE_KEYS.answers) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .flatMap((item) => {
        const entry = normalizeEntry(item);
        return entry && now - entry.createdAt <= TTL_MS ? [entry] : [];
      })
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeEntries(entries: CachedAnswer[]) {
  try {
    storage()?.setItem(ASK_STORAGE_KEYS.answers, JSON.stringify(entries));
  } catch {
    // Storage can be unavailable or full; the cache is optional.
  }
}

export function readCachedAnswer(key: string): CachedAnswer | null {
  return readEntries().find((entry) => entry.key === key) ?? null;
}

export function writeCachedAnswer(
  answer: Omit<CachedAnswer, "createdAt">,
): void {
  if (!answer.content.trim() && !answer.generativeUi) return;
  const entries = readEntries().filter((entry) => entry.key !== answer.key);
  writeEntries(
    [{ ...answer, createdAt: Date.now() }, ...entries].slice(0, MAX_ENTRIES),
  );
}

export function clearAnswerCache(): void {
  try {
    storage()?.removeItem(ASK_STORAGE_KEYS.answers);
  } catch {
    // ignore
  }
}
