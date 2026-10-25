/**
 * The one Ask AI store: panel state (open, layout, width) and the single
 * conversation every entry point shares. Plain TypeScript with a
 * subscribe/getState pair for `useSyncExternalStore` (see ./use-ask.ts).
 *
 * - Nothing touches `window` at import. The store starts on its first
 *   subscriber or action; on a prerendered page it waits for
 *   `prerenderingchange` before reading storage or touching <html>.
 * - The conversation lives in sessionStorage (it survives reloads and the
 *   full-page /developers ↔ docs hop); open/full screen in sessionStorage;
 *   the docked width in localStorage.
 * - Layout is derived: full screen when asked for, else docked from 1280px
 *   and an overlay below. While open, <html> carries data-ask="<layout>"
 *   and --ask-w (the docked width), which the docs layouts use to make
 *   room for the panel; ./config.ts DOCS_ASK_PREPAINT_SCRIPT sets the same
 *   before paint.
 * - A question that arrives while an answer is streaming is queued, not
 *   dropped.
 * - A question goes out as the reader's words; the page it is about goes
 *   in `page_url` / `page_title`, and the server builds any prefix.
 */
import {
  DOCS_ASK_OPEN_ATTR,
  DOCS_ASK_OPEN_EVENT,
  type AskAiOpenOptions,
} from "../ask-ai";
import { streamChat, sendFeedback, warmAskSession } from "./client";
import {
  ASK_DOCK_MIN_VIEWPORT,
  ASK_HISTORY_LIMITS,
  ASK_MAX_CODE_CHARS,
  ASK_MAX_MESSAGE_CHARS,
  ASK_MAX_STORED_MESSAGES,
  ASK_PANEL_WIDTH,
  ASK_STORAGE_KEYS,
  isPrerendering,
} from "./config";
import {
  currentLocale,
  currentPageTitle,
  isAskPageContext,
  readPageContext,
  type AskPageContext,
} from "./page-context";
import {
  advanceAskStatus,
  askStatusForStage,
  isRecord,
  normalizeCitations,
  normalizeCodeFollowups,
  normalizeSuggestedFollowups,
  toAskGenerativeUi,
  toId,
  type AskCitation,
  type AskErrorKind,
  type AskGenerativeUi,
  type AskHistoryTurn,
  type AskStatus,
  type AskSuggestedFollowups,
  type CodeFollowups,
} from "./protocol";

export { DOCS_ASK_PREPAINT_SCRIPT } from "./config";
export type { AskPageContext } from "./page-context";
export type {
  AskCitation,
  AskErrorKind,
  AskGenerativeUi,
  AskStatus,
  AskSuggestedFollowup,
  AskSuggestedFollowups,
  CodeFollowupButton,
  CodeFollowups,
} from "./protocol";

export type AskLayout = "docked" | "overlay" | "fullscreen";
export type AskRating = "up" | "down";

export type AskUserMessage = {
  id: string;
  role: "user";
  /** What the panel shows: the reader's words, or a code block's prompt and code. */
  text: string;
  /** The page attached with "Ask about this page", shown above the message. */
  pageContext?: AskPageContext;
  /**
   * The page a code block's code came from: sent as page_url without its
   * title (the agent's router answers titles), so the answer reads it.
   */
  pageUrl?: string;
  /**
   * The question as sent, when it differs from `text`: a code block's Ask
   * shows "Explain this code from {title}:" but sends the code without the
   * title, which the agent's router would answer with a canned template.
   */
  sent?: string;
};

export type AskAssistantMessage = {
  id: string;
  role: "assistant";
  /**
   * pending: nothing received yet; streaming: text or a visual arriving;
   * done; error (see `error`); stopped: the reader pressed Stop.
   */
  state: "pending" | "streaming" | "done" | "error" | "stopped";
  /** Markdown, including the Summary / Indepth headings (see splitAnswerSections). */
  text: string;
  /** Status row while pending or streaming. */
  status?: AskStatus;
  /** Visual; may arrive before the text is finished. */
  ui?: AskGenerativeUi;
  citations: AskCitation[];
  codeFollowups: CodeFollowups | null;
  /** "Want to keep going?" questions from `done`, shown after the code follow-ups. */
  suggestedFollowups: AskSuggestedFollowups | null;
  /** Null hides the rating buttons. */
  runId: string | null;
  error?: AskErrorKind;
  rating?: AskRating;
};

