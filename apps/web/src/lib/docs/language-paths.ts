import { languages } from "@workspace/i18n/config";
import type { ResolvedDocsPage } from "./page-data";
import { DOCS_LOCALES } from "./locales.mjs";

/**
 * The current page in every language, for the header's language menu.
 * Locales without docs (Greek) link the English page; untranslated pages
 * are answered by English at their locale URL, as before.
 */
export function languagePaths(
  resolved: ResolvedDocsPage,
): Record<string, string> {
  const base = resolved.page.url.replace(
    new RegExp(`^/(?:${DOCS_LOCALES.join("|")})(?=/)`),
    "",
  );
  const out: Record<string, string> = {};
  for (const code of Object.keys(languages)) {
    out[code] =
      code === "en" || !DOCS_LOCALES.includes(code) ? base : `/${code}${base}`;
  }
  return out;
}
