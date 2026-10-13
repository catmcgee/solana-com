import { locales as allLocales } from "@workspace/i18n/config";

/** Every locale the legacy Fumadocs app served (en + 18). */
export const LEGACY_LOCALES: readonly string[] = allLocales;

export const DEFAULT_LOCALE = "en";

/**
 * Locales dropped by the migration (decisions.md: Mintlify has no `el`).
 * Their content is removed and their URLs redirect to the English page.
 */
export const DROPPED_LOCALES: readonly string[] = ["el"];

/** Non-default locales that migrate (17 after dropping el). */
export const TARGET_LOCALES: readonly string[] = LEGACY_LOCALES.filter(
  (l) => l !== DEFAULT_LOCALE && !DROPPED_LOCALES.includes(l),
);

/**
 * Folder/URL locale -> Mintlify `navigation.languages[].language` code.
 * Folder names and public URLs keep the left-hand value (decisions.md).
 */
export const MINTLIFY_LANGUAGE_CODE: Readonly<Record<string, string>> = {
  en: "en",
  ar: "ar",
  de: "de",
  es: "es",
  fi: "fi",
  fr: "fr",
  id: "id",
  it: "it",
  ja: "jp",
  ko: "ko",
  nl: "nl",
  pl: "pl",
  pt: "pt-BR",
  ru: "ru",
  tr: "tr",
  uk: "uk",
  vi: "vi",
  zh: "cn",
};