export type AskMessage = AskUserMessage | AskAssistantMessage;

export type AskState = {
  /** False until stored state is read (server render, prerendering). */
  hydrated: boolean;
  open: boolean;
  /** Current layout; "fullscreen" only while open. */
  layout: AskLayout;
  /** Layout to return to from full screen (by viewport width). */
  prevLayout: "docked" | "overlay";
  /** Docked width in px, clamped to [widthMin, widthMax]. */
  width: number;
  widthMin: number;
  /** min(720, half the viewport); changes with the window. */
  widthMax: number;
  messages: AskMessage[];
  conversationId: string | null;
  /** An answer is streaming (the composer shows Stop). */
  busy: boolean;
  /** Questions waiting for the current answer to finish. */
  queued: number;
  /** Page attached to the next question (composer chip). */
  pageContext: AskPageContext | null;
  composerDraft: string;
  /** Increments whenever the composer should take focus. */
  focusRequest: number;
};

export type AskOpenOptions = {
  /** Code from a code block: asks the explainCode prompt about it. */
  code?: string;
  /** The code block's language, kept on the fence. */
  language?: string;
  /** A question to send at once (e.g. from the search hand-off). */
  question?: string;
  /** Attach this page (or the given page) to the composer; does not send. */
  aboutPage?: boolean | AskPageContext;
};

export type AskSendOptions = {
  /**
   * Page to ask about. Defaults to the attached page (`pageContext`), which
   * is then cleared; pass null to send without one.
   */
  pageContext?: AskPageContext | null;
};

export type AskSendResult =
  | { ok: true; queued: boolean }
  | { ok: false; reason: "empty" | "tooLong" };

/** Localized prompt builders; the UI root sets them from `docsAsk.prompts`. */
export type AskPrompts = {
  /** Shown above a code block's code (the question's heading). */
  explainCode: (title: string) => string;
  /** Sent with a code block's code: no page title (see AskUserMessage.sent). */
  explainCodeSent: () => string;
  /** Prefixes an earlier about-page question in `history` (review backends). */
  aboutPage: (page: AskPageContext) => string;
};

const DEFAULT_PROMPTS: AskPrompts = {
  explainCode: (title) => `Explain this code from ${title}:`,
  explainCodeSent: () => "Explain this code:",
  aboutPage: ({ title, url }) =>
    `Question about the docs page “${title}” (${url}):`,
};

type Core = {
  hydrated: boolean;
  open: boolean;
  fullscreen: boolean;
  /** Width the reader chose; `width` is this clamped to the viewport. */
  preferredWidth: number;
  wide: boolean;
  viewportWidth: number;
  messages: AskMessage[];
  conversationId: string | null;
  busy: boolean;
  pageContext: AskPageContext | null;
  composerDraft: string;
  focusRequest: number;
};

type QueuedQuestion = {
  text: string;
  pageContext: AskPageContext | null;
  sent?: string;
  /** A code block's page (AskUserMessage.pageUrl). */
  pageUrl?: string;
};

function initialCore(): Core {
  return {
    hydrated: false,
    open: false,
    fullscreen: false,
    preferredWidth: ASK_PANEL_WIDTH.default,
    wide: false,
    viewportWidth: 0,
    messages: [],
    conversationId: null,
    busy: false,
    pageContext: null,
    composerDraft: "",
    focusRequest: 0,
  };
}

let core = initialCore();
let queue: QueuedQuestion[] = [];
let prompts = DEFAULT_PROMPTS;
let started = false;
let controller: AbortController | null = null;
let activeId: string | null = null;
let threadSaveTimer: ReturnType<typeof setTimeout> | null = null;
let widthSaveTimer: ReturnType<typeof setTimeout> | null = null;
let appliedHtml: string | null = null;
let teardown: Array<() => void> = [];
const listeners = new Set<() => void>();

