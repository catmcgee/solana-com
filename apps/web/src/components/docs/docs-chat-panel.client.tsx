"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AIChatPanel,
  AIChatProvider,
  AIChatSearch,
  useAIChat,
} from "@fumadocs/ai-chat";
import type { DocsChatMessage } from "@/lib/docs/chat";
import { DOCS_ASK_CODE_EVENT } from "./docs-components.client";

/**
 * Ask AI on the docs: Fumadocs' AI chat against /api/docs-chat (GLM),
 * loaded by DocsChat (docs-chat.client.tsx) the first time it is opened,
 * and then open, asking about `code` when a code block's Ask button
 * opened it. Ctrl+/ toggles it, Escape closes it.
 */
export default function DocsChatPanel({
  locale,
  code,
}: {
  locale: string;
  code?: string;
}) {
  const chat = useChat<DocsChatMessage>({
    id: "docs-ask-ai",
    throttle: 40,
    transport: new DefaultChatTransport({
      api: "/api/docs-chat",
      body: { locale },
    }),
  });
  return (
    <AIChatProvider
      chat={chat}
      renderPart={(part, live) =>
        part.type === "tool-search" ? (
          <AIChatSearch part={part} live={live} />
        ) : null
      }
      suggestions={[
        "How do I send USDC with @solana/kit?",
        "What is a program-derived address?",
        "How do transaction fees work?",
      ]}
    >
      <ChatPanel
        code={code}
        sendCode={(text) => void chat.sendMessage({ text })}
      />
    </AIChatProvider>
  );
}

function ChatPanel({
  code: firstCode,
  sendCode,
}: {
  code?: string;
  sendCode: (text: string) => void;
}) {
  const { open, setOpen } = useAIChat();
  const opened = useRef(false);
  useEffect(() => {
    const ask = (code?: string) => {
      setOpen(true);
      if (code)
        sendCode(
          `Explain this code from ${document.title}:\n\n\`\`\`\n${code.trim()}\n\`\`\``,
        );
    };
    // Loading the chat was the first open (and maybe a code question).
    if (!opened.current) {
      opened.current = true;
      ask(firstCode);
    }
    const onCode = (event: Event) =>
      ask((event as CustomEvent<{ code?: string }>).detail?.code);
    window.addEventListener(DOCS_ASK_CODE_EVENT, onCode);
    return () => window.removeEventListener(DOCS_ASK_CODE_EVENT, onCode);
  }, [firstCode, setOpen, sendCode]);
  return (
    <>
      {/* The docs' assistant hook: ask-ai.js opens the assistant through it. */}
      <button
        type="button"
        id="assistant-entry"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setOpen(true)}
      />
      <aside
        className="docs-chat"
        data-open={open ? "" : undefined}
        aria-label="Ask AI"
        hidden={!open}
      >
        <AIChatPanel />
      </aside>
    </>
  );
}
