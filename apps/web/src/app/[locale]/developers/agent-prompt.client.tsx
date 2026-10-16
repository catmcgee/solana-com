"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./copy-button.client";
import { AGENT_PROMPT } from "@/data/developers/hub";

/**
 * The one line a reader pastes into their coding agent, the same line as the
 * docs' Start here banner (apps/docs/snippets/agent-banner.mdx). It points at
 * the production URL in the server render and switches to the current origin
 * after hydration, so previews link to their own copy of the guide.
 */
export function AgentPrompt({
  copyText,
  copiedText,
  label,
}: {
  copyText: string;
  copiedText: string;
  label: string;
}) {
  const [text, setText] = useState(AGENT_PROMPT.line(AGENT_PROMPT.origin));

  useEffect(() => {
    const origin = window.location.origin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)) return;
    setText(AGENT_PROMPT.line(origin));
  }, []);

  return (
    <div className="m-0 flex items-center gap-3 rounded-[10px] border border-[var(--dl-line)] bg-[var(--dl-surface-2)] py-1.5 pe-1.5 ps-3.5">
      <code
        dir="ltr"
        data-testid="agent-prompt"
        title={text}
        className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap font-[family-name:var(--dl-mono)] !text-[13px] leading-[1.6] text-[var(--dl-text)] [scrollbar-width:thin]"
      >
        {text}
      </code>
      <CopyButton
        text={text}
        label={label}
        copyText={copyText}
        copiedText={copiedText}
      />
    </div>
  );
}