function widthMaxFor(viewportWidth: number): number {
  if (viewportWidth <= 0) return ASK_PANEL_WIDTH.max;
  return Math.max(
    ASK_PANEL_WIDTH.min,
    Math.min(ASK_PANEL_WIDTH.max, Math.floor(viewportWidth / 2)),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function derive(c: Core): AskState {
  const base = c.wide ? "docked" : "overlay";
  const widthMax = widthMaxFor(c.viewportWidth);
  return {
    hydrated: c.hydrated,
    open: c.open,
    layout: c.open && c.fullscreen ? "fullscreen" : base,
    prevLayout: base,
    width: clamp(Math.round(c.preferredWidth), ASK_PANEL_WIDTH.min, widthMax),
    widthMin: ASK_PANEL_WIDTH.min,
    widthMax,
    messages: c.messages,
    conversationId: c.conversationId,
    busy: c.busy,
    queued: queue.length,
    pageContext: c.pageContext,
    composerDraft: c.composerDraft,
    focusRequest: c.focusRequest,
  };
}

const SERVER_STATE = derive(initialCore());
let snapshot = SERVER_STATE;

/** Applies `patch`, publishes a new snapshot, and syncs <html> and storage. */
function commit(
  patch: Partial<Core> = {},
  options: { saveThread?: "now" | "soon" } = {},
) {
  const prevOpen = core.open;
  const prevFullscreen = core.fullscreen;
  core = { ...core, ...patch };
  snapshot = derive(core);
  syncHtml();
  if (core.hydrated) {
    if (prevOpen !== core.open || prevFullscreen !== core.fullscreen) saveUi();
    if (options.saveThread) saveThread(options.saveThread === "now");
  }
  for (const listener of listeners) listener();
}

function updateMessage(
  id: string,
  update: (message: AskAssistantMessage) => AskAssistantMessage,
  options?: { saveThread?: "now" | "soon" },
) {
  let changed = false;
  const messages = core.messages.map((message) => {
    if (message.id !== id || message.role !== "assistant") return message;
    const next = update(message);
    changed ||= next !== message;
    return next;
  });
  if (changed)
    commit({ messages }, { saveThread: options?.saveThread ?? "soon" });
}

// --- <html> sync -----------------------------------------------------------

function syncHtml() {
  // Before hydration the prepaint script's attributes stand.
  if (!core.hydrated || typeof document === "undefined") return;
  const key = core.open ? `${snapshot.layout}:${snapshot.width}` : "";
  if (key === appliedHtml) return;
  appliedHtml = key;
  const root = document.documentElement;
  if (core.open) {
    root.setAttribute("data-ask", snapshot.layout);
    root.style.setProperty("--ask-w", `${snapshot.width}px`);
  } else {
    root.removeAttribute("data-ask");
    root.style.removeProperty("--ask-w");
  }
}

// --- Storage ---------------------------------------------------------------

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(storage: Storage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the panel still works for this page.
  }
}

function saveUi() {
  writeJson(session(), ASK_STORAGE_KEYS.ui, {
    open: core.open,
    fullscreen: core.fullscreen,
  });
}

function saveThread(now: boolean) {
  if (threadSaveTimer) clearTimeout(threadSaveTimer);
  threadSaveTimer = null;
  const write = () => {
    threadSaveTimer = null;
    writeJson(session(), ASK_STORAGE_KEYS.thread, {
      messages: core.messages.slice(-ASK_MAX_STORED_MESSAGES),
      conversationId: core.conversationId,
    });
  };
  // Streaming changes the thread many times a second; batch those writes.
  if (now) write();
  else threadSaveTimer = setTimeout(write, 300);
}

function flushThread() {
  if (threadSaveTimer) saveThread(true);
}

function restoreMessage(value: unknown): AskMessage | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" && value.id ? value.id : null;
  if (!id) return null;
  if (value.role === "user") {
    if (typeof value.text !== "string" || !value.text.trim()) return null;
    return {
      id,
      role: "user",
      text: value.text,
      ...(isAskPageContext(value.pageContext)
        ? { pageContext: value.pageContext }
        : {}),
      ...(typeof value.sent === "string" && value.sent.trim()
        ? { sent: value.sent }
        : {}),
      ...(typeof value.pageUrl === "string" &&
      /^https?:\/\//.test(value.pageUrl)
        ? { pageUrl: value.pageUrl }
        : {}),
    };
  }
  if (value.role !== "assistant") return null;
  const states = ["pending", "streaming", "done", "error", "stopped"] as const;
  const saved = states.find((state) => state === value.state) ?? "error";
  // An answer that was still arriving when the page unloaded did not finish.
  const interrupted = saved === "pending" || saved === "streaming";
  const errors: AskErrorKind[] = [
    "generic",
    "rateLimited",
    "unavailable",
    "incomplete",
    "tooLong",
    "conversationFull",
    "offline",
    "busy",
  ];
  const ui = toAskGenerativeUi(value.ui);
  const error = interrupted
    ? "incomplete"
    : (errors.find((kind) => kind === value.error) ??
      (saved === "error" ? "generic" : undefined));
  return {
    id,
    role: "assistant",
    state: interrupted ? "error" : saved,
    text: typeof value.text === "string" ? value.text : "",
    ...(ui ? { ui } : {}),
    citations: normalizeCitations(value.citations),
    codeFollowups: normalizeCodeFollowups(value.codeFollowups),
    suggestedFollowups: normalizeSuggestedFollowups(value.suggestedFollowups),
    runId: toId(value.runId),
    ...(error ? { error } : {}),
    ...(value.rating === "up" || value.rating === "down"
      ? { rating: value.rating }
      : {}),
  };
}

