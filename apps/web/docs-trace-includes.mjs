/**
 * Files that translated docs pages read at request time. Translations are
 * compiled on first request (fumadocs-mdx `dynamic`, source.config.ts), so
 * these routes need the locale sources and the snippets in their functions.
 * Shared by next.config.ts (outputFileTracingIncludes) and
 * scripts/trace-docs-sources.mjs, which adds them to routes Next treats as
 * prerendered: Next skips outputFileTracingIncludes for those.
 */
export const DOCS_SOURCE_ROUTES = [
  "/[locale]/developers/docs/[[...slug]]",
  "/[locale]/developers/cookbook/[[...slug]]",
  "/[locale]/learn/[...slug]",
  "/api/markdown/[...slug]",
  "/mcp",
  "/llms-full.txt",
];

export const DOCS_SOURCE_GLOBS = [
  "../docs/{ar,de,es,fi,fr,id,it,ja,ko,nl,pl,pt,ru,tr,uk,vi,zh}/**/*.mdx",
  "../docs/snippets/**/*.mdx",
];
