/**
 * Class recipes the Ask AI panel repeats, from the docs chrome
 * (docs-chrome.css, docs.css) re-expressed as Tailwind on `--sol-*` tokens.
 * Display toggles avoid `hidden`/`block`/`sr-only`: docs.css overrides those
 * inside `[data-docs]`, which every panel root carries.
 */
import { useEffect, useState } from "react";

export const focusRing =
  "outline-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sol-purple)]";

/** The docs' signature label (sidebar sections, "On this page"). */
export const signatureLabel =
  "font-[family-name:var(--sol-font-mono)] text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-[var(--sol-dim)]";

export const mono = "font-[family-name:var(--sol-font-mono)]";

/** Screen-reader-only text that survives docs.css (unlike `sr-only`). */
export const visuallyHidden =
  "absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]";

/** 32px header icon button, as the docs header's theme switch. */
export const headerIconButton =
  "grid size-8 place-items-center rounded-lg text-[var(--sol-muted)] transition-colors duration-150 hover:bg-[var(--sol-soft)] hover:text-[var(--sol-text)] disabled:pointer-events-none disabled:text-[var(--sol-line-strong)] motion-reduce:transition-none";

/** 12px busy ring, as the docs' terminal status. */
export const spinner =
  "inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-[var(--sol-line)] border-t-[var(--sol-purple)] motion-reduce:animate-none";

/** Copy to the clipboard; `copied` stays true for 1.5s, as on the docs' code blocks. */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => {},
    );
  };
  return [copied, copy];
}
