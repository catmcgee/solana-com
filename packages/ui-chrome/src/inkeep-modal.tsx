"use client";

import { useEffect, useRef } from "react";
import {
  InkeepModalSearchAndChat,
  type AIChatFunctions,
  type InkeepEmbeddedSearchAndChatFunctions,
} from "@inkeep/cxkit-react";
import { useInkeepConfig } from "./inkeep-config";

/**
 * One request to open the modal: search (with a query to fill in) or chat
 * (with a message to send). `seq` tells repeated requests apart.
 */
export type InkeepRequest = {
  seq: number;
  view: "search" | "chat";
  query?: string;
  message?: string;
};

/**
 * Inkeep's search and chat modal, with the configuration solana.com uses
 * (inkeep-config.ts; API traffic through the app's /api/inkeep proxy), opened
 * by the caller instead of its own trigger. Import it lazily: it is the
 * module that brings in @inkeep/cxkit-react. Uses useSearchParams (through
 * useInkeepConfig), so render it inside <Suspense>.
 */
export default function InkeepModal({
  request,
  open,
  onOpenChange,
}: {
  request: InkeepRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = useInkeepConfig();
  // cxkit types the ref as never null.
  const widget = useRef<InkeepEmbeddedSearchAndChatFunctions>(
    null as unknown as InkeepEmbeddedSearchAndChatFunctions,
  );
  const chat = useRef<AIChatFunctions>(null);
  const searchRef = config.searchSettings.searchFunctionsRef;
  // useInkeepConfig hands out a ref object (inkeep-config.ts).
  const search = searchRef && "current" in searchRef ? searchRef : null;

  useEffect(() => {
    (widget.current as InkeepEmbeddedSearchAndChatFunctions | null)?.setView(
      request.view,
    );
    const { view, query, message } = request;
    if (view === "search" ? !query : !message) return;
    // The modal's panes mount after it opens: wait for them (about 2s).
    let frame = 0;
    let tries = 0;
    const run = () => {
      if (view === "search" && search?.current) {
        search.current.updateQuery(query ?? "");
        search.current.focusInput();
      } else if (view === "chat" && chat.current) {
        chat.current.submitMessage(message);
      } else if (++tries < 120) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [request, search]);

  return (
    <InkeepModalSearchAndChat
      ref={widget}
      defaultView={request.view}
      baseSettings={config.baseSettings}
      searchSettings={{
        ...config.searchSettings,
        defaultQuery: request.view === "search" ? (request.query ?? "") : "",
      }}
      aiChatSettings={{ ...config.aiChatSettings, chatFunctionsRef: chat }}
      modalSettings={{ isOpen: open, onOpenChange, shortcutKey: null }}
    />
  );
}