function hydrate() {
  if (core.hydrated) return;
  const thread = readJson(session(), ASK_STORAGE_KEYS.thread);
  const ui = readJson(session(), ASK_STORAGE_KEYS.ui);
  const width = Number.parseInt(
    local()?.getItem(ASK_STORAGE_KEYS.width) ?? "",
    10,
  );
  const messages =
    isRecord(thread) && Array.isArray(thread.messages)
      ? thread.messages.flatMap((item) => {
          const message = restoreMessage(item);
          return message ? [message] : [];
        })
      : [];
  appliedHtml = null;
  commit({
    hydrated: true,
    // Actions taken before hydration (an early openAskAi) win over storage.
    open: core.open || (isRecord(ui) && ui.open === true),
    fullscreen: core.fullscreen || (isRecord(ui) && ui.fullscreen === true),
    preferredWidth: width > 0 ? width : core.preferredWidth,
    messages: [...messages, ...core.messages],
    conversationId:
      core.conversationId ??
      (isRecord(thread) ? toId(thread.conversationId) : null),
  });
}

// --- Start -----------------------------------------------------------------

function readViewport() {
  const viewportWidth = window.innerWidth;
  const wide =
    typeof window.matchMedia === "function"
      ? window.matchMedia(`(min-width: ${ASK_DOCK_MIN_VIEWPORT}px)`).matches
      : viewportWidth >= ASK_DOCK_MIN_VIEWPORT;
  if (wide !== core.wide || viewportWidth !== core.viewportWidth) {
    commit({ wide, viewportWidth });
  }
}

function listen(
  target: EventTarget,
  type: string,
  handler: () => void,
  options?: AddEventListenerOptions,
) {
  target.addEventListener(type, handler, options);
  teardown.push(() => target.removeEventListener(type, handler, options));
}

/** Starts the store in the browser (idempotent). */
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  readViewport();
  listen(window, "resize", readViewport);
  listen(window, "pagehide", flushThread);
  if (isPrerendering()) {
    listen(document, "prerenderingchange", hydrate, { once: true });
  } else {
    hydrate();
  }
}

