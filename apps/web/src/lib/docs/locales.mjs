/**
 * Locales with translated docs pages (apps/docs/<locale>/...): every
 * solana.com locale except English (the unprefixed default) and Greek, whose
 * docs were dropped (its URLs redirect to English, see rewrites-redirects).
 * Kept in step with @workspace/i18n by src/__tests__/docs-locales.test.ts;
 * this file is plain JS so source.config.ts can import it.
 */
export const DOCS_LOCALES = [
  "ar",
  "de",
  "es",
  "fi",
  "fr",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "tr",
  "uk",
  "vi",
  "zh",
];
