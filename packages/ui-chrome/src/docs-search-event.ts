/**
 * Event the docs search dialog listens for (apps/web
 * components/docs/docs-search.client.tsx, mounted on every apps/web page).
 */
export const DOCS_SEARCH_OPEN_EVENT = "docs-search:open";

/** Opens the docs search dialog on this page, optionally with a query. */
export function openDocsSearch(query = "") {
  window.dispatchEvent(
    new CustomEvent(DOCS_SEARCH_OPEN_EVENT, { detail: { query } }),
  );
}
