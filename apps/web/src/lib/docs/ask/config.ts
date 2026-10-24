/**
 * Settings shared by the Ask AI client, store and prepaint script. Nothing
 * here touches `window` at import, so server components can import it.
 */

/**
 * Base URL of the docs agent API. Same-origin by default: the route at
 * app/api/ask/[...path] proxies to the agent (or serves the review mock).
 */
export function askApiBase(): string {
  return process.env.NEXT_PUBLIC_ASK_API_URL || "/api/ask";
}

/** The agent rejects messages longer than this. */
export const ASK_MAX_MESSAGE_CHARS = 4_000;

/** Code sent from a code block's Ask button is cut to this, leaving room for the prompt. */
export const ASK_MAX_CODE_CHARS = 3_500;

/** Messages kept in sessionStorage; the agent caps a conversation at about 40. */
export const ASK_MAX_STORED_MESSAGES = 40;

/** Sent as `x-ask-client-capabilities` on every chat request. */
export const ASK_CLIENT_CAPABILITIES =
  "early-status,ui-done,deferred-generative-ui,fast-path,code-followups,page-context,history";

/**
 * Earlier turns sent with a follow-up (`history`): the last `turns`
 * messages, each cut to its role's limit. The server caps them again.
 */
export const ASK_HISTORY_LIMITS = {
  turns: 6,
  userChars: 1_000,
  assistantChars: 1_500,
} as const;

export const ASK_STORAGE_KEYS = {
  /** localStorage: anonymous session token (Bri's key, so existing sessions carry over). */
  session: "ask-solana:session",
  /** sessionStorage: the conversation (messages + conversationId). */
  thread: "docs-ask:thread:v1",
  /** sessionStorage: whether the panel is open and full screen. */
  ui: "docs-ask:ui:v1",
  /** localStorage: the docked panel width the reader chose, in px. */
  width: "docs-ask:width",
  /** sessionStorage: recent first-turn answers. */
  answers: "docs-ask:answers:v1",
} as const;

/** Docked panel width limits in px. The max is also capped at half the viewport. */
export const ASK_PANEL_WIDTH = {
  min: 360,
  max: 720,
  default: 420,
  /** Arrow-key step on the resize handle; Shift uses `largeStep`. */
  step: 24,
  largeStep: 96,
} as const;

/** Viewport width (px) from which the panel docks beside the page. */
export const ASK_DOCK_MIN_VIEWPORT = 1280;

/**
 * Speculation Rules prerender /developers and the docs pages. A prerendered
 * page runs scripts, so storage reads and session warm-up wait until it is
 * shown (`prerenderingchange`).
 */
export function isPrerendering(): boolean {
  return (
    typeof document !== "undefined" &&
    (document as Document & { prerendering?: boolean }).prerendering === true
  );
}

/**
 * Blocking inline script for the docs layouts: when the panel was left open
 * and docked (sessionStorage) and the viewport is wide enough, set
 * html[data-ask="docked"] and --ask-w before the page paints, so a reload
 * or a /developers ↔ docs navigation does not shift the page after
 * hydration. The store (./store.ts) takes over once it has read the same
 * state.
 */
export const DOCS_ASK_PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,v=window.innerWidth;if(v<${ASK_DOCK_MIN_VIEWPORT})return;var u=JSON.parse(window.sessionStorage.getItem("${ASK_STORAGE_KEYS.ui}")||"null");if(!u||u.open!==true||u.fullscreen===true)return;var w=parseInt(window.localStorage.getItem("${ASK_STORAGE_KEYS.width}")||"",10);if(!(w>0))w=${ASK_PANEL_WIDTH.default};var m=Math.max(${ASK_PANEL_WIDTH.min},Math.min(${ASK_PANEL_WIDTH.max},Math.floor(v/2)));w=Math.max(${ASK_PANEL_WIDTH.min},Math.min(m,w));d.setAttribute("data-ask","docked");d.style.setProperty("--ask-w",w+"px")}catch(e){}})();`;
