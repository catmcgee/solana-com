"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/app/components/utils";
import { askStore, type AskAssistantMessage } from "@/lib/docs/ask/store";
import {
  CheckIcon,
  CopyIcon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "../docs-ui-icons";
import { focusRing, useCopy } from "./ui";

function ActionButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-[var(--sol-dim)] transition-colors duration-150 hover:bg-[var(--sol-soft)] hover:text-[var(--sol-text)] motion-reduce:transition-none [&_svg]:size-[15px]",
        pressed &&
          "text-[var(--sol-purple-text)] hover:text-[var(--sol-purple-text)]",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Under a finished answer, always visible (touch screens have no hover):
 * Copy answer, Helpful / Not helpful (only when the run can be rated) and
 * Ask again.
 */
export function AskActions({
  message,
  copyText,
}: {
  message: AskAssistantMessage;
  /** The answer as Markdown, without the section headings. */
  copyText: string;
}) {
  const t = useTranslations("docsAsk");
  const [copied, copy] = useCopy();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-0.5">
      {copyText ? (
        <ActionButton
          label={copied ? t("copied") : t("copyAnswer")}
          onClick={() => copy(copyText)}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </ActionButton>
      ) : null}
      {message.runId ? (
        <>
          <ActionButton
            label={t("helpful")}
            pressed={message.rating === "up"}
            onClick={() => askStore.rate(message.id, "up")}
          >
            <ThumbsUpIcon />
          </ActionButton>
          <ActionButton
            label={t("notHelpful")}
            pressed={message.rating === "down"}
            onClick={() => askStore.rate(message.id, "down")}
          >
            <ThumbsDownIcon />
          </ActionButton>
        </>
      ) : null}
      <ActionButton
        label={t("askAgain")}
        onClick={() => askStore.retry(message.id)}
      >
        <RotateCcwIcon />
      </ActionButton>
      <span
        role="status"
        className="ms-2 text-[12px] leading-4 text-[var(--sol-dim)]"
      >
        {message.rating ? t("feedbackThanks") : ""}
      </span>
    </div>
  );
}
