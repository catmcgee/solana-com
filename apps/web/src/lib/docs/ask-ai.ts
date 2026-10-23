/**
 * Event Ask AI listens for: open the chat, and ask about a code block when
 * `detail.code` is set. Sent by the floating pill (components/docs/
 * ask-ai.client.tsx) and a code block's Ask button (docs-components.client).
 * The Inkeep modal (components/docs/inkeep.client.tsx) answers it.
 */
export const DOCS_ASK_CODE_EVENT = "docs-ask-ai:code";

/** Opens Ask AI on this page, optionally asking about `code`. */
export function openAskAi(code?: string) {
  window.dispatchEvent(
    new CustomEvent(DOCS_ASK_CODE_EVENT, { detail: { code } }),
  );
}
