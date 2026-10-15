/**
 * Shim for `next/navigation` (header bundle): the App Router hooks read
 * window.location. Used by ui-chrome (link.tsx through
 * @workspace/i18n/use-router, inkeep-config.ts) and by next-intl's
 * navigation APIs (@workspace/i18n/routing).
 */
import { useMemo, useSyncExternalStore } from "react";
import { getPathname, getSearch, localeOf, subscribe } from "../location.js";

export function usePathname() {
  return useSyncExternalStore(subscribe, getPathname, getPathname);
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, getSearch, getSearch);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** The `[locale]` segment, as in apps/web's app/[locale] routes. */
export function useParams() {
  const pathname = usePathname();
  return useMemo(() => ({ locale: localeOf(pathname) }), [pathname]);
}

const router = {
  push: (href) => window.location.assign(href),
  replace: (href) => window.location.replace(href),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => window.location.reload(),
  prefetch: () => {},
};

export function useRouter() {
  return router;
}

export function redirect(href) {
  window.location.assign(href);
}

export const permanentRedirect = redirect;

export function notFound() {}
