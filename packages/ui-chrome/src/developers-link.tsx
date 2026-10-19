"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "./link";
import { cn } from "./classnames";

/**
 * The "Developers" item of the solana.com header (2026-10-16). It replaced
 * the Build dropdown and sits right of Ecosystem. It opens /developers in the
 * same tab, like the other header items.
 */
export const DEVELOPERS_LINK = {
  href: "/developers",
  titleKey: "nav.developers.title",
} as const;

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
      className={cn("no-underline", className)}
      onClick={onClick}
      data-nav-item="developers"
    >
      {icon}
      <span>{t(DEVELOPERS_LINK.titleKey)}</span>
    </Link>
  );
}
