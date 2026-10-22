"use client";

import { Suspense, useEffect, useState } from "react";
import { InkeepSearchModal } from "@solana-com/ui-chrome";
import { DOCS_SEARCH_OPEN_EVENT } from "@/app/[locale]/developers/docs-header.client";
import { DocsSearchFallback } from "./docs-search-fallback.client";

/**
 * Docs search: Inkeep search (as on solana.com before the docs moved),
 * opened from the header field, the search icon, ⌘K / Ctrl+K and the Ask AI
 * menu (docs-header.client.tsx `openDocsSearch`), and from the /developers
 * hand-off (`?q=<text>` or `?search=1`, which it then removes from the URL).
 * Fumadocs' /api/docs-search serves the 404 suggestions, the MCP search
 * tool, and the search on deployments without Inkeep.
 */
export function DocsSearch({
  locale,
  inkeep,
}: {
  locale: string;
  /** Inkeep is configured (INKEEP_API_KEY); else Fumadocs' own search. */
  inkeep: boolean;
}) {
  if (!inkeep) return <DocsSearchFallback locale={locale} />;
  return <InkeepDocsSearch />;
}

function InkeepDocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onOpen = (event: Event) => {
      setQuery((event as CustomEvent<{ query?: string }>).detail?.query ?? "");
      setOpen(true);
    };
    window.addEventListener(DOCS_SEARCH_OPEN_EVENT, onOpen);
    // Hand-off from /developers.
    const params = new URLSearchParams(window.location.search);
    if (params.has("q") || params.get("search") === "1") {
      setQuery((params.get("q") ?? "").slice(0, 200));
      setOpen(true);
      params.delete("q");
      if (params.get("search") === "1") params.delete("search");
      const rest = params.toString();
      history.replaceState(
        history.state,
        "",
        location.pathname + (rest ? `?${rest}` : "") + location.hash,
      );
    }
    return () => window.removeEventListener(DOCS_SEARCH_OPEN_EVENT, onOpen);
  }, []);

  return (
    <Suspense fallback={null}>
      <InkeepSearchModal open={open} onOpenChange={setOpen} query={query} />
    </Suspense>
  );
}
