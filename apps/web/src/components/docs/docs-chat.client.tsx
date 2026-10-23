"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { DOCS_ASK_CODE_EVENT } from "./docs-components.client";

const DocsChatPanel = lazy(() => import("./docs-chat-panel.client"));

/**
 * Ask AI on the docs. The chat (docs-chat-panel.client.tsx: Fumadocs' AI
 * chat and the AI SDK) loads the first time it is opened: by the floating
 * Ask AI pill (apps/docs/ask-ai.js), which clicks `#assistant-entry`, the
 * docs' assistant hook; by a code block's Ask button; or by Ctrl+/.
 */
export function DocsChat({ locale }: { locale: string }) {
  // undefined: not loaded yet; "": opened; else the code to ask about.
  const [code, setCode] = useState<string>();
  const loaded = code !== undefined;

  useEffect(() => {
    if (loaded) return;
    const onCode = (event: Event) =>
      setCode((event as CustomEvent<{ code?: string }>).detail?.code ?? "");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCode("");
      }
    };
    window.addEventListener(DOCS_ASK_CODE_EVENT, onCode);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(DOCS_ASK_CODE_EVENT, onCode);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loaded]);

  if (!loaded)
    return (
      <button
        type="button"
        id="assistant-entry"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setCode("")}
      />
    );
  return (
    <Suspense fallback={null}>
      <DocsChatPanel locale={locale} code={code} />
    </Suspense>
  );
}
