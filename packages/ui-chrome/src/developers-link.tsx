"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "./link";
import { cn } from "./classnames";

/**
 * The "Developers" item of the solana.com header (2026-10-16). It replaced
 * the Build dropdown and sits right of Ecosystem. /developers wears the docs
 * chrome, so it opens in a new tab, marked with a small ↗ (the same glyph as
 * the external tab in developers-nav.tsx) and a visually hidden
 * "(opens in a new tab)".
 */
export const DEVELOPERS_LINK = {
  href: "/developers",
  titleKey: "nav.developers.title",
  newTabKey: "nav.newTab",
} as const;

export const NEW_TAB_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

export function NewTabMark({ text }: { text: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        data-new-tab-mark=""
        className="ml-1 inline-block text-[0.8em] leading-none opacity-60"
      >
        ↗
      </span>
      <span className="sr-only"> {text}</span>
    </>
  );
}

export function DevelopersLink({
  className,
  onClick,
  icon,
}: {
  className?: string;
  onClick?: () => void;
  /** Leading icon (the mobile menu's rows have one). */
  icon?: ReactNode;
}) {
  const t = useTranslations();
  return (
    <Link
      to={DEVELOPERS_LINK.href}
      {...NEW_TAB_PROPS}
      className={cn("no-underline", className)}
      onClick={onClick}
      data-nav-item="developers"
    >
      {icon}
      <span>
        {t(DEVELOPERS_LINK.titleKey)}
        <NewTabMark text={t(DEVELOPERS_LINK.newTabKey)} />
      </span>
    </Link>
  );
}
