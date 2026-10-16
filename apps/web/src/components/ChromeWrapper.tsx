"use client";

import { usePathname } from "next/navigation";
import { isDocsChromeRoute } from "@solana-com/ui-chrome";

const CUSTOM_LAYOUT_PATTERNS = ["/playgg"];

/**
 * Renders the solana.com Header/Footer except on pages with their own chrome:
 * /playgg, and the /developers landing, which has the docs header and footer
 * (developers/docs-header.tsx, docs-footer.tsx).
 */
export function ChromeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCustomLayout =
    CUSTOM_LAYOUT_PATTERNS.some((p) => pathname.includes(p)) ||
    isDocsChromeRoute(pathname);
  if (isCustomLayout) return null;
  return <>{children}</>;
}