// --- Conversation ------------------------------------------------------------

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${idCounter}-${random}`;
}

/** A question as the server gets it (`message`). */
function sentText(user: { text: string; sent?: string }): string {
  return user.sent ?? user.text;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The conversation's last finished turns (question and answer pairs), cut
 * to ASK_HISTORY_LIMITS, for backends that keep no memory between turns.
 */
function recentHistory(messages: AskMessage[]): AskHistoryTurn[] {
  const turns: AskHistoryTurn[] = [];
  messages.forEach((user, index) => {
    const answer = messages[index + 1];
    if (user.role !== "user" || answer?.role !== "assistant") return;
    if (answer.state !== "done" && answer.state !== "stopped") return;
    if (!answer.text.trim()) return;
    turns.push(
      {
        role: "user",
        // Earlier turns keep their page: only the current one has page_url.
        content: clip(
          user.pageContext
            ? `${prompts.aboutPage(user.pageContext)}\n\n${sentText(user)}`
            : sentText(user),
          ASK_HISTORY_LIMITS.userChars,
        ),
      },
      {
        role: "assistant",
        content: clip(answer.text, ASK_HISTORY_LIMITS.assistantChars),
      },
    );
  });
  return turns.slice(-ASK_HISTORY_LIMITS.turns);
}

function startTurn(
  question: QueuedQuestion,
  options: { retry?: boolean } = {},
) {
  const { text, pageContext, sent, pageUrl } = question;
  const history = recentHistory(core.messages);
  const user: AskUserMessage = {
    id: newId(),
    role: "user",
    text,
    ...(pageContext ? { pageContext } : {}),
    ...(sent !== undefined && sent !== text ? { sent } : {}),
    ...(pageUrl && !pageContext ? { pageUrl } : {}),
  };
  const assistant: AskAssistantMessage = {
    id: newId(),
    role: "assistant",
    state: "pending",
    status: "preparing",
    text: "",
    citations: [],
    codeFollowups: null,
    suggestedFollowups: null,
    runId: null,
  };
  const firstTurn = core.conversationId === null && core.messages.length === 0;
  const abort = new AbortController();
  controller = abort;
  activeId = assistant.id;
  commit(
    { messages: [...core.messages, user, assistant], busy: true },
    { saveThread: "now" },
  );
  const id = assistant.id;
  const live = () => activeId === id;

  void streamChat(
    {
      message: sentText(user),
      conversationId: core.conversationId,
      page: pageContext ?? (user.pageUrl ? { url: user.pageUrl } : null),
      history,
      locale: currentLocale(),
      signal: abort.signal,
      cache: firstTurn && !options.retry,
    },
    {
      onStatus: (stage) => {
        if (!live()) return;
        updateMessage(id, (m) => {
          // Forward only: reading a page after searching, or a late stage
          // once text shows, does not send the row back.
          const status = advanceAskStatus(m.status, askStatusForStage(stage));
          return status === m.status ? m : { ...m, status };
        });
      },
      onDelta: (delta) => {
        if (!live()) return;
        updateMessage(id, (m) => ({
          ...m,
          state: "streaming",
          text: m.text + delta,
          status: m.status === "visual" && !m.ui ? "visual" : "writing",
        }));
      },
      onUiStatus: () => {
        if (!live()) return;
        updateMessage(id, (m) =>
          m.ui ? m : { ...m, state: "streaming", status: "visual" },
        );
      },
      onGenerativeUi: (ui) => {
        if (!live()) return;
        updateMessage(id, (m) => ({
          ...m,
          state: "streaming",
          ui,
          status: "writing",
        }));
      },
      onGenerativeUiWithdrawn: () => {
        if (!live()) return;
        updateMessage(id, (m) => {
          if (!m.ui && m.status !== "visual") return m;
          const { ui: _withdrawn, ...rest } = m;
          return {
            ...rest,
            status: m.status === "visual" ? "writing" : m.status,
          };
        });
      },
      onConversationReset: () => {
        // The old id is stale: `done` brings the new one, and a retry
        // after a failure must not send the old one again.
        if (live()) commit({ conversationId: null }, { saveThread: "soon" });
      },
      onDone: (payload) => {
        if (!live()) return;
        finishTurn(
          id,
          (m) => ({
            ...m,
            state: "done",
            status: undefined,
            text: payload.response ?? m.text,
            ...(payload.generativeUi ? { ui: payload.generativeUi } : {}),
            citations: payload.citations,
            codeFollowups: payload.codeFollowups,
            suggestedFollowups: freshSuggestions(
              payload.suggestedFollowups,
              id,
            ),
            runId: payload.runId,
          }),
          payload.conversationId,
        );
      },
      onError: (kind) => {
        if (!live()) return;
        finishTurn(id, (m) => ({
          ...m,
          state: "error",
          status: undefined,
          error: kind,
        }));
      },
    },
  ).finally(() => {
    // streamChat always ends in onDone or onError unless aborted; this is a backstop.
    if (live()) {
      finishTurn(id, (m) => ({
        ...m,
        state: "error",
        status: undefined,
        error: "generic",
      }));
    }
  });
}

function finishTurn(
  id: string,
  update: (message: AskAssistantMessage) => AskAssistantMessage,
  conversationId?: string | null,
) {
  activeId = null;
  controller = null;
  const messages = core.messages.map((message) =>
    message.id === id && message.role === "assistant"
      ? update(message)
      : message,
  );
  commit(
    {
      messages,
      busy: false,
      conversationId: conversationId ?? core.conversationId,
    },
    { saveThread: "now" },
  );
  drainQueue();
}

/**
 * Suggestions without the ones the previous answer already offered (the
 * same topic gives the same questions turn after turn), or null when none
 * are left.
 */
function freshSuggestions(
  suggestions: AskSuggestedFollowups | null,
  answerId: string,
): AskSuggestedFollowups | null {
  if (!suggestions) return null;
  const index = core.messages.findIndex((message) => message.id === answerId);
  const previous = core.messages
    .slice(0, Math.max(index, 0))
    .findLast((message) => message.role === "assistant");
  const offered = new Set(
    previous?.role === "assistant"
      ? (previous.suggestedFollowups?.items ?? []).map((item) =>
          item.message.trim().toLowerCase(),
        )
      : [],
  );
  const items = suggestions.items.filter(
    (item) => !offered.has(item.message.trim().toLowerCase()),
  );
  if (items.length === suggestions.items.length) return suggestions;
  return items.length > 0 ? { ...suggestions, items } : null;
}

function drainQueue() {
  const next = queue.shift();
  if (next) startTurn(next);
}

// --- Actions -----------------------------------------------------------------

function open(options?: AskOpenOptions | string) {
  start();
  const opts: AskOpenOptions =
    typeof options === "string" ? { code: options } : (options ?? {});
  const page =
    opts.aboutPage === true
      ? readPageContext()
      : isAskPageContext(opts.aboutPage)
        ? opts.aboutPage
        : null;
  commit({
    open: true,
    ...(page ? { pageContext: page } : {}),
  });
  warmAskSession();

  const code = opts.code?.trim();
  const question = opts.question?.trim();
  if (code) {
    const language = /^[\w#+.-]{1,24}$/.test(opts.language ?? "")
      ? opts.language
      : "";
    const fenced = `\`\`\`${language}\n${code.slice(0, ASK_MAX_CODE_CHARS)}\n\`\`\``;
    // The page goes as page_url alone, so the answer reads the page the
    // code came from without the agent's router seeing its title.
    const pageUrl = readPageContext()?.url;
    ask(`${prompts.explainCode(currentPageTitle())}\n\n${fenced}`, null, {
      sent: `${prompts.explainCodeSent()}\n\n${fenced}`,
      ...(pageUrl ? { pageUrl } : {}),
    });
  } else if (question) {
    send(question, { pageContext: null });
  } else {
    focusComposer();
  }
}

