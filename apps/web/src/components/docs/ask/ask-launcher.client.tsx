"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/app/components/utils";
import { askStore } from "@/lib/docs/ask/store";
import { focusRing, mono } from "./ui";

/** How the root finds the launcher (to give focus back on close). */
export const LAUNCHER_SELECTOR = "[data-ask-launcher]";

/**
 * "✨ Ask AI": a hairline pill at the bottom end of the page from 1024px
 * (narrower screens use the header's ✨ button). Hidden while the panel is
 * open, including before hydration when the prepaint script has docked it.
 * Hovering or focusing it starts a session, so the first answer is quicker.
 * The shortcut shows as a quiet kbd from 1280px and in the tooltip. The
 * pill stays invisible until hydration has picked the shortcut's keys (it
 * can't open anything before then), so it doesn't widen in view.
 */
export function AskLauncher() {
  const t = useTranslations("docsAsk");
  const tc = useTranslations("commands");
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    setShortcut(
      /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
        ? "⌘I"
        : "Ctrl I",
    );
  }, []);
  return (
    <div
      data-dev-landing="docs"
      data-docs=""
      className={cn(
        "fixed bottom-6 end-6 z-30 rounded-full !bg-transparent max-lg:hidden [html[data-ask]_&]:invisible",
        shortcut === null && "invisible",
      )}
    >
      <button
        type="button"
        data-ask-launcher=""
        aria-label={tc("askAI")}
        title={shortcut ? t("shortcutHint", { key: shortcut }) : undefined}
        onClick={() => askStore.open()}
        onPointerEnter={() => askStore.warm()}
        onFocus={() => askStore.warm()}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-[var(--sol-line-strong)] bg-[var(--sol-page)] px-4 text-[14px] font-medium leading-5 text-[var(--sol-text)] shadow-[var(--sol-menu-shadow)] transition-colors duration-150 hover:bg-[var(--sol-soft)] motion-reduce:transition-none",
          focusRing,
        )}
      >
        <span aria-hidden="true" className="text-[15px] leading-none">
          ✨
        </span>
        {tc("askAI")}
        {shortcut ? (
          <kbd
            aria-hidden="true"
            className={cn(
              mono,
              "ms-0.5 text-[11px] font-medium leading-4 text-[var(--sol-dim)] max-xl:hidden",
            )}
          >
            {shortcut}
          </kbd>
        ) : null}
      </button>
    </div>
  );
}
