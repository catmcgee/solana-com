import { loader, type InferPageType } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { docs, docsI18n } from "@@/.source/server";
import { defaultLocale } from "@workspace/i18n/config";
import { DOCS_LOCALES } from "./locales.mjs";

/**
 * One Fumadocs loader for every docs page, English and translated
 * (collections in source.config.ts). The content keeps its apps/docs
 * layout, where English has no locale folder (developers/docs/x.mdx) and a
 * translation lives under it (ar/developers/docs/x.mdx). English paths get
 * an `en/` prefix here so the loader's `dir` i18n parser reads both, as the
 * docs app on origin/main did; the default locale is hidden in URLs.
 *
 * Page URLs equal the public paths: /developers/docs/..., /learn/...,
 * /developers/cookbook/..., /developers/bootcamp/..., each optionally under
 * /<locale>. `index` files are their folder's URL.
 */
const english = toFumadocsSource(docs, []);
const translated = toFumadocsSource(docsI18n, []);

for (const file of english.files) file.path = `${defaultLocale}/${file.path}`;

export const docsSource = loader({
  baseUrl: "/",
  source: { files: [...english.files, ...translated.files] },
  i18n: {
    defaultLanguage: defaultLocale,
    languages: [defaultLocale, ...DOCS_LOCALES],
    hideLocale: "default-locale",
    parser: "dir",
    // Missing translations are answered by the English page (as before).
    fallbackLanguage: defaultLocale,
  },
});

export type DocsPage = InferPageType<typeof docsSource>;

/** Locales that have docs (English first). */
export const docsLanguages: string[] = [defaultLocale, ...DOCS_LOCALES];
