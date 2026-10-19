"use client";

import { usePathname } from "next/navigation";
import { isDocsPageRoute } from "@solana-com/ui-chrome";

/**
 * Renders its children everywhere except on the developer docs pages, which
 * have their own Ask AI pill and search (components/docs).
 */
export function NotOnDocsPages({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isDocsPageRoute(pathname)) return null;
  return <>{children}</>;
}
