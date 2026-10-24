"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/app/components/utils";
import { ASK_MAX_MESSAGE_CHARS } from "@/lib/docs/ask/config";
import { askStore } from "@/lib/docs/ask/store";
import { useAskSelector } from "@/lib/docs/ask/use-ask";
import { ArrowUpIcon, StopIcon, XIcon } from "../docs-ui-icons";
import { focusRing } from "./ui";

/** How the root finds (and focuses) the composer's field. */
export const COMPOSER_SELECTOR = "[data-ask-composer]";

/** 1 to 8 lines of 24px, plus the field's top padding. */
const MAX_HEIGHT = 8 * 24 + 10;

/**
 * The question field, a copy of the docs header's search field: an optional
 * "This page: …" chip, an autosizing textarea (Enter sends, Shift+Enter
 * adds a line) and Send, which turns into Stop while an answer streams.
 * The draft lives in the store, so it survives switching to full screen.
 */
export function AskComposer({ fullscreen }: { fullscreen: boolean }) {
  const t = useTranslations("docsAsk");
  const draft = useAskSelector((s) => s.composerDraft);
  const busy = useAskSelector((s) => s.busy);
  const pageContext = useAskSelector((s) => s.pageContext);
  const empty = useAskSelector((s) => s.messages.length === 0);
  const field = useRef<HTMLTextAreaElement>(null);
  const [rejected, setRejected] = useState(false);
  const tooLong = rejected || draft.length > ASK_MAX_MESSAGE_CHARS;

  // Autosize through a custom property (no inline height style).
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.setProperty("--ask-field-h", "auto");
    el.style.setProperty(
      "--ask-field-h",
      `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`,
    );
  }, [draft, fullscreen]);

  const submit = () => {
    const result = askStore.submitComposer();
    setRejected(!result.ok && result.reason === "tooLong");
  };

  const canSend = draft.trim().length > 0 && !tooLong;

  return (
    <div
      className={cn(
        "shrink-0 p-3",
        fullscreen
          ? "mx-auto w-full max-w-[46rem] px-6 pb-6 pt-2"
          : "border-t border-[var(--sol-line)]",
      )}
    >
      <div className="rounded-xl bg-[var(--sol-field)] shadow-[inset_0_0_0_1px_var(--sol-field-line)] transition-shadow duration-150 focus-within:shadow-[inset_0_0_0_1px_var(--sol-purple),0_0_0_3px_var(--sol-purple-soft)] hover:shadow-[inset_0_0_0_1px_var(--sol-field-line-hover)] motion-reduce:transition-none">
        {pageContext ? (
          <div className="flex px-2.5 pt-2.5">
            <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-[var(--sol-line)] bg-[var(--sol-page)] py-0.5 pe-1 ps-2 text-[12px] leading-5 text-[var(--sol-muted)]">
              <span className="min-w-0 truncate">
                {t("pageContext", { title: pageContext.title })}
              </span>
              <button
                type="button"
                aria-label={t("removePageContext")}
                title={t("removePageContext")}
                onClick={() => {
                  askStore.setPageContext(null);
                  field.current?.focus();
                }}
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-sm text-[var(--sol-dim)] transition-colors duration-150 hover:text-[var(--sol-text)] motion-reduce:transition-none [&_svg]:size-3.5",
                  focusRing,
                )}
              >
                <XIcon />
              </button>
            </span>
          </div>
        ) : null}
        <textarea
          ref={field}
          data-ask-composer=""
          dir="auto"
          rows={1}
          value={draft}
          aria-label={empty ? t("placeholder") : t("placeholderFollowUp")}
          placeholder={empty ? t("placeholder") : t("placeholderFollowUp")}
          aria-invalid={tooLong || undefined}
          enterKeyHint="send"
          onChange={(event) => {
            setRejected(false);
            askStore.setComposerDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          className={cn(
            "m-0 block h-[var(--ask-field-h,auto)] max-h-[202px] w-full resize-none overflow-y-auto border-0 bg-transparent px-3 pt-2.5 text-[14px] leading-6 text-[var(--sol-text)] outline-hidden placeholder:text-[var(--sol-dim)] max-sm:text-[16px]",
            fullscreen && "text-[15px]",
          )}
        />
        <div className="flex items-center justify-end gap-2 px-2 pb-2">
          {busy ? (
            <button
              type="button"
              aria-label={t("stop")}
              title={t("stop")}
              onClick={() => askStore.stop()}
              className={cn(
                "grid size-7 place-items-center rounded-lg bg-[var(--sol-text)] text-[var(--sol-page)] transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none [&_svg]:size-3",
                focusRing,
              )}
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              aria-label={t("send")}
              title={t("send")}
              disabled={!canSend}
              onClick={submit}
              className={cn(
                "grid size-7 place-items-center rounded-lg transition-colors duration-150 motion-reduce:transition-none [&_svg]:size-4",
                canSend
                  ? "bg-[var(--sol-cta)] text-[var(--sol-cta-text)] hover:bg-[var(--sol-cta-hover)]"
                  : "cursor-default bg-[var(--sol-soft)] text-[var(--sol-dim)]",
                focusRing,
              )}
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>
      {tooLong ? (
        <p
          role="alert"
          className="m-0 mt-2 text-[12px] leading-4 text-[var(--sol-red)]"
        >
          {t("errors.tooLong")}
        </p>
      ) : null}
      <p className="m-0 mt-2 text-center text-[11.5px] leading-4 text-[var(--sol-dim)]">
        {t("disclaimer")}
      </p>
    </div>
  );
}
