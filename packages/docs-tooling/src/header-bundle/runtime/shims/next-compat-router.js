/**
 * Shim for `next/compat/router` (header bundle): there is no Pages Router,
 * so it returns null, as Next.js does inside the App Router.
 * @workspace/i18n/use-router then falls back to next/navigation.
 */
export function useRouter() {
  return null;
}
