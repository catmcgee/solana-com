"use client";

import { Fragment, useEffect, useState } from "react";
import { CopyButton } from "./copy-button.client";
import { AGENT_PROMPT } from "@/data/developers/hub";

/**
 * The one line a reader pastes into their coding agent, in a terminal-style
 * box: a title bar with the Copy button, then the line with the guide URL on
 * its own row. The ">" prompt is CSS, so it is never copied or selected. It
 * is the same line as the docs' Start here banner
 * (apps/docs/snippets/agent-banner.mdx). It points at
 * the production URL in the server render and switches to the current origin
 * after hydration, so previews link to their own copy of the guide.
 */
export function AgentPrompt({
  promptLabel,
  copyText,
  copiedText,
  label,
}: {
  promptLabel: string;
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
    <div className="overflow-hidden rounded-[12px] border border-[var(--dl-line)] bg-[var(--dl-surface-2)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--dl-line)] bg-[var(--dl-soft)] py-1.5 pe-1.5 ps-4">
        <span className="font-[family-name:var(--dl-mono)] text-xs text-[var(--dl-dim)]">
          {promptLabel}
        </span>
        <CopyButton
          tone="accent"
          text={text}
          label={label}
          copyText={copyText}
          copiedText={copiedText}
        />
      </div>
      <code
        dir="ltr"
        data-testid="agent-prompt"
        className="block select-all px-4 pb-4 pt-3.5 font-[family-name:var(--dl-mono)] !text-[13px] leading-[1.75] text-[var(--dl-text)] [overflow-wrap:break-word] before:me-2 before:text-[var(--dl-accent-text)] before:content-['>']"
      >
        {AGENT_PROMPT.lead}{" "}
        <span className="block ps-[calc(1ch+0.5rem)] text-[var(--dl-accent-text)]">
          {/* Wrap only after a slash, never mid-word. */}
          {text
            .slice(AGENT_PROMPT.lead.length + 1)
            .split("/")
            .map((part, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <>
                    /<wbr />
                  </>
                )}
                {part}
              </Fragment>
            ))}
        </span>
      </code>
    </div>
  );
}
