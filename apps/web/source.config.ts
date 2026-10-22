/**
 * Fumadocs MDX collections for the developer docs (rendered natively by this
 * app since phase 2a; Mintlify is no longer used).
 *
 * The content stays where it is, in apps/docs:
 * - `docs`: every English page under apps/docs/developers/{docs,cookbook}
 *   and apps/docs/learn;
 * - `docsI18n`: the translated copies under apps/docs/<locale>/developers/docs
 *   and apps/docs/<locale>/learn (the cookbook is English only).
 * Snippets (apps/docs/snippets) are not a collection: remark-docs-compat
 * inlines every `import X from "/snippets/..."` into the page that uses it,
 * so they compile with the page and appear in its Markdown.
 *
 * English is `async` (frontmatter eagerly, bodies on demand), as the docs
 * app on origin/main had it, so a route only loads the page it renders.
 * Translations are `dynamic`: compiled at request time from the files (then
 * cached with the page), since bundling 8,000+ MDX modules does not fit in
 * the build machine's memory. Like main, only English is prerendered.
 */
import { defineCollections, defineConfig } from "fumadocs-mdx/config";
import { pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";
import {
  docsSlug,
  remarkDocsCompat,
} from "./src/lib/docs/remark-docs-compat.mjs";
import { rehypeDocsCompat } from "./src/lib/docs/rehype-docs-compat.mjs";
import { codeBlockOptions } from "./src/lib/docs/code-options.mjs";
import { DOCS_LOCALES } from "./src/lib/docs/locales.mjs";

const docsDir = "../docs";

/** Frontmatter used by the docs (Mintlify conventions, kept as written). */
const schema = pageSchema
  .extend({
    sidebarTitle: z.string().optional(),
    mode: z.string().optional(),
    hideFooterPagination: z.boolean().optional(),
    noindex: z.boolean().optional(),
    keywords: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    url: z.string().optional(),
  })
  // og:*, twitter:*, type, related, prerequisites, date, ... pass through.
  .loose();

const locales = `{${DOCS_LOCALES.join(",")}}`;

export const docs = defineCollections({
  type: "doc",
  dir: docsDir,
  files: ["developers/{docs,cookbook}/**/*.mdx", "learn/**/*.mdx"],
  schema,
  async: true,
  postprocess: { includeProcessedMarkdown: { headingIds: false } },
});

export const docsI18n = defineCollections({
  type: "doc",
  dir: docsDir,
  files: [`${locales}/developers/docs/**/*.mdx`, `${locales}/learn/**/*.mdx`],
  schema,
  dynamic: true,
  postprocess: { includeProcessedMarkdown: { headingIds: false } },
});

export default defineConfig({
  mdxOptions: {
    // Our plugin first, so inlined snippets get headings, TOC and structure.
    remarkPlugins: (v) => [remarkDocsCompat, ...v],
    // Ours before rehype-code (Shiki), so it sees the plain fences.
    rehypePlugins: (v) => [rehypeDocsCompat, ...v],
    remarkHeadingOptions: { slug: docsSlug },
    // Content images are plain URLs under /docs-assets (copied to public/).
    remarkImageOptions: false,
    remarkCodeTabOptions: false,
    remarkNpmOptions: false,
    rehypeCodeOptions: codeBlockOptions,
  },
});
