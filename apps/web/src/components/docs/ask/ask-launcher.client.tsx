"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/app/components/utils";
import { askStore } from "@/lib/docs/ask/store";
import { focusRing } from "./ui";

/** How the root finds the launcher (to give focus back on close). */
export const LAUNCHER_SELECTOR = "[data-ask-launcher]";

/**
 * "✨ Ask AI": a purple pill at the bottom end of the page from 1024px
 * (narrower screens use the header's ✨ button). Hidden while the panel is
 * open, including before hydration when the prepaint script has docked it.
 * Hovering or focusing it starts a session, so the first answer is quicker.
 * The shortcut (⌘I / Ctrl I) is only in the tooltip. The pill stays
 * invisible until hydration, since it can't open anything before then.
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
          "group inline-flex h-10 items-center gap-2 rounded-full bg-[var(--sol-cta)] px-4 text-[14px] font-medium leading-5 text-[var(--sol-cta-text)] shadow-[0_6px_20px_-8px_rgb(153_69_255/0.55)] transition-colors duration-150 hover:bg-[var(--sol-cta-hover)] motion-reduce:transition-none",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="text-[15px] leading-none transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110 motion-reduce:transition-none"
        >
          ✨
        </span>
        {tc("askAI")}
      </button>
    </div>
  );
}
