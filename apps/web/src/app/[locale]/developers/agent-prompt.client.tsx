"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./copy-button.client";
import { AGENT_PROMPT } from "@/data/developers/hub";

/**
 * The one line a reader pastes into their coding agent, on one line that is
 * cut off with an ellipsis, with a copy icon button. It shows the URL without
 * "https://"; the button copies the full line. The ">" prompt is CSS, so it
 * is never copied or selected. It is the same line as the docs' Start here
 * banner (apps/docs/snippets/agent-banner.mdx). It points at the production
 * URL in the server render and switches to the current origin after
 * hydration, so previews link to their own copy of the guide.
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

  const shown = text.replace(" https://", " ").replace(" http://", " ");

  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[var(--dl-line-strong)] bg-[var(--dl-surface)] py-1.5 pe-1.5 ps-4">
      <code
        dir="ltr"
        data-testid="agent-prompt"
        title={text}
        className="min-w-0 flex-1 select-all truncate whitespace-nowrap font-[family-name:var(--dl-mono)] !text-[13px] leading-[1.6] text-[var(--dl-text)] before:me-2 before:text-[var(--dl-accent-text)] before:content-['>']"
      >
        {shown}
      </code>
      <CopyButton
        tone="icon"
        text={text}
        label={label}
        copyText={copyText}
        copiedText={copiedText}
      />
    </div>
  );
}
