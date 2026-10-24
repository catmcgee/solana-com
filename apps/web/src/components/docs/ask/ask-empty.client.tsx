"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/app/components/utils";
import { askStore } from "@/lib/docs/ask/store";
import { useAskSelector } from "@/lib/docs/ask/use-ask";
import {
  readPageContext,
  type AskPageContext,
} from "@/lib/docs/ask/page-context";
import { ArrowUpRightIcon } from "../docs-ui-icons";
import { focusRing, signatureLabel } from "./ui";

const SUGGESTIONS = ["token", "pda", "fees", "cpi"] as const;

function SuggestionRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border border-[var(--sol-line)] px-3.5 py-2.5 text-start text-[13.5px] leading-5 text-[var(--sol-muted)] transition-colors duration-150 hover:border-[var(--sol-purple-line)] hover:bg-[var(--sol-purple-soft)] hover:text-[var(--sol-purple-text)] motion-reduce:transition-none",
          focusRing,
        )}
      >
        <span className="min-w-0 flex-1">{children}</span>
        <ArrowUpRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none rtl:-scale-x-100" />
      </button>
    </li>
  );
}

/**
 * The empty thread: what the panel answers from, and questions to start
 * with. On a docs page the first row attaches that page to the composer
 * (and goes once it is attached).
 */
export function AskEmpty() {
  const t = useTranslations("docsAsk");
  const pathname = usePathname();
  // The page's #content carries its title. The panel only renders after
  // hydration, so the first read can happen during render (no row popping
  // in); later reads wait for client navigation to commit.
  const [page, setPage] = useState<AskPageContext | null>(readPageContext);
  useEffect(() => setPage(readPageContext()), [pathname]);
  const attached = useAskSelector((s) => s.pageContext?.url ?? null);

  return (
    <div className="pt-2">
      <h3 className="m-0 text-[15px] font-medium leading-6 tracking-[-0.01em] text-[var(--sol-text)]">
        {t("emptyTitle")}
      </h3>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--sol-muted)]">
        {t("emptyBody")}
      </p>
      <p className={cn(signatureLabel, "m-0 mt-6")}>{t("suggestionsLabel")}</p>
      <ul className="m-0 mt-2.5 list-none space-y-2 p-0">
        {page && page.url !== attached ? (
          <SuggestionRow onClick={() => askStore.attachCurrentPage()}>
            {t("askAboutPage")}
            <span className="mt-0.5 block truncate text-[12.5px] text-[var(--sol-dim)]">
              {page.title}
            </span>
          </SuggestionRow>
        ) : null}
        {SUGGESTIONS.map((key) => (
          <SuggestionRow
            key={key}
            onClick={() =>
              askStore.send(t(`suggestions.${key}`), { pageContext: null })
            }
          >
            {t(`suggestions.${key}`)}
          </SuggestionRow>
        ))}
      </ul>
    </div>
  );
}
