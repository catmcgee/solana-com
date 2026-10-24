"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { cn } from "@/app/components/utils";
import { askStore, type AskErrorKind } from "@/lib/docs/ask/store";
import { useAskSelector } from "@/lib/docs/ask/use-ask";
import { CalloutIcon } from "../docs-ui-icons";
import { focusRing } from "./ui";

/** Inline text action, as the docs' underlined links but in body colour. */
const textButton = cn(
  "rounded-sm font-medium text-[var(--sol-text)] underline decoration-[var(--sol-line-strong)] underline-offset-[3px] transition-colors duration-150 hover:decoration-current motion-reduce:transition-none",
  focusRing,
);

/** The docs' danger glyph at 16px (its own class sizes it only in callouts). */
function DangerIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 grid size-4 shrink-0 place-items-center [&_svg]:size-4",
        className,
      )}
    >
      <CalloutIcon type="danger" />
    </span>
  );
}

/** Nothing else is in the turn: the one case for a tinted box. */
const BOXED: ReadonlySet<AskErrorKind> = new Set(["unavailable", "offline"]);
/** Asking again right away can't help: the question goes back instead. */
const NO_RETRY: ReadonlySet<AskErrorKind> = new Set(["rateLimited", "tooLong"]);

const restored = new Set<string>();

/**
 * Puts a refused question (and its page) back in the composer, once, unless
 * the reader has started typing something else.
 */
function useRestoreQuestion(messageId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || restored.has(messageId)) return;
    restored.add(messageId);
    const { messages, composerDraft, pageContext } = askStore.getState();
    if (composerDraft.trim()) return;
    const index = messages.findIndex((message) => message.id === messageId);
    const question = messages
      .slice(0, Math.max(index, 0))
      .findLast((message) => message.role === "user");
    if (question?.role !== "user") return;
    askStore.setComposerDraft(question.text);
    if (question.pageContext && !pageContext)
      askStore.setPageContext(question.pageContext);
  }, [messageId, enabled]);
}

/**
 * Why an answer failed, with the one action that helps. On the latest turn:
 * a red line with the docs' danger icon and a "Try again" (or "New chat"
 * when the conversation is full) text button; a tinted danger box only when
 * the service or the network is down. Older turns just say they didn't
 * finish. `latest` and `hasPartial` default to the message in the store.
 */
export function AskError({
  kind,
  messageId,
  latest,
  hasPartial,
}: {
  kind: AskErrorKind;
  messageId: string;
  /** The thread's last answer (default: looked up). */
  latest?: boolean;
  /** Some of the answer arrived (default: looked up). */
  hasPartial?: boolean;
}) {
  const t = useTranslations("docsAsk");
  const isLatest = useAskSelector(
    (s) => latest ?? s.messages.at(-1)?.id === messageId,
  );
  const partial = useAskSelector((s) => {
    if (hasPartial !== undefined) return hasPartial;
    const message = s.messages.find((m) => m.id === messageId);
    return (
      message?.role === "assistant" && (!!message.text.trim() || !!message.ui)
    );
  });
  useRestoreQuestion(messageId, isLatest && NO_RETRY.has(kind));

  if (!isLatest) {
    return (
      <p className="m-0 mt-3 text-[12px] leading-4 text-[var(--sol-dim)]">
        <bdi>{t("didntFinish")}</bdi>
      </p>
    );
  }

  // A failure after some text: the text did load, it just stopped.
  const shown = kind === "generic" && partial ? "incomplete" : kind;
  const full = kind === "conversationFull";
  const action = NO_RETRY.has(kind) ? null : (
    <button
      type="button"
      onClick={() => (full ? askStore.reset() : askStore.retry(messageId))}
      className={cn(textButton, "ms-1")}
    >
      <bdi>{full ? t("newChat") : t("retry")}</bdi>
    </button>
  );

  // Below, the message and its action flow as one sentence, wrapping
  // together. <bdi>: an untranslated (English) line in an Arabic answer
  // keeps its full stop at the end.
  if (BOXED.has(kind) && !partial) {
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[13px] leading-5 text-[var(--sol-text)] dark:border-[#7f1d1d] dark:bg-[oklab(0.577099_0.191149_0.0987651/0.2)]">
        <DangerIcon className="text-[#991b1b] dark:text-[#fca5a5]" />
        <div className="min-w-0">
          <p className="m-0 inline">
            <bdi>{t(`errors.${shown}`)}</bdi>
          </p>
          {action}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-[var(--sol-red)]">
      <DangerIcon />
      <div className="min-w-0">
        <p className="m-0 inline">
          <bdi>{t(`errors.${shown}`)}</bdi>
        </p>
        {action}
      </div>
    </div>
  );
}

/**
 * A stopped answer's one line: "Stopped · Ask again" (instead of the
 * actions row, which would offer copying half an answer).
 */
export function AskStopped({ messageId }: { messageId: string }) {
  const t = useTranslations("docsAsk");
  return (
    <div className="mt-3 flex items-center gap-2 text-[12px] leading-4 text-[var(--sol-dim)]">
      <p className="m-0">
        <bdi>{t("stopped")}</bdi>
      </p>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => askStore.retry(messageId)}
        className={textButton}
      >
        <bdi>{t("askAgain")}</bdi>
      </button>
    </div>
  );
}
