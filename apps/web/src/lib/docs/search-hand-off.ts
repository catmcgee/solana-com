/**
 * The search hand-off on arrival: `?q=<text>` (the docs header's no-JS
 * form) or `?search=1` (the header search in apps/media and apps/templates).
 * Returns the query to open the search with, or null without one, and
 * removes the parameters from the URL.
 */
export function takeSearchHandOff(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("q") && params.get("search") !== "1") return null;
  const query = (params.get("q") ?? "").slice(0, 200);
  params.delete("q");
  if (params.get("search") === "1") params.delete("search");
  const rest = params.toString();
  history.replaceState(
    history.state,
    "",
    location.pathname + (rest ? `?${rest}` : "") + location.hash,
  );
  return query;
}
