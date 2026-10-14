/**
 * Pages deliberately left out of every navigation, with the reason. Mintlify
 * still builds them (it publishes every .mdx file), so this list must stay
 * short and each entry needs an owner to remove the file.
 *
 * Hidden-but-navigable pages (the Learn articles, docs/tags, docs/tools/ai)
 * are NOT here: they sit in `hidden: true` tabs in en.json.
 */
import type { UnlistedPage } from "./types.ts";

export const UNLISTED: readonly UnlistedPage[] = [
  // Empty. docs/payments/accept-payments/payment-button (17 stale locale-only
  // copies, spec R8) was removed at integration (WP12): WP9 ported its
  // redirect to apps/web and the files were git rm'd.
];

export function isUnlisted(
  page: string,
  loc: string,
): UnlistedPage | undefined {
  return UNLISTED.find(
    (u) => u.page === page && (u.locales === "*" || u.locales.includes(loc)),
  );
}
