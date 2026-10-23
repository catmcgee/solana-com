"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AIChatPanel,
  AIChatProvider,
  AIChatSearch,
  useAIChat,
} from "@fumadocs/ai-chat";
import type { DocsChatMessage } from "@/lib/docs/chat";
import { ASK_AI_EMPTY, askAiFetch, isEmptyAnswer } from "@/lib/docs/chat-fetch";
import type { AskAiRequest } from "./ask-ai.client";
import "./docs-chat.css";

/**
 * Ask AI: Fumadocs' AI chat against /api/docs-chat (GLM), loaded by AskAi
 * (ask-ai.client.tsx) the first time it is opened. Each `request` opens it,
 * and asks about its `code` when a code block's Ask button sent one.
 * Ctrl+/ opens it, Escape and the close button close it.
 */
export default function DocsChatPanel({
  locale,
  request,
  onOpenChange,
}: {
  locale: string;
  request: AskAiRequest;
  onOpenChange: (open: boolean) => void;
}) {
  const [transport] = useState(
    () =>
      new DefaultChatTransport<DocsChatMessage>({
        api: "/api/docs-chat",
        body: { locale },
        fetch: askAiFetch,
      }),
  );
  const chat = useChat<DocsChatMessage>({
    id: "docs-ask-ai",
    throttle: 40,
    transport,
    // An answer with no text (the model only searched, or the stream was
    // empty) says so, instead of leaving the question unanswered.
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError || !isEmptyAnswer(message)) return;
      const notice: DocsChatMessage = {
        ...message,
        parts: [
          ...message.parts,
          { type: "text", text: ASK_AI_EMPTY, state: "done" },
        ],
      };
      chat.setMessages((messages) =>
        messages.some((m) => m.id === message.id)
          ? messages.map((m) => (m.id === message.id ? notice : m))
          : [...messages, notice],
      );
    },
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
        request={request}
        onOpenChange={onOpenChange}
        sendCode={(code) =>
          void chat.sendMessage({
            role: "user",
            parts: [
              {
                type: "data-client",
                data: { location: location.href, title: document.title },
              },
              {
                type: "text",
                text: `Explain this code from ${document.title}:\n\n\`\`\`\n${code.trim()}\n\`\`\``,
              },
            ],
          })
        }
      />
    </AIChatProvider>
  );
}

function ChatPanel({
  request,
  onOpenChange,
  sendCode,
}: {
  request: AskAiRequest;
  onOpenChange: (open: boolean) => void;
  sendCode: (code: string) => void;
}) {
  const { open, setOpen } = useAIChat();
  const handled = useRef(0);
  const send = useRef(sendCode);
  send.current = sendCode;

  useEffect(() => {
    if (handled.current === request.seq) return;
    handled.current = request.seq;
    setOpen(true);
    if (request.code?.trim()) send.current(request.code);
  }, [request, setOpen]);

  useEffect(() => onOpenChange(open), [open, onOpenChange]);

  return (
    <aside
      className="docs-chat"
      data-open={open ? "" : undefined}
      aria-label="Ask AI"
      hidden={!open}
      onClick={(event) => {
        // On phones the panel covers the page: following a link from an
        // answer shows the page.
        if (
          (event.target as Element).closest("a[href]") &&
          matchMedia("(max-width: 767px)").matches
        )
          setOpen(false);
      }}
    >
      <AIChatPanel />
    </aside>
  );
}
