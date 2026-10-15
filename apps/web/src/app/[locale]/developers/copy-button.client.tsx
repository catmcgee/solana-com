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
}: {
  text: string;
  /** Accessible name, e.g. "Copy the Claude Code command". */
  label: string;
  copyText: string;
  copiedText: string;
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
        className={`inline-flex h-8 shrink-0 items-center rounded-full border border-[var(--dl-line-strong)] px-3 font-brand text-[12.5px] font-medium text-[var(--dl-text)] transition-colors hover:border-[var(--dl-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dl-accent-text)] data-[copied]:border-[var(--dl-accent-line)] data-[copied]:text-[var(--dl-accent-text)] ${ready ? "" : "invisible"}`}
      >
        {copied ? copiedText : copyText}
      </button>
      <span role="status" className="sr-only">
        {copied ? copiedText : ""}
      </span>
    </>
  );
}
