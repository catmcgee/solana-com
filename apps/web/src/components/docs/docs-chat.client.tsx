"use client";

import { useEffect, type ReactNode } from "react";
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
 * Ask AI on the docs: Fumadocs' AI chat against /api/docs-chat (GLM). The
 * floating Ask AI pill (apps/docs/ask-ai.js) opens it through the
 * `#assistant-entry` button, the docs' assistant hook; a code block's Ask
 * button sends its code. Ctrl+/ toggles it, Escape closes it.
 */
export function DocsChat({
  locale,
  children,
}: {
  locale: string;
  children?: ReactNode;
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
      <DocsChatPanel sendCode={(text) => void chat.sendMessage({ text })} />
      {children}
    </AIChatProvider>
  );
}

function DocsChatPanel({ sendCode }: { sendCode: (text: string) => void }) {
  const { open, setOpen } = useAIChat();
  useEffect(() => {
    const onCode = (event: Event) => {
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      setOpen(true);
      if (code)
        sendCode(
          `Explain this code from ${document.title}:\n\n\`\`\`\n${code.trim()}\n\`\`\``,
        );
    };
    window.addEventListener(DOCS_ASK_CODE_EVENT, onCode);
    return () => window.removeEventListener(DOCS_ASK_CODE_EVENT, onCode);
  }, [setOpen, sendCode]);
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
