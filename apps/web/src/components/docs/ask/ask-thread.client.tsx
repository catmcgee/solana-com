"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { cn } from "@/app/components/utils";
import { splitAnswerSections } from "@/lib/docs/ask/protocol";
import type { AskAssistantMessage } from "@/lib/docs/ask/store";
import { useAskSelector } from "@/lib/docs/ask/use-ask";
import { ArrowDownIcon } from "../docs-ui-icons";
import { AskEmpty } from "./ask-empty.client";
import { AssistantMessage, UserMessage } from "./ask-message.client";
import { focusRing, visuallyHidden } from "./ui";

/** Within this many px of the end counts as "at the bottom". */
const STICK_THRESHOLD = 80;

/** Markdown as one line of plain text, for the live region. */
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

/**
 * What the live region says about the latest answer: its status while it
 * is on its way, then its summary, error or "Stopped". Not every delta, and
 * not a thread restored when the panel opens.
 */
function useAnnouncement(last: AskAssistantMessage | undefined): string {
  const t = useTranslations("docsAsk");
  const state = last?.state;
  const status = last?.status;
  const error = last?.error;
  // The text is final (and stable) once the answer is done.
  const finished = state === "done" ? (last?.text ?? "") : null;
  const key = last ? `${last.id}:${state}:${status ?? ""}` : "";
  const seen = useRef(key);
  const [text, setText] = useState("");
  useEffect(() => {
    if (seen.current === key || !state) return;
    seen.current = key;
    if (state === "pending" || state === "streaming") {
      setText(t(`status.${status ?? "preparing"}`));
    } else if (finished !== null) {
      setText(plainText(splitAnswerSections(finished).summary));
    } else if (state === "error") {
      setText(t(`errors.${error ?? "generic"}`));
    } else {
      setText(t("stopped"));
    }
  }, [key, state, status, error, finished, t]);
  return text;
}

/**
 * The conversation, scrolled to the end as answers arrive while the
 * reader is at the bottom; once they scroll up it stays put and a "↓"
 * button jumps back. Messages are a list; a polite live region announces
 * status changes and finished answers.
 */
export function AskThread({ fullscreen }: { fullscreen: boolean }) {
  const messages = useAskSelector((s) => s.messages);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);

  const last = messages.at(-1);
  const lastAssistant = last?.role === "assistant" ? last : undefined;
  const announcement = useAnnouncement(lastAssistant);
  const t = useTranslations("docsAsk");

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    if (
      smooth &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < STICK_THRESHOLD;
    setAway(!stick.current);
  }, []);

  // A new question always brings the end into view.
  const count = messages.length;
  useEffect(() => {
    stick.current = true;
    toBottom();
  }, [count, toBottom]);

  // Growth (text, a visual, sources) follows the end while the reader is
  // there. Opening a disclosure is reading, not waiting: it stops following.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stick.current) toBottom();
      else onScroll();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [toBottom, onScroll]);
  const onToggle = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest?.("[aria-expanded], summary"))
      stick.current = false;
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div
          ref={content}
          onClickCapture={onToggle}
          className={cn(
            fullscreen ? "mx-auto w-full max-w-[46rem] px-6 py-8" : "px-5 py-5",
          )}
        >
          {messages.length === 0 ? (
            <AskEmpty />
          ) : (
            <ol className="m-0 list-none space-y-8 p-0">
              {messages.map((message) => (
                <li key={message.id}>
                  {message.role === "user" ? (
                    <UserMessage message={message} fullscreen={fullscreen} />
                  ) : (
                    <AssistantMessage
                      message={message}
                      latest={message === last}
                      fullscreen={fullscreen}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {away && messages.length > 0 ? (
        <button
          type="button"
          aria-label={t("jumpToLatest")}
          title={t("jumpToLatest")}
          onClick={() => {
            stick.current = true;
            toBottom(true);
          }}
          className={cn(
            "absolute inset-x-0 bottom-3 mx-auto grid size-8 place-items-center rounded-full border border-[var(--sol-line-strong)] bg-[var(--sol-page)] text-[var(--sol-muted)] shadow-[var(--sol-menu-shadow)] transition-colors duration-150 hover:bg-[var(--sol-soft)] hover:text-[var(--sol-text)] motion-reduce:transition-none",
            focusRing,
          )}
        >
          <ArrowDownIcon />
        </button>
      ) : null}
      <div aria-live="polite" className={visuallyHidden}>
        {announcement}
      </div>
    </div>
  );
}
