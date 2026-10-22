"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useInkeepConfig } from "./inkeep-config";

const InkeepModalSearch = dynamic(
  () => import("@inkeep/cxkit-react").then((mod) => mod.InkeepModalSearch),
  { ssr: false },
);

/**
 * Inkeep search on its own (no chat tab), opened by the caller: the docs
 * header's search field and ⌘K / Ctrl+K. `query` prefills the box when the
 * modal opens (the /developers hand-off). Uses useSearchParams through
 * useInkeepConfig, so render it inside <Suspense> on static pages.
 */
export function InkeepSearchModal({
  open,
  onOpenChange,
  query = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query?: string;
}) {
  const config = useInkeepConfig();
  const ref = config.searchSettings.searchFunctionsRef;
  // useInkeepConfig hands out a ref object (inkeep-config.ts).
  const functions = ref && "current" in ref ? ref : null;

  useEffect(() => {
    if (!open || !query) return;
    // The search box mounts with the modal; prefill it on the next frame.
    const id = requestAnimationFrame(() => {
      functions?.current?.updateQuery(query);
      functions?.current?.focusInput();
    });
    return () => cancelAnimationFrame(id);
  }, [open, query, functions]);

  return (
    <InkeepModalSearch
      baseSettings={config.baseSettings}
      searchSettings={{ ...config.searchSettings, defaultQuery: query }}
      modalSettings={{ isOpen: open, onOpenChange, shortcutKey: null }}
    />
  );
}
