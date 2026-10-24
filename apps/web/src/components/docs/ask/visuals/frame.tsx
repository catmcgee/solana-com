/**
 * Shared pieces of the Ask AI visuals: the hairline frame with its mono
 * label, disclosures, links, and the class recipes they repeat. Colours are
 * docs tokens only; `--ask-*` come from the panel root and fall back to the
 * nearest docs token so a visual reads anywhere.
 */
import type { ReactNode } from "react";
import { cn } from "@/app/components/utils";
import { ArrowUpRightIcon } from "../../docs-ui-icons";
import { DocsLink } from "../../docs-link";
import type { VisualLink } from "@/lib/docs/ask/generative-ui/schema";
import { focusRing, mono } from "../ui";
import { DisclosureIcon } from "./icons";

export { focusRing, mono };

/** The docs' signature label (sidebar sections, "On this page"). */
export const signatureLabel =
  "font-[family-name:var(--sol-font-mono)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--sol-dim)]";

export const bodyText = "text-[var(--ask-body,var(--sol-muted))]";

export const codeSurface = "bg-[var(--ask-code-bg,var(--sol-surface-2))]";

const linkStyle =
  "text-[var(--sol-link)] underline decoration-[var(--sol-link-underline)] decoration-1 underline-offset-[3px] transition-colors duration-150 hover:text-[var(--sol-link-hover)] hover:decoration-current motion-reduce:transition-none";

/** A bordered block with a label row: "DIAGRAM  Lifecycle flow". */
export function VisualFrame({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title ? `${label}: ${title}` : label}
      className="my-4 overflow-hidden rounded-xl border border-[var(--sol-line)] bg-[var(--sol-page)] first:mt-0 last:mb-0"
    >
      <div className="flex min-w-0 items-baseline gap-2.5 border-b border-[var(--sol-line)] px-3.5 py-2">
        <span className={cn(signatureLabel, "shrink-0")}>{label}</span>
        {title ? (
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--sol-text)]">
            {title}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A native disclosure with a 12px chevron, closed by default. */
export function Disclosure({
  summary,
  children,
  className,
  summaryClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
}) {
  return (
    <details className={cn("group/disclosure", className)}>
      <summary
        className={cn(
          "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-[12.5px] text-[var(--sol-muted)] transition-colors duration-150 hover:text-[var(--sol-text)] motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
          focusRing,
          summaryClassName,
        )}
      >
        <DisclosureIcon className="shrink-0 -rotate-90 text-[var(--sol-dim)] transition-[rotate] duration-150 group-open/disclosure:!rotate-0 motion-reduce:transition-none rtl:rotate-90" />
        {summary}
      </summary>
      {children}
    </details>
  );
}

function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

/**
 * Docs links navigate in place (a docked panel stays open; an overlay gets
 * out of the way, see ask-panel); others open a tab.
 */
export function VisualLinkItem({ link }: { link: VisualLink }) {
  if (isExternal(link.href)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className={cn(linkStyle, focusRing, "rounded-sm")}
      >
        {link.title}
        <ArrowUpRightIcon className="ms-0.5 inline size-3 align-[-1px] rtl:-scale-x-100" />
      </a>
    );
  }
  return (
    <DocsLink
      href={link.href}
      data-ask-internal=""
      className={cn(linkStyle, focusRing, "rounded-sm")}
    >
      {link.title}
    </DocsLink>
  );
}

/** "DOCS  Token quickstart · Create token account". */
export function VisualLinks({
  label,
  links,
  className,
}: {
  label: string;
  links: VisualLink[];
  className?: string;
}) {
  if (links.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px]",
        className,
      )}
    >
      <span className={signatureLabel}>{label}</span>
      {links.map((link) => (
        <VisualLinkItem key={link.href} link={link} />
      ))}
    </div>
  );
}