function close() {
  commit({ open: false, fullscreen: false });
}

function toggle() {
  if (core.open) close();
  else open();
}

function setFullscreen(fullscreen: boolean) {
  start();
  commit({ fullscreen, ...(fullscreen ? { open: true } : {}) });
}

function toggleFullscreen() {
  setFullscreen(!(core.open && core.fullscreen));
}

function saveWidthSoon() {
  if (widthSaveTimer) clearTimeout(widthSaveTimer);
  widthSaveTimer = setTimeout(() => {
    widthSaveTimer = null;
    try {
      local()?.setItem(ASK_STORAGE_KEYS.width, String(snapshot.width));
    } catch {
      // ignore
    }
  }, 200);
}

/** Sets the docked width (clamped). Saved for later visits. */
function setWidth(px: number) {
  if (!Number.isFinite(px)) return;
  start();
  const preferredWidth = clamp(
    Math.round(px),
    ASK_PANEL_WIDTH.min,
    widthMaxFor(core.viewportWidth),
  );
  if (preferredWidth === core.preferredWidth) return;
  commit({ preferredWidth });
  saveWidthSoon();
}

/** Back to the default width (double-click on the resize handle). */
function resetWidth() {
  start();
  if (widthSaveTimer) clearTimeout(widthSaveTimer);
  widthSaveTimer = null;
  try {
    local()?.removeItem(ASK_STORAGE_KEYS.width);
  } catch {
    // ignore
  }
  commit({ preferredWidth: ASK_PANEL_WIDTH.default });
}

