"use client";

import { useEffect, useRef, useState } from "react";

const COPIED_MS = 2000;

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure origins: copy through a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

const PLAIN =
  "inline-flex h-7 shrink-0 items-center rounded-md border border-[var(--dl-line-strong)] bg-[var(--dl-surface)] px-2.5 font-brand text-xs font-medium text-[var(--dl-muted)] transition-colors hover:border-[var(--dl-dim)] hover:text-[var(--dl-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dl-accent)] data-[copied]:border-[var(--dl-accent-line)] data-[copied]:text-[var(--dl-accent-text)]";
const ICON =
  "inline-grid size-[34px] shrink-0 place-items-center rounded-lg bg-[var(--dl-accent)] text-[var(--dl-on-accent)] transition-colors hover:bg-[var(--dl-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dl-accent)]";

/**
 * Copies `text` exactly. The server render (and so the no-JS page) has the
 * button hidden and disabled, because it cannot work without JavaScript; the
 * text next to it stays selectable. It turns on after hydration.
 */
export function CopyButton({
  text,
  label,
  copyText,
  copiedText,
  tone = "plain",
}: {
  text: string;
  /** Accessible name, e.g. "Copy the Claude Code command". */
  label: string;
  copyText: string;
  copiedText: string;
  /** "icon": a square purple button with only a copy icon (and a tick once
   * copied); `label` is its accessible name. */
  tone?: "plain" | "icon";
}) {
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setReady(true);
    return () => clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={!ready}
        aria-hidden={ready ? undefined : true}
        aria-label={label}
        data-copied={copied ? "" : undefined}
        className={`${tone === "icon" ? ICON : PLAIN} ${ready ? "" : "invisible"}`}
      >
        {tone === "icon" ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-3.5"
          >
            {copied ? (
              <path d="M3 8.5 6.5 12 13 4.5" />
            ) : (
              <>
                <rect x="5" y="5" width="9" height="9" rx="2" />
                <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
              </>
            )}
          </svg>
        ) : copied ? (
          copiedText
        ) : (
          copyText
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? copiedText : ""}
      </span>
    </>
  );
}
