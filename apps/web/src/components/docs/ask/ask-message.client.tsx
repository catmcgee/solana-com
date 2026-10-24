"use client";

import { useTranslations } from "next-intl";
import { Fragment, useId, useMemo, useState } from "react";
import { cn } from "@/app/components/utils";
import {
  splitAnswerSections,
  splitCodeFollowupPrompt,
} from "@/lib/docs/ask/protocol";
import type { AskAssistantMessage, AskUserMessage } from "@/lib/docs/ask/store";
import { ChevronDownIcon } from "../docs-ui-icons";
import { AskActions } from "./ask-actions.client";
import { AskError } from "./ask-error.client";
import { AskFollowups } from "./ask-followups.client";
import { AskMarkdown } from "./ask-markdown.client";
import { AskSources } from "./ask-sources.client";
import { AskStatusRow } from "./ask-status.client";
import { AskVisual } from "./visuals/ask-visual.client";
import { focusRing, mono, spinner, visuallyHidden } from "./ui";

const FENCE = /```[^\n]*\n([\s\S]*?)(?:\n```|$)/g;

/**
 * A question as asked: text, with any fenced code (a code block's Ask) in a
 * short scrolling box so a long snippet doesn't fill the thread.
 */
function QuestionText({ text }: { text: string }) {
  const parts: { code: boolean; text: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    if (match.index > last)
      parts.push({ code: false, text: text.slice(last, match.index) });
    parts.push({ code: true, text: match[1] ?? "" });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ code: false, text: text.slice(last) });
  return parts.map((part, index) =>
    part.code ? (
      <pre
        key={index}
        dir="ltr"
        tabIndex={0}
        className={cn(
          mono,
          "my-2 max-h-48 overflow-auto rounded-lg border border-[var(--sol-line)] bg-[var(--sol-page)] px-3 py-2 text-[12px] leading-[1.6] last:mb-0 [&_code]:[font-family:inherit]",
          focusRing,
        )}
      >
        <code>{part.text}</code>
      </pre>
    ) : (
      <Fragment key={index}>{part.text.trim()}</Fragment>
    ),
  );
}

export function UserMessage({
  message,
  fullscreen,
}: {
  message: AskUserMessage;
  fullscreen: boolean;
}) {
  const t = useTranslations("docsAsk");
  return (
    <div className="flex flex-col items-end">
      {message.pageContext ? (
        <p
          className={cn(
            mono,
            "m-0 mb-1.5 max-w-[85%] truncate text-[11px] leading-4 text-[var(--sol-dim)]",
          )}
        >
          {t("pageContext", { title: message.pageContext.title })}
        </p>
      ) : null}
      <div
        className={cn(
          "ms-auto max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-[var(--sol-soft)] px-3.5 py-2.5 text-[14px] leading-6 text-[var(--sol-text)]",
          fullscreen && "text-[15px]",
        )}
      >
        <span className={visuallyHidden}>{t("you")}: </span>
        {/* The reader's words set their own direction (English on an
            Arabic page); the bubble stays on the page's end side. */}
        <div dir="auto">
          <QuestionText text={message.text} />
        </div>
      </div>
    </div>
  );
}

/**
 * Answers whose full text the reader opened. Switching between docked and
 * full screen remounts the thread, and full screen is where a long answer
 * gets read, so this outlives the component.
 */
const openAnswers = new Set<string>();

/** "Show the full answer": the agent's in-depth section, folded. */
function InDepth({
  messageId,
  text,
  streaming,
}: {
  messageId: string;
  text: string;
  streaming: boolean;
}) {
  const t = useTranslations("docsAsk");
  const [open, setOpen] = useState(() => openAnswers.has(messageId));
  const id = useId();
  const toggle = () => {
    if (open) openAnswers.delete(messageId);
    else openAnswers.add(messageId);
    setOpen(!open);
  };
  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md text-[13px] leading-5 text-[var(--sol-muted)] transition-colors duration-150 hover:text-[var(--sol-text)] motion-reduce:transition-none",
          focusRing,
        )}
      >
        <ChevronDownIcon
          size={12}
          className={cn(
            "shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            !open && "-rotate-90 rtl:rotate-90",
          )}
        />
        {open ? t("showLess") : t("showFullAnswer")}
        {streaming && !open ? (
          <span aria-hidden="true" className={cn(spinner, "ms-1")} />
        ) : null}
      </button>
      {open ? (
        <div id={id} className="mt-3">
          <AskMarkdown text={text} streaming={streaming} />
        </div>
      ) : null}
    </div>
  );
}

export function AssistantMessage({
  message,
  latest,
  fullscreen,
}: {
  message: AskAssistantMessage;
  /** The thread's last answer: only it offers follow-up chips. */
  latest: boolean;
  fullscreen: boolean;
}) {
  const t = useTranslations("docsAsk");
  const { state, status, ui, codeFollowups } = message;
  const active = state === "pending" || state === "streaming";
  const { summary, inDepth, prompt } = useMemo(() => {
    const split = splitCodeFollowupPrompt(message.text, codeFollowups);
    return { ...splitAnswerSections(split.body), prompt: split.prompt };
  }, [message.text, codeFollowups]);
  const copyText = [summary, inDepth].filter(Boolean).join("\n\n");

  return (
    <div
      className={cn(
        "text-[var(--ask-body)]",
        fullscreen
          ? "text-[15.5px] leading-[1.75]"
          : "text-[14px] leading-[1.7]",
      )}
    >
      <span className={visuallyHidden}>{t("panelLabel")}: </span>
      {active && !summary && !ui ? (
        <AskStatusRow status={status ?? "preparing"} />
      ) : null}
      {summary ? <AskMarkdown text={summary} streaming={active} /> : null}
      {ui ? (
        <div className="mt-4">
          <AskVisual ui={ui} streaming={active} summary={summary} />
        </div>
      ) : active && status === "visual" && summary ? (
        <div className="mt-4">
          <AskStatusRow status="visual" />
        </div>
      ) : null}
      {inDepth ? (
        <InDepth messageId={message.id} text={inDepth} streaming={active} />
      ) : null}
      {state === "error" ? (
        <div className={summary || ui ? "mt-4" : undefined}>
          <AskError kind={message.error ?? "generic"} messageId={message.id} />
        </div>
      ) : null}
      {state === "stopped" ? (
        <p className="m-0 mt-3 text-[12px] leading-4 text-[var(--sol-dim)]">
          {t("stopped")}
        </p>
      ) : null}
      {state === "done" ? <AskSources citations={message.citations} /> : null}
      {state === "done" && latest && codeFollowups ? (
        <AskFollowups followups={codeFollowups} prompt={prompt} />
      ) : null}
      {state === "done" || state === "stopped" ? (
        <AskActions message={message} copyText={copyText} />
      ) : null}
    </div>
  );
}