/**
 * Sends a question. Uses and clears the attached page unless
 * `options.pageContext` says otherwise. Queued while an answer streams.
 */
function send(text: string, options: AskSendOptions = {}): AskSendResult {
  start();
  const usesAttached = options.pageContext === undefined;
  const pageContext = usesAttached
    ? core.pageContext
    : (options.pageContext ?? null);
  return ask(text, pageContext, { clearAttached: usesAttached });
}

/**
 * Sends (or queues) one question. `sent` is what goes out when it isn't
 * `text`; `clearAttached` drops the composer's page chip once accepted.
 */
function ask(
  text: string,
  pageContext: AskPageContext | null,
  options: { sent?: string; pageUrl?: string; clearAttached?: boolean } = {},
): AskSendResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const question: QueuedQuestion = {
    text: trimmed,
    pageContext,
    ...(options.sent ? { sent: options.sent } : {}),
    ...(options.pageUrl ? { pageUrl: options.pageUrl } : {}),
  };
  // The limit applies to what is sent; the page goes in its own fields.
  if (sentText(question).length > ASK_MAX_MESSAGE_CHARS) {
    return { ok: false, reason: "tooLong" };
  }
  if (options.clearAttached && core.pageContext) commit({ pageContext: null });
  if (core.busy) {
    queue.push(question);
    commit();
    return { ok: true, queued: true };
  }
  startTurn(question);
  return { ok: true, queued: false };
}

/** Sends the composer's draft and clears it when accepted. */
function submitComposer(): AskSendResult {
  const result = send(core.composerDraft);
  if (result.ok) commit({ composerDraft: "" });
  return result;
}

/** Stops the streaming answer, keeping what arrived; queued questions follow. */
function stop() {
  if (!activeId) return;
  const id = activeId;
  controller?.abort();
  finishTurn(id, (m) => ({ ...m, state: "stopped", status: undefined }));
}

/**
 * Asks a question again: "Ask again" on an answer, "Try again" on an error.
 * The latest answer is replaced in place; an older one gets a new turn at
 * the end. Skips the answer cache.
 */
function retry(messageId: string) {
  start();
  const index = core.messages.findIndex((message) => message.id === messageId);
  if (index === -1) return;
  let userIndex = index;
  while (userIndex >= 0 && core.messages[userIndex]?.role !== "user")
    userIndex--;
  const user = core.messages[userIndex];
  if (!user || user.role !== "user") return;
  const question: QueuedQuestion = {
    text: user.text,
    pageContext: user.pageContext ?? null,
    ...(user.sent ? { sent: user.sent } : {}),
    ...(user.pageUrl ? { pageUrl: user.pageUrl } : {}),
  };

  if (core.busy) {
    queue.push(question);
    commit();
    return;
  }
  const answerIndex =
    core.messages[index]?.role === "assistant" ? index : index + 1;
  if (answerIndex >= core.messages.length - 1) {
    const messages = core.messages.slice(0, userIndex);
    // Re-asking the only question starts the conversation over.
    commit({
      messages,
      conversationId: messages.length > 0 ? core.conversationId : null,
    });
  }
  // A conversation found stale was already dropped (onConversationReset).
  startTurn(question, { retry: true });
}

