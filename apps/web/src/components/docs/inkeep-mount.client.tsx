"use client";

import { lazy, Suspense } from "react";

// Its own chunk, so pages built without INKEEP_API_KEY never load it.
const InkeepSearchAndChat = lazy(() => import("./inkeep.client"));

/** Inkeep search and Ask AI (inkeep.client.tsx), loaded after the page. */
export function InkeepMount() {
  return (
    <Suspense fallback={null}>
      <InkeepSearchAndChat />
    </Suspense>
  );
}
