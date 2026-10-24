"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/app/components/utils";
import { askStore, type AskErrorKind } from "@/lib/docs/ask/store";
import { focusRing } from "./ui";

/**
 * Why an answer failed, in the docs' danger callout colours, with the one
 * action that helps: Try again, or New chat when the conversation is full.
 */
export function AskError({
  kind,
  messageId,
}: {
  kind: AskErrorKind;
  messageId: string;
}) {
  const t = useTranslations("docsAsk");
  const full = kind === "conversationFull";
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13.5px] leading-[1.55] text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
      <p className="m-0">{t(`errors.${kind}`)}</p>
      <button
        type="button"
        onClick={() => (full ? askStore.reset() : askStore.retry(messageId))}
        className={cn(
          "mt-2.5 rounded-lg border border-[var(--sol-line-strong)] bg-[var(--sol-page)] px-2.5 py-1 text-[13px] font-medium leading-5 text-[var(--sol-text)] transition-colors duration-150 hover:bg-[var(--sol-soft)] motion-reduce:transition-none",
          focusRing,
        )}
      >
        {full ? t("newChat") : t("retry")}
      </button>
    </div>
  );
}
