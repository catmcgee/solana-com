"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/app/components/utils";
import { isDocsHref } from "@/lib/docs/docs-href";
import type { AskCitation } from "@/lib/docs/ask/store";
import { DocsLink } from "../docs-link";
import { ArrowUpRightIcon } from "../docs-ui-icons";
import { focusRing, mono, signatureLabel } from "./ui";

const rowClass = cn(
  "group -mx-2 flex min-w-0 items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-[var(--sol-muted)] no-underline transition-colors duration-150 hover:bg-[var(--sol-soft)] motion-reduce:transition-none",
  focusRing,
);

/** Where a source sits: its breadcrumbs, else its path. */
function location(citation: AskCitation): string {
  if (citation.breadcrumbs?.length) return citation.breadcrumbs.join(" / ");
  try {
    return new URL(citation.url, "https://solana.com").pathname;
  } catch {
    return citation.url;
  }
}

function SourceRow({
  citation,
  index,
}: {
  citation: AskCitation;
  index: number;
}) {
  const external = /^https?:\/\//i.test(citation.url);
  const content = (
    <>
      <span
        className={cn(
          mono,
          "w-3 shrink-0 text-[11px] leading-5 text-[var(--sol-dim)]",
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0 max-w-full shrink-0 truncate text-[13px] font-medium leading-5 text-[var(--sol-text)] group-hover:text-[var(--sol-purple-text)]">
        {citation.title || location(citation)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-[var(--sol-dim)]">
        {citation.title ? location(citation) : null}
      </span>
      {external ? (
        <ArrowUpRightIcon className="size-3 shrink-0 self-center text-[var(--sol-dim)] rtl:-scale-x-100" />
      ) : null}
    </>
  );
  if (isDocsHref(citation.url)) {
    return (
      <DocsLink href={citation.url} data-ask-internal="" className={rowClass}>
        {content}
      </DocsLink>
    );
  }
  return (
    <a
      href={citation.url}
      className={rowClass}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {content}
    </a>
  );
}

/** The docs pages an answer drew on, numbered, under the docs' mono label. */
export function AskSources({ citations }: { citations: AskCitation[] }) {
  const t = useTranslations("docsAsk");
  if (citations.length === 0) return null;
  return (
    <nav aria-label={t("sources")} className="mt-6">
      <p className={cn(signatureLabel, "m-0")}>{t("sources")}</p>
      <ol className="m-0 mt-1.5 list-none p-0">
        {citations.map((citation, index) => (
          <li key={citation.url}>
            <SourceRow citation={citation} index={index} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
