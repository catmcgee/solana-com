"use client";

import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { DOCS_SEARCH_OPEN_EVENT } from "@solana-com/ui-chrome/docs-search";
import { DOCS_ASK_CODE_EVENT } from "@/lib/docs/ask-ai";

// Its own chunk, so pages built without INKEEP_API_KEY never load it.
const InkeepSearchAndChat = lazy(() => import("./inkeep.client"));

/**
 * Inkeep search and Ask AI (inkeep.client.tsx), loaded after the page. A
 * search, Ask AI or Ctrl+/ before it has loaded is kept and replayed once
 * it listens.
 */
export function InkeepMount() {
  const pending = useRef<Event | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    const keep = (event: Event) => {
      pending.current = new CustomEvent(event.type, {
        detail: (event as CustomEvent).detail,
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        pending.current = new CustomEvent(DOCS_ASK_CODE_EVENT, { detail: {} });
      }
    };
    window.addEventListener(DOCS_SEARCH_OPEN_EVENT, keep);
    window.addEventListener(DOCS_ASK_CODE_EVENT, keep);
    window.addEventListener("keydown", onKeyDown);
    stop.current = () => {
      window.removeEventListener(DOCS_SEARCH_OPEN_EVENT, keep);
      window.removeEventListener(DOCS_ASK_CODE_EVENT, keep);
      window.removeEventListener("keydown", onKeyDown);
    };
    return () => stop.current();
  }, []);

  const onReady = useCallback(() => {
    stop.current();
    if (pending.current) window.dispatchEvent(pending.current);
    pending.current = null;
  }, []);

  return (
    <Suspense fallback={null}>
      <InkeepSearchAndChat onReady={onReady} />
    </Suspense>
  );
}