/** New chat: stops any answer and clears the conversation. */
function reset() {
  start();
  controller?.abort();
  controller = null;
  activeId = null;
  queue = [];
  commit(
    {
      messages: [],
      conversationId: null,
      busy: false,
      pageContext: null,
      composerDraft: "",
      focusRequest: core.focusRequest + 1,
    },
    { saveThread: "now" },
  );
}

/** Rates an answer once per choice; the panel thanks the reader either way. */
function rate(messageId: string, rating: AskRating) {
  const message = core.messages.find((m) => m.id === messageId);
  if (!message || message.role !== "assistant" || !message.runId) return;
  if (message.rating === rating) return;
  const runId = message.runId;
  updateMessage(messageId, (m) => ({ ...m, rating }), { saveThread: "now" });
  void sendFeedback({ runId, rating });
}

/** Attaches a page to the next question (null removes the chip). */
function setPageContext(pageContext: AskPageContext | null) {
  start();
  commit({ pageContext });
}

/** Attaches the current docs page; false off docs pages. */
function attachCurrentPage(): boolean {
  start();
  const page = readPageContext();
  if (!page) return false;
  commit({
    open: true,
    pageContext: page,
    focusRequest: core.focusRequest + 1,
  });
  return true;
}

function setComposerDraft(composerDraft: string) {
  if (composerDraft !== core.composerDraft) commit({ composerDraft });
}

function focusComposer() {
  commit({ focusRequest: core.focusRequest + 1 });
}

function setPrompts(next: Partial<AskPrompts>) {
  prompts = { ...prompts, ...next };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export const askStore = {
  getState: (): AskState => snapshot,
  /** For useSyncExternalStore's server snapshot: closed, empty. */
  getServerState: (): AskState => SERVER_STATE,
  subscribe,
  open,
  close,
  toggle,
  setFullscreen,
  toggleFullscreen,
  setWidth,
  resetWidth,
  send,
  submitComposer,
  stop,
  retry,
  reset,
  rate,
  setPageContext,
  attachCurrentPage,
  setComposerDraft,
  focusComposer,
  setPrompts,
  /** Mint a session ahead of the first question (launcher hover/focus). */
  warm: warmAskSession,
};

/**
 * Routes the page's openers to the store: `openAskAi()` events (code
 * blocks, page actions, search hand-off) and clicks on
 * `[data-docs-ask-open]` (`="page"` attaches this page). Call once from the
 * root island; returns the cleanup.
 */
export function connectAskAiEvents(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onOpen = (event: Event) =>
    open((event as CustomEvent<AskAiOpenOptions | undefined>).detail ?? {});
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const opener = (event.target as Element | null)?.closest?.(
      `[${DOCS_ASK_OPEN_ATTR}]`,
    );
    if (!opener) return;
    event.preventDefault();
    open({ aboutPage: opener.getAttribute(DOCS_ASK_OPEN_ATTR) === "page" });
  };
  window.addEventListener(DOCS_ASK_OPEN_EVENT, onOpen);
  document.addEventListener("click", onClick);
  return () => {
    window.removeEventListener(DOCS_ASK_OPEN_EVENT, onOpen);
    document.removeEventListener("click", onClick);
  };
}

/** Tests only: drop all state and listeners. */
export function resetAskStoreForTests() {
  controller?.abort();
  for (const off of teardown) off();
  teardown = [];
  if (threadSaveTimer) clearTimeout(threadSaveTimer);
  if (widthSaveTimer) clearTimeout(widthSaveTimer);
  threadSaveTimer = null;
  widthSaveTimer = null;
  controller = null;
  activeId = null;
  queue = [];
  prompts = DEFAULT_PROMPTS;
  started = false;
  appliedHtml = null;
  listeners.clear();
  core = initialCore();
  snapshot = SERVER_STATE;
}
