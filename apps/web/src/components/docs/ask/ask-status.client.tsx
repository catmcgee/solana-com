"use client";

import { useTranslations } from "next-intl";
import type { AskStatus } from "@/lib/docs/ask/store";
import { spinner } from "./ui";

/** "Searching the docs" with a 12px ring while an answer is on its way. */
export function AskStatusRow({ status }: { status: AskStatus }) {
  const t = useTranslations("docsAsk");
  return (
    <div className="flex items-center gap-2 text-[13px] leading-5 text-[var(--sol-dim)]">
      <span aria-hidden="true" className={spinner} />
      <span>{t(`status.${status}`)}</span>
    </div>
  );
}
