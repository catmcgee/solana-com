# Authoring and tooling guide: Solana developer docs

This file replaces `apps/docs/CLAUDE.md` and `apps/docs/AGENTS.md`. The content
in `apps/docs` is rendered by `apps/web` with Fumadocs
(`apps/web/source.config.ts`, `apps/web/src/lib/docs/`,
`apps/web/src/components/docs/`) and served at `/developers/docs`; keep
agent/contributor notes out of the content folder.

Status: every page is converted (`convert --check` is clean on all 8,870 files,
including the pages the WP8a writers edited), navigation, generators and routing
are wired, and `docs-tooling verify` runs every repo-side check. What can only
be checked on a deployment is listed under "Release gates" below.

## Where things live

| Path                                         | What                                                                                                                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs/`                                 | Docs content root, read by apps/web (`source.config.ts`). No `package.json`.                                                                                                                                          |
| `apps/docs/docs.json`                        | Site config read by apps/web and docs-tooling: name, description, footer, `navigation` (`$ref` to `navigation/<lang>.json`), `search.prompt`, `seo.metatags`, `markdown.instructions`, `errors.404`.                  |
| `apps/docs/developers/docs/**`               | English docs, served at `/developers/docs/**` (`index.mdx` = folder URL). Moved from `apps/docs/docs/**` (`/docs/**`) on 2026-10-16; see "The /developers/docs move".                                                 |
| `apps/docs/developers/cookbook/**`           | Cookbook (English only), `/developers/cookbook/**`.                                                                                                                                                                   |
| `apps/docs/learn/*.mdx`                      | English learn articles, `/learn/<slug>`. The `/learn` landing is a React page moving to apps/web (WP10).                                                                                                              |
| `apps/docs/<loc>/{developers/docs,learn}/**` | Translations for ar de es fi fr id it ja ko nl pl pt ru tr uk vi zh. Greek (`el`) was removed.                                                                                                                        |
| `apps/docs/docs-assets/**`                   | Images/video served at `/docs-assets/<original public path>`.                                                                                                                                                         |
| `apps/docs/**/meta.json`                     | Removed at integration (WP12): the legacy Fumadocs nav is compiled into `navigation/en.json`; `nav compile-legacy` reads the originals from git (`LEGACY_REF`).                                                       |
| `packages/docs-tooling/`                     | All build/migration tooling (this package).                                                                                                                                                                           |
| `packages/docs-tooling/data/`                | Data moved out of the Next app: Surfpool JSON schemas, bootcamp curriculum, learn order, legacy `resources.json`.                                                                                                     |
| `packages/docs-tooling/legacy/`              | Legacy TypeScript kept for reference by later work packages (not compiled).                                                                                                                                           |
| `migration/` (repo root)                     | Review artifacts: `legacy-urls.{txt,tsv}`, `move-map.csv`, `assets-diff.txt`, `asset-refs.csv`, `docs-app-redirects.json`, `pending-web-work.json` (WP9/WP10 handoff), `verify-urls.tsv`, `missing-translations.txt`. |

Rules for `apps/docs`:

- Never add `.js`, `.jsx` or `.css` files except the owned globals
  (`run-examples.js`, `ask-ai.js`, `playground.js`, `video-chapters.js`,
  `styles/*.css`, and the others in the `strayAssetsInDocsRoot` allowlist).
  apps/web copies the scripts to `/docs-scripts/`
  (`scripts/copy-docs-static.mjs`) and imports the styles
  (`components/docs/docs-styles.ts`); a new file needs an entry in both and in
  the allowlist. `verify-urls` fails on strays.
- Never add `.md` notes (README, CLAUDE.md, AGENTS.md) to `apps/docs`. Put them
  in `packages/docs-tooling`.
- Folder paths are public URLs. Moving a file changes its URL and needs an
  `apps/web/rewrites-redirects.ts` redirect (page and `.md` twin).
- Merging a duplicate page into another: move its unique content first, delete
  the EN file and its locale copies, add the old URL to `movedDocsRedirects`
  (the bare, `/:locale/` and `.md` variants are generated; a destination with an
  `#anchor` gets no `.md` twin, so add that to `anchoredMdTwinRedirects`),
  repoint any existing redirect that targeted the removed page (no chains),
  update `navigation/en.json` and inbound links, then run `generate` and
  `verify`. `apps/web/rewrites-redirects.ts` is the only redirect source. The
  2026-10-15 merges are listed in the comment above those redirects. Redirect
  sources keep the URL readers had (`/docs/...` for pages that moved before
  2026-10-16); destinations are always the final `/developers/docs/...` page.

### The /developers/docs move (2026-10-16)

The docs moved from `/docs` to `/developers/docs` (files from `apps/docs/docs`
and `apps/docs/<loc>/docs` to `apps/docs/developers/docs` and
`apps/docs/<loc>/developers/docs`, with `git mv`). What keeps old links working:

- apps/web `docsPrefixMoveRedirects` (last in the redirect list): `/docs`,
  `/docs.md`, `/docs/*`, `/en/docs/*` and `/<loc>/docs/*` answer one 308 to the
  same path under `/developers/docs` (query strings kept, so `/docs?q=` still
  opens the search). Page-level redirects run first and point straight at the
  final page, so a page that moved is still one hop. Greek goes
  `/el/docs/x -> /docs/x -> /developers/docs/x` (two hops).
- `verify-urls` follows every legacy URL through the apps/web redirects and
  fails a chain longer than two hops (`redirect-chain`) or one that ends on
  nothing (`redirect-dead`). `migration/move-map.csv` points at the new files
  and URLs; `migration/legacy-urls.*` keep the legacy URLs.
- Internal links in content, snippets, generator sources, apps/web, ui-chrome
  and the i18n messages use `/developers/docs/...` directly.
- Locale folders keep our codes (`ja`, `zh`, `pt`); docs.json
  `navigation.languages` uses `jp`, `cn`, `pt-BR` (see `src/lib/locales.ts`).
- Translations come from Lingo, never from agents.

## Commands

```bash
pnpm dev:web                                          # apps/web on :3000, docs at /developers/docs
pnpm --filter @workspace/docs-tooling verify          # every repo-side check
pnpm --filter @workspace/docs-tooling generate:check  # every generator --check
pnpm --filter @workspace/docs-tooling test            # vitest (rules + fixtures)
pnpm --filter @workspace/docs-tooling check-types
pnpm --filter @workspace/docs-tooling cli <command>   # see below
```

CLI commands (`src/cli.ts`). Unknown options are rejected before anything runs
(an ignored `--help` once ran `convert` in write mode over the corpus).

| Command                                                                   | Purpose                                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `legacy-urls [--ref <sha>]`                                               | Every URL the Fumadocs app served (git `023c6d918`) -> `migration/legacy-urls.{txt,tsv}`       |
| `move [--dry-run]`                                                        | R1-R9 `git mv`/`git rm`, Greek removal, data + asset moves; writes `migration/move-map.csv`    |
| `remove-next-app [--dry-run] [--force]`                                   | `git rm` the Next app                                                                          |
| `verify-redirects`                                                        | apps/web redirect coverage for R8 files                                                        |
| `verify-urls`                                                             | Legacy URL parity (10,970 URLs): file, apps/web redirect, cookbook rewrite or English fallback |
| `convert [--files p] [--exclude p1,p2] [--locale l] [--check\|--dry-run]` | Run the auto-discovered transforms. `--check` fails if any file would change                   |
| `residual [--json]`                                                       | Residual Fumadocs/Code Hike syntax scan (spec §4.4.2); every pattern must be 0                 |
| `verify [--skip-generators] [--skip-convert]`                             | All repo-side spec §4.4 checks (see "Integration pipeline")                                    |
| `nav compile-legacy\|build\|swap\|verify [--check]`                       | Navigation (WP6, `src/nav/`)                                                                   |
| `examples [--check]`                                                      | Build runnable example snippets (WP5)                                                          |

Package scripts (`pnpm --filter @workspace/docs-tooling <script>`):

| Script                                                                    | Entry                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `convert`, `residual`, `verify`, `verify-urls`, `nav:*`, `examples:build` | `src/cli.ts`                                                             |
| `examples:extract`                                                        | `src/examples/main.ts extract` (one-time; `blocks.json` per example dir) |
| `gen:surfpool [--check\|--sync --ref main]`                               | `src/generators/surfpool-rpc.ts`                                         |
| `gen:paths`, `gen:concepts`, `gen:addresses` `[--sync] [--check]`         | `src/generators/{paths,concepts,addresses}.ts`                           |
| `gen:tags [--check]`                                                      | `src/generators/tags.ts`                                                 |
| `gen:manifest`, `gen:llms` `[--check]`                                    | `src/manifest/cli.ts`                                                    |
| `generate` / `generate:check`                                             | every generator, in dependency order                                     |
| `theme-check --base <url>`                                                | `scripts/theme-check.mjs` (Playwright, WP11)                             |

## Writing a convert transform (WP2+)

Transforms are **auto-discovered**: `discoverTransforms()`
(`src/convert/registry.ts`) imports every `src/convert/transforms/*.ts` and
registers its `transform` export. Adding a transform means adding one file;
there is no shared list to edit. Files starting with `_` (shared helpers, e.g.
`_jsx.ts`), `*.test.ts` and `*.d.ts` are skipped.

### Module contract

```ts
// src/convert/transforms/callout.ts
import type { Transform } from "../../types.ts";

export const transform: Transform = {
  name: "callout", // kebab-case, MUST equal the file name
  order: 230, // finite number; lower runs first, ties broken by name
  owner: "WP2",
  // Optional cheap text pre-check; the file is skipped (not parsed) when
  // no transform applies.
  appliesTo: (source) => source.includes("<Callout"),
  run(tree, file, ctx) {
    // Mutate the mdast tree in place. `file` = { path, locale, collection,
    // frontmatter, source } (`source` is the original text; node positions
    // index into it). Report with ctx.warn(msg) / ctx.error(msg).
  },
};
```

Discovery fails loudly (naming the file) on a missing `transform` export, a
`name` that differs from the file name, a non-numeric `order` or a duplicate.
`order` values are distinct (a test enforces it), so the run order never depends
on a name tie-break. Bands as integrated (`ORDER_BANDS` in `registry.ts`):

| Order   | Transforms                                                                                                                                                    | Why there                                                                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10      | frontmatter                                                                                                                                                   | everything else sees normalized keys                                                                                                                                                                                                                                                                                         |
| 80-90   | notes 80, mentions 81, side-by-side 82, scrolly 83, files 84, codetabs-examples 85, mermaid 86, return-type 87, terminal 88, api-method 89, code-reference 90 | they read RAW Code Hike fence syntax (`!tooltip`, `!!request`, `!hover`, `file=`) that fences.ts rewrites                                                                                                                                                                                                                    |
| 150     | inline-code                                                                                                                                                   | `_lang`code`_`, plus the unclosed `_lang`code`` / `\_lang`code`` that some translations left (known code languages only); residual has a pattern for each                                                                                                                                                                    |
| 210-300 | callout, cards, tabs, steps, accordion, embed, html, themed-image, images, codetabs 300                                                                       | docs components                                                                                                                                                                                                                                                                                                              |
| 610-650 | bootcamp, video-guides, learn, site-links 650                                                                                                                 | collections, then link rewriting                                                                                                                                                                                                                                                                                             |
| 900     | fences                                                                                                                                                        | deliberately last among rewrites: skips fences still inside an unconverted Code Hike container; writes highlights as `highlight={…}` so a re-run can tell them from legacy brace meta                                                                                                                                        |
| 910     | web3js-specifier                                                                                                                                              | `@solana/web3.js-(v3\|legacy)` -> `@solana/web3.js`; `restoreWeb3jsSpecifier()` is used by examples                                                                                                                                                                                                                          |
| 920     | anchors                                                                                                                                                       | needs final headings and Step titles                                                                                                                                                                                                                                                                                         |
| 930     | dedupe-lede                                                                                                                                                   | drops a first body paragraph that repeats `description` (apps/web renders `description` as the lede; 51 EN pages, mostly RPC, showed it twice)                                                                                                                                                                               |
| 950     | dollar-escape                                                                                                                                                 | a renderer with single-dollar inline math (remark-math) reads two `$` in one paragraph, heading or table row as KaTeX. Every unescaped prose `$` in such a block becomes `\$`; code and JSX attributes are untouched. `verify` fails on any remaining block (pages and snippets); `math: true` in frontmatter exempts a page |

Ownership decisions made at integration: `terminal.ts`/`mermaid.ts` (WP3) own
terminal fences and mermaid fallbacks; fences.ts still has equivalent branches,
but every corpus fence is converted by WP3 first. Both agree on output
(`bash Terminal` + `text Output`, or one `console` fence inside tab
groups/titled; caption `.sol-caption`). DocsDiagram is themed-image.ts only.

Rules:

1. **Pure and idempotent.** No clock or randomness. Read-only lookups of the
   committed tree are allowed and deterministic (asset index, example snippets,
   target-page headings in `anchors`). None of a transform's input constructs
   may appear in its output, so converting twice is a byte-identical no-op
   (`convert --check` in CI).
2. **Edit the tree, not text.** The tree is mdast from remark-parse +
   remark-frontmatter (yaml) + remark-gfm + remark-mdx (`.md` files are parsed
   without remark-mdx). JSX is `mdxJsxFlowElement`/`mdxJsxTextElement` with
   `name` and `attributes`; `@types/mdast` and `mdast-util-mdx` give the types
   (cast the `AstNode` you receive).
3. **Frontmatter:** change `file.frontmatter` (a plain object), never the `yaml`
   node. The codec rewrites line-locally: untouched top-level entries are copied
   byte for byte (folded `description: >-` and multi-line plain scalars keep
   their line breaks), changed entries are re-rendered in place (80 columns),
   deleted entries go, new keys are appended. Keys that are not plain
   identifiers are quoted (`"og:title": …`).
4. **Escape hatch:** `{ type: "raw", value: "..." }` is emitted verbatim (flow
   or inline). Use it only for syntax mdast cannot express.
5. **Errors:** a transform that throws is reported as an `error` diagnostic and
   the file is left unchanged; a file that does not parse is reported as
   `codec:mdx` and left unchanged.

### What the codec preserves (`src/convert/codec.ts`)

The codec is source-preserving, so unconverted parts of a file never churn:

- An untouched node is copied byte-for-byte from the source. A file no transform
  changes round-trips identically (all 8,861 pages verified).
- When children of the root, a JSX element or an inline container change, only
  the changed/new children are serialized; the original whitespace between
  untouched siblings is kept. Renaming a JSX element (no attribute change) swaps
  only the names in its tags; changing attributes regenerates only the
  opening/closing tags.
- Nodes moved into a new parent (e.g. a fence wrapped in `<CodeGroup>`) keep
  their original text, re-indented for the new position.
- Anything else that changed is printed by remark-stringify (`-` bullets,
  `*`/`**`, backtick fences, one-space list indent). Expect that output to be
  valid but not necessarily prettier-identical. Known cosmetic quirks: editing a
  table cell re-aligns the table; `**_x_**` re-printed becomes `***x***`;
  whitespace inside multi-line inline code or JS attribute expressions can shift
  when their element is re-printed.

`test/codec-roundtrip.test.ts` proves identity, lossless re-printing, local
edits, moves and idempotency on 30 sampled pages across collections and locales.

### Fixtures

Add `__fixtures__/convert/<name>/<case>/{in.mdx,out.mdx,meta.json?}` with at
least one English and one locale case (`meta.json`:
`{ "path", "locale", "collection" }`). `test/convert-fixtures.test.ts` runs the
golden and idempotency checks for every discovered transform, through the real
MDX codec. Run one transform's fixtures with
`pnpm --filter @workspace/docs-tooling test -t "transform <name>"`.

Use `convert --dry-run [--files docs/core]` to see which real files a transform
would change without writing them.

## Assets

Assets live at `apps/docs/docs-assets/<original public path>` and apps/web
serves them at `/docs-assets/<same path>` (`scripts/copy-docs-static.mjs` copies
them into `public/`). Convert rewrote every `/assets/...`, `/images/...` and
`/img/...` reference (WP2 `images.ts`, `themed-image.ts`, `html.ts`); new
content must use `/docs-assets/...` (`verify` checks every reference exists and
every `-light` themed variant has its dark twin). `migration/asset-refs.csv`
lists every reference, its file and its rewritten URL. All 130 referenced files
came from `apps/docs/public`; none had to be copied from `apps/web/public`.
`apps/web/public` keeps its own copies for existing hotlinks.

## Site config and theme (WP11)

`apps/docs/docs.json` holds the site config apps/web and docs-tooling read (keys
listed under "Where things live"). `apps/docs/styles/theme.css` is the brand
theme; apps/web imports it with the other `styles/*.css` files
(`components/docs/docs-styles.ts`). Brand files are in
`apps/docs/docs-assets/brand/`:

- `solana-logo-on-light.svg` (black wordmark) and `solana-logo-on-dark.svg`
  (white wordmark). Both are copied from `packages/ui-chrome`
  `logotype.inline.svg`.
- `favicon.svg` and `favicon.ico`.
- Fonts are in `apps/docs/fonts/` (copied to `/fonts/*` by apps/web
  `scripts/copy-docs-static.mjs`): ABC Diatype (300/400/500/700 plus italics),
  ABC Monument Extended (400/700) and ABC Favorit Mono (variable). All are woff2
  copies of `apps/web/src/fonts`.

Theme rules:

- **Fonts.** `theme.css` declares the faces with `@font-face`. Code uses ABC
  Favorit Mono. Monument is opt-in through `className="solana-display"` for hub
  and landing headings. CSS font and image URLs must be absolute (`/fonts/...`,
  `/docs-assets/...`).
- **Colors.** Light mode links use `#7A2FE0` (6.3:1 on white). Dark mode links
  use `#B78AFF` (8.1:1 on black). The dark page background is `#000`, like
  solana.com.
- **Top bar.** The docs header is apps/web
  `src/app/[locale]/developers/docs-header.tsx` (logo, tabs, search, theme and
  language), shared with the /developers landing and kept to one row at every
  width. Tabs and labels come from the docs navigation
  (`src/data/developers/docs-nav.ts`), including the divider after tab 4
  (Markets, `DOCS_TAB_DIVIDER_AFTER`). Links from other solana.com pages into
  the docs open in a new tab (`isDocsHref` in
  packages/ui-chrome/src/url-config.ts).
- **RTL (`ar`).** apps/web sets `<html lang="ar" dir="rtl">` (rtl-detect in
  `src/app/[locale]/layout.tsx`). `theme.css` flips the text regions (content,
  header, sidebar, TOC, pagination) to RTL and keeps code LTR.
- **Theme without JS.** `DocsThemePrepaint` (apps/web
  `src/app/[locale]/developers/theme-prepaint.tsx`) sets the theme class and
  `html[data-theme-preference]` before paint. Without JS neither is set; the
  theme must read in that case too.
- **Verify** with
  `pnpm --filter @workspace/docs-tooling theme-check --base <url>`
  (`scripts/theme-check.mjs`, default base `http://localhost:3000`). It is
  Playwright-based and covers light and dark, JS on and off, desktop and mobile.
  Run it after theme or docs header changes.

Consent and analytics: GTM and PostHog are configured in apps/web
(`src/components/GTMTrackingSnippet.tsx`,
`src/app/components/posthog/PostHogProvider.tsx`) and follow the solana.com
cookie consent banner (`CookieConsent`), the same as every other solana.com
page. GTM loads on production deployments only.

## Integration pipeline (WP12)

Order (each step is idempotent; re-run from the top after any change):

1. `examples:build --check` (and `examples:extract` once): `codetabs-examples`
   errors when a snippet or `blocks.json` entry is missing.
2. `convert` (write), then `convert --check` must report 0 changes.
3. `generate`: `examples:build`, `gen:surfpool`, `gen:paths`,
   `gen:concepts --sync`, `gen:addresses --sync` (concepts reads the path pages,
   so this order), `nav:build`, `gen:tags` (after any tab-root title or
   description change, or a new hub), `gen:manifest`, `gen:llms` (manifest, then
   llms).
4. `verify` (below) and `generate:check`, then build apps/web
   (`pnpm --filter solana-com build`), which compiles every English page.
5. After convert rewrites locale files:
   `node scripts/i18n/rekey-lock.mjs --rehash`, so converted targets do not read
   as "diverged from Lingo lock".

`verify` checks (exit 1 on any failure): page counts per collection/locale
(report), residual syntax = 0 (`src/verify/residual.ts` prints every pattern
with its count), nav coverage (`nav verify`), legacy URL parity (`verify-urls`),
frontmatter (`type` enum, parses), assets, every generator `--check`,
`convert --check`.

`convert --files` takes a path prefix or a comma-separated list of them
(`--files docs/index.mdx,docs/core`). The WP8a writer pages were converted this
way at WP13; `scripts/protected-convert.py` (skip pages that differ from HEAD)
is only needed again if hand edits and a corpus-wide convert overlap.

Lingo lock after a convert: run
`node scripts/i18n/rekey-lock.mjs --rehash --source-changed packages/docs-tooling/data/lingo-source-changed.txt`.
`--rehash` refreshes every hash (so mechanically converted targets don't read as
diverged); `--source-changed` keeps the pre-migration hash for the English pages
whose text was really rewritten, so the next Lingo run retranslates them. Their
locale copies still have the pre-migration structure until then (for example
`docs/index`: EN has the job picker, the locales the old quickstart cards).

Hub pages rewritten by hand for the new IA (decisions.md), not by convert; their
wording changed on purpose, and every original link target is still linked:

- `docs/index`: the job picker. The Quickstart and "Learn the concepts" cards
  and the overview diagram are kept.
- `docs/payments/index`: reorganised around the checkout and paywall paths; the
  original intro paragraph is kept.
- `docs/finance/index` (the "All use cases" hub) was removed on 2026-10-16.
  Start here and the Payments, Assets, and Markets landings link every page it
  listed, and its overview diagram moved to the Assets landing. `/docs/finance`
  and `/developers/docs/finance` redirect to `/developers/docs`.

Locale copies of these hubs keep the old structure until the next Lingo run.

`scripts/crawl-docs.py --base http://localhost:3000` fetches every page in
`generated/pages.json` from a running apps/web (`pnpm dev:web`, or a preview
deployment) and checks HTTP 200 plus the page title in the HTML.

### Links and anchors

- `site-links` (650): root-relative links to pages apps/web serves (`/skills`,
  `/discord`, `/developers/templates`, …) become `https://solana.com/…`; the
  docs routes are only `/developers/docs/**`, `/learn/<article>`,
  `/developers/cookbook/**`, `/docs-assets/**`
  (optionally locale-prefixed; old `/docs/**` links are left alone because they
  redirect). Bare relative links are resolved the way the legacy browser did.
  GFM autolinks that swallowed CJK/Arabic punctuation are cut.
- `anchors` (920): docs heading ids come from @sindresorhus/slugify
  (`actions.json` -> `#actions-json`), not github-slugger (`#actionsjson`):
  `docsSlugger` in `src/lib/slugs.ts`, and `docsSlug` in apps/web
  (`remark-docs-compat.mjs`, `rehype-docs-compat.mjs`) produces the same ids.
  Fragments that pointed at a legacy id are rewritten to the docs id of the same
  heading; English fragments on translated pages are mapped by heading position
  when the outlines match. Write new anchors in that form. Fragments that match
  nothing are warnings: they were already dead on the legacy site.
- Step titles get ids too. Set `id` on a `<Step>` if inbound anchor links matter
  more than the generated slug.

## Reading without JavaScript

Every page must read completely with JavaScript off (decisions.md). apps/web
server-renders inactive Tabs/CodeGroup panels but hides them
(`components/docs/docs-components.client.tsx`); `apps/docs/styles/nojs.css`
un-hides and stacks them when `html:not([data-theme-preference])` (apps/web's
`DocsThemePrepaint` head script sets that attribute; without JS it never
appears). Patterns:

| Need                                  | Use                                                                                                                                                                                                                                                                                                                                                                      | Never                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Hide-without-JS-only content          | `className="nojs-only"` (`div` or `span`)                                                                                                                                                                                                                                                                                                                                | raw `<noscript>` (stripped)                                                                   |
| Collapsible                           | `<Accordion>` / `<Expandable>` (native `<details>`)                                                                                                                                                                                                                                                                                                                      | raw `<details>`, `<abbr>` (stripped)                                                          |
| Tooltip text                          | `<Tooltip tip="T">x</Tooltip><span className="nojs-only"> (T)</span>` (sibling, not child)                                                                                                                                                                                                                                                                               | text only in `tip`                                                                            |
| Mermaid                               | keep the fence; convert adds `<div className="sol-mermaid" data-fallback="mermaid">` with the pre-rendered light/dark SVG (run `tsx scripts/render-mermaid.ts` then `python3 scripts/embed-diagram-fonts.py`); caption `.sol-caption`                                                                                                                                    | hand-written fallback divs                                                                    |
| iframe / YouTube                      | `<Frame><iframe/></Frame>` plus a plain link right after (no iframe is in the server HTML; nojs.css hides the empty box)                                                                                                                                                                                                                                                 | iframe alone                                                                                  |
| Video chapters / video cards          | written by the `video-guides` transform: chapter links in `<div className="sol-chapters" data-video="<id>">` seek the embedded player in place, cards in `<div className="sol-video-modal">` open a dialog (`video-chapters.js`, `styles/video.css`); both are plain `youtu.be` links without JS                                                                         | links that only work with JS                                                                  |
| Embedded YouTube video                | write `<Frame><iframe src="https://www.youtube-nocookie.com/embed/<id>" title="…" /></Frame>` and run `convert`: the `video-poster` transform turns it into a server-rendered `a.sol-yt` poster (thumbnail and play button) that `video-chapters.js` swaps for the autoplaying player in place; without JS it links to YouTube. Playlists need a `PLAYLIST_THUMBS` entry | a separate "Watch on YouTube" link (the poster is the link)                                   |
| Snippets that must render server-side | default-imported MDX snippet with string props, or page-local `export const`                                                                                                                                                                                                                                                                                             | `/snippets/*.jsx` components or JSX expression children `{"…"}` inside snippets (client-only) |
| Code in several languages             | `<CodeGroup>` (titles = tab labels; without JS panels are numbered `1 · …` to match the tab row)                                                                                                                                                                                                                                                                         |                                                                                               |

`expandable` code blocks: apps/web server-renders every line but collapses a
block longer than eight lines to 190px behind an expand button that needs JS
(`CodeBody` in `components/docs/docs-components.tsx`). `nojs.css` un-collapses
them without JS and hides the inert button. `theme-check` fails if any code
block is clipped or the expand button shows with JS off.

Known limit: stacked CodeGroup panels without JS are labelled `n · <language>`,
so match them to the numbered tab row (`2 · Kit`).

## Accepted losses and release gates

Accepted losses:

- **No-JS CodeGroup labels** are numbered languages, not tab titles (above).
- **Iframes** (Commerce Kit playground, YouTube, 2048) never server-render;
  every one has a plain link next to it.
- **Code Hike hover links**, as listed under "Component and content notes".

Release gate: check this before the docs leave the fork.

1. **Repository links.** Path pages tell readers to clone the `docs-redesign`
   branch of `catmcgee/solana-com` (checkout and paywall
   `Run it on your machine`, issue-asset `demo.ts`), because the examples exist
   only there. After the merge into `solana-foundation/solana-com`, switch them
   back: `grep -rn "catmcgee/solana-com" apps/docs/developers/docs`.

## Component and content notes from the work packages

- **Dollar signs (WP12 `dollar-escape.ts`).** Write prose amounts as `\$20`.
  Renderers with single-dollar math parse `$…$` as KaTeX, so "\$5 or \$50"
  written without the backslashes would render as math italic "5or" with the
  dollars gone. Convert escapes them in converted pages and `verify` fails on
  any that remain (hand-written pages and snippets included).
- **CodeTabs (WP12 `codetabs.ts`).** Non-example `<CodeTabs>` became
  `<CodeGroup>` (one fence: a plain titled fence; prose between tabs: `<Tabs>`
  with one `<Tab>` per fence). `storage`/`flags`/`runner` are dropped; there is
  no Run button without recorded output.
- **Fences (WP2).** `!mark[/re/]` (a token mark in Code Hike) became a
  whole-line highlight; `!collapse(…) collapsed` became block-level
  `expandable`.
- **Frontmatter (WP2).** `seoTitle` -> `"og:title"` + `"twitter:title"`;
  apps/web builds `<title>` from `og:title` when set, else
  `<title> - Solana Developer Docs` (`src/lib/docs/metadata.ts`).
  `docs/tools/microscope` keeps an external `url` (sidebar link); no other page
  may have `url`.
- **RPC (WP4).** API method pages must not use `mode: wide` (RequestExample
  needs the default layout). Nested fields: the first level is `defaultOpen`.
  Surfpool snippets are generated (`gen:surfpool`) from `data/surfpool/*.json`;
  `data/surfpool/upstream.json` is the 3-way merge base for `--sync --ref main`.
- **RPC "Try it".** `apps/docs/rpc-try-it.js` (styles `styles/rpc-try-it.css`)
  puts a "Try it" bar under the header of every `docs/rpc/http/*` and
  `docs/rpc/websocket/*Subscribe` page (every locale). It opens a dialog that
  sends the page's example to devnet, testnet or mainnet-beta straight from the
  browser (POST, or a WebSocket for subscriptions). There is no marker: the
  request is read from the first `<RequestExample>` fence (`bash cURL` with
  `-d '<json>'`, or `json WebSocket`), whose `"method"` must match the page
  slug. `verify` ("RPC Try it", `src/verify/rpc-try-it.ts`) fails on an English
  page that breaks this. Mainnet-beta answers browsers only from allowlisted
  origins (solana.com): on localhost or a Vercel preview it returns 403, which
  the dialog explains.
- **Runnable examples (WP5).** Write code with `#region` markers in
  `packages/docs-examples`, add the block to that folder's `blocks.json`, record
  with
  `RECORD_OUTPUT=1 pnpm --filter @workspace/docs-examples exec vitest run <dir>`,
  run `pnpm --filter @workspace/docs-tooling examples:build`, then
  `import X from "/snippets/examples/<id>.mdx"` and `<X />`. The old
  `file=...#region=` fence syntax is gone.
- **Open tutorial in Playground.** Each tutorial has exactly one Playground
  entry point: a block at the top of its intro page. Code blocks (cookbook,
  reference, tutorial steps), demo terminals, the stepper, and step pages have
  no Playground control; do not add one. `gen:paths` writes the block as
  `snippets/paths/<lang>/<key>/playground.mdx`. Import it on the intro page
  only, right after the first paragraph:
  `import Playground from "/snippets/paths/en/<key>/playground.mdx";` and
  `<Playground />`. It opens the tutorial's example folder: the folder the demo
  outputs live in, else the single `packages/docs-examples/paths/*/<key>`
  folder. Keep a new tutorial's examples in such a folder, named after its key
  in `paths.en.json` (gen:paths warns when it finds no folder). The wording is
  shared by every tutorial, in `_ui` (`playground`, `playgroundOff`,
  `playgroundNote`); there are no per-tutorial overrides. A single-page tutorial
  writes the same markup by hand at the top of the page (see
  `programs/build-first-program.mdx`). The button is generated disabled (no
  href, greyed, tooltip). `playground.js` (styles `styles/playground.css`) turns
  it into `<origin>/github.com/<source>/<data-pg-open>` when its `data-pg-kind`
  (`src/examples/playground.ts`) is in `CONFIG.enabledKinds`. `source` is the
  one owner/repo/ref value in `playground.js` (`CONFIG.source`, currently
  `catmcgee/solana-com/tree/docs-redesign`, which becomes
  `solana-foundation/solana-com/tree/main` after the merge). Never prefix
  `https://`, because the playground router then rejects the URL. The
  playground's GitHub import only accepts Anchor/Native programs ("Could not
  identify framework" on TS/JS/Rust-client/Python, checked 2026-10-16), so
  `CONFIG.enabledKinds` is `anchor`, `native`: the job tutorials (TypeScript)
  stay greyed with their tooltip, and "Build your first program" (Anchor) is
  live. Add a kind there when the playground can import it. Linked folders must
  exist at that ref on GitHub. Each import costs one unauthenticated GitHub API
  call per folder (60/hour per reader IP).
- **Terminal panels (job paths).** A recorded output with a `<stem>.run.json`
  next to its `<stem>.output.txt` renders as a terminal panel
  (`src/lib/terminal.ts`, styles `apps/docs/styles/demo.css`, behaviour
  `apps/docs/run-examples.js`) instead of the plain Run block. `run.json`:
  `{ "title"?, "pending"?: "tx"|"http"|"call", "commands": [{ "at": <output line>, "cmd": "await payStore(customer, order)", "prompt"?: "$" }], "badges": [{ "tone": "ok"|"error"|"warn"|"info", "label": "Confirmed" }] }`.
  Commands show the call the page teaches (`payStore(...)`, `fetch(...)` with
  `X-PAYMENT`, a real shell command), never the recording harness's `demo*`
  helpers, which no page shows; badges summarize what the output shows (decoded
  errors such as `Failed: Account is frozen (Custom: 17)`, HTTP status). Never
  edit the output text itself. The whole output is in the server HTML (wrapping,
  full base58 values); with JS the screen starts at the prompt and Run streams
  the lines back in, values shorten to `F6ks…JeUg` (full value in `title`, click
  to copy). Panels show the environment as "Local test network (Surfpool)"; do
  not label them as a replay or a recorded run, and never claim the code runs in
  the reader's browser or on a live network.
- **Collections (WP7).** Bootcamp lessons carry `{/* bootcamp:video */}`; delete
  that block to re-inject after a curriculum video change. Learn order is
  `LEARN_ORDER` in `transforms/learn.ts`. `docs/tools/ai` ("Build onchain AI
  agents", Resources > Build apps, and the "Onchain AI agents" card on
  `docs/tools/index`) is a live page: its content (SendAI Agent Kit, Eliza,
  GOAT, LangChain, onchain agent programs) is about agents that transact, not
  coding assistants (`intro/coding-with-agents`, "Build with AI agents"); the
  two pages link to each other. The Video tutorials tab lists
  the `video-guides` pages; old `/developers/bootcamp/**` URLs redirect there. oxfmt
  runs on staged EN content at commit, so generator output must be oxfmt-stable
  (it de-indents JSX children after a blank line and re-wraps attributes longer
  than 80 characters).
- **Cross-tab cards (2026-10-16, `cross-tab-cards.ts`).** A `<Card>` on a
  Payments, Assets or Markets page whose href is filed under another tab in
  `navigation/en.json` gets the `arrow` prop (a small ↗, server-rendered, light
  and dark). After moving pages between tabs run `convert`; `convert --check`
  fails while a card is missing its arrow.
- **Program examples in Playground.** `packages/docs-examples/programs/<name>/`
  holds Anchor workspaces whose files a page shows through `blocks.json` (e.g.
  `programs/build-first-program`, the "Build your first program" page). The
  page's hand-written `.sol-pg-tut` button opens the program crate and is live
  once the files are on the `playground.js` source ref.
- **Navigation (WP6).** Edit `navigation/en.json` by hand, then `nav:build`. A
  tab can list `pages` directly instead of `groups` (Start here does): its pages
  render as plain sidebar entries with no group header, and a nested group (the
  Quickstart box) renders as a collapsible entry. Locale label keys are slugs of
  the English label path (`labels.ts`), not stable ids: renaming or moving an
  English group silently drops its translations back to English (listed in
  `generated/untranslated.json`).

## Path and concept components (WP8b)

Generators:
`pnpm --filter @workspace/docs-tooling gen:concepts|gen:paths|gen:addresses [--sync] [--check]`
(`src/generators/*.ts`). Output under
`apps/docs/snippets/{concepts,paths}/<lang>/` is generated: never edit it, and
never put hand-written files there (the generator refuses to delete them, and
`--check` fails). `--check` fails on stale, missing or orphaned output and on
pages that `--sync` would change (`--check` runs the page sync in memory, with
or without `--sync`, and never writes).

Sources: `apps/docs/concepts/concepts.<lang>.json`,
`apps/docs/paths/paths.<lang>.json`, `apps/docs/addresses.json` (plus optional
`addresses.<lang>.json` with `_ui.cta` and per-address `label` overrides). A
locale JSON only overrides text: keys, order, hrefs, `first`, demo components
and recorded-output paths always come from English. If the locale page exists,
links point at `/<loc>/…`. Otherwise they point at the English page. This holds
even when a locale has no concepts JSON yet: the chip text is English, but the
link goes to the translated page.

**Rule for anything that must read without JavaScript.** Never use `{…}`
expression children in an MDX snippet, or raw `<nav>`, `<details>`, `<noscript>`
and `<abbr>`: use the patterns below and under "Reading without JavaScript",
which have no-JS styles.

| Want                                     | Write                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concept card                             | `import Accounts from "/snippets/concepts/en/account.mdx"` then `<Accounts />`                                                                                                                                                                                                                             |
| "In short" on a concept's canonical page | `## In short`, then `<Short />` from `…/<key>.short.mdx`, then `<UsedIn />` from `…/<key>.used-in.mdx`                                                                                                                                                                                                     |
| Inline concept chip                      | `<span className="sol-chip" data-concept="account">accounts</span>`, then run `gen:concepts --sync`. Sync expands it into a Tooltip plus a `nojs-only` "(Accounts: …)" fallback that contains a real link. The spec form `<Tooltip data-concept="account">accounts</Tooltip>` is accepted and converted.   |
| Coverage table (How Solana works root)   | `import Coverage from "/snippets/concepts/en/coverage.mdx"`                                                                                                                                                                                                                                                |
| Path stepper                             | `/snippets/paths/en/<path>/stepper-<n>.mdx`: n = 0 on the path intro page, n = step number on step pages                                                                                                                                                                                                   |
| Next-step card                           | `/snippets/paths/en/<path>/next-<n>.mdx`: n = 0 on the intro page, n = step number on step pages. The last step has one only if `after` is set.                                                                                                                                                            |
| Path card (job picker, hubs)             | `/snippets/paths/en/<path>/card.mdx`                                                                                                                                                                                                                                                                       |
| Demo (step 1 pages)                      | `/snippets/paths/en/<path>/demo.mdx`: one server-rendered terminal panel (stage, numbered steps, every step's output with the prompts and badges from its `run.json`). Without JS it reads in full; with JS it runs step by step (Next step / Run all). A demo with a missing output gets no Run controls. |
| Address mention                          | ``<span className="sol-address" data-address="EPjF…Dt1v">`EPjF…Dt1v`</span>``, then run `gen:addresses --sync`. The address must be in `addresses.json`. Never inside code or recorded output. `--report` lists unmarked prose mentions.                                                                   |

Avoid chips and address mentions inside GFM tables: syncing re-pads the whole
table (codec behaviour), so the diff is not local. The generators warn when they
find one.

Backlinks ("You've used this in") and the coverage table are computed from the
English path pages (intro and steps in `paths.en.json`). A page _introduces_ a
concept when it imports `/snippets/concepts/<lang>/<key>.mdx`. It _mentions_ the
concept when it has a `data-concept="<key>"` chip. Re-run `gen:concepts` after
editing a path page.

### Fit check (pattern, no component)

```mdx
<Columns cols={2}>
  <Card title="A good fit if" icon="check" color="#16a34a">
    - …
  </Card>
  <Card title="Not the right fit if" icon="x" color="#dc2626">
    - …
  </Card>
</Columns>
```

Styles: `apps/docs/styles/concepts.css` and `apps/docs/styles/stepper.css`
(light and dark through `html.dark`; tokens `--solui-*`). No-JS fallbacks rely
on the `.nojs-only` rules from `migration/setup-nojs-fallback.css`, which WP11
must ship as a root CSS file.

## Legacy sources

The Fumadocs app was deleted in WP1. Anything not moved into `data/` or
`legacy/` is available from the pre-migration commit:

```bash
git show 023c6d918:apps/docs/src/app/llms.txt/route.ts        # llms.txt header (WP9)
git show 023c6d918:apps/docs/src/lib/posthog/server.ts        # markdown analytics (WP9)
git show 023c6d918:apps/docs/src/lib/remark-example-output.mjs   # WP5
git show 023c6d918:apps/docs/src/lib/remark-web3js-specifier.mjs # WP2
git show 023c6d918:apps/docs/src/lib/developer-media.ts       # WP10
git show 023c6d918:apps/docs/src/app/[locale]/developers/structured-data.ts  # WP10
git show 023c6d918:apps/docs/src/components/learn/            # WP10 /learn landing
git show 023c6d918:apps/docs/src/app/mdx-components.tsx       # component semantics for convert
git show 023c6d918:apps/docs/next.config.ts                   # redirects (also migration/docs-app-redirects.json)
git ls-tree -r 023c6d918 -- apps/docs/assets                  # hub/learn hero images (WP10)
git show 023c6d918:apps/docs/public/src/img/video-badge/<event|interview|learn|originals|podcast>-icon.svg  # video badges, no copy elsewhere (WP10)
git show 023c6d918:apps/docs/src/markdown/learn/<blockchain-basics|dao|nfts|payments>.md  # unserved drafts, deleted
```

---

# Legacy notes (Fumadocs app, before the migration)

Kept for context while the migration is in progress. Paths below refer to the
deleted Next.js app.

## From apps/docs/CLAUDE.md

> See root `/CLAUDE.md` for monorepo-wide configuration and shared tooling.

#### Overview

The Solana developer documentation site, providing comprehensive guides, API
references, cookbook recipes, and learning resources for building on Solana.

**Package name**: `solana-docs` **Default port**: 3003 **Asset prefix**:
`/docs-assets`

#### Tech Stack

- **Framework**: Next.js 15 (App Router) with next-intl
- **Documentation**: Fumadocs (MDX-based documentation framework)
- **Code Highlighting**: CodeHike for advanced code blocks
- **Diagrams**: Mermaid for flowcharts and diagrams
- **Styling**: Tailwind CSS, SCSS
- **AI Integration**: Vercel AI SDK with OpenAI
- **UI Components**: Radix UI primitives, Fumadocs UI

#### Project Structure

```
apps/docs/
├── src/
│   ├── app/
│   │   └── [locale]/
│   │       ├── developers/
│   │       │   ├── cookbook/     # Code recipes
│   │       │   └── bootcamp/     # Developer learning tracks
│   │       ├── learn/             # General learning content
│   │       └── docs/
│   │           ├── (main)/       # Core documentation
│   │           ├── rpc/          # RPC API reference
│   │           └── video-guides/ # Video tutorials
│   ├── components/               # React components
│   ├── constants/                # App constants
│   ├── hooks/                    # Custom React hooks
│   ├── i18n/                     # i18n configuration
│   ├── lib/                      # Utility libraries
│   ├── markdown/                 # MDX processing utilities
│   ├── scss/                     # SCSS stylesheets
│   ├── types/                    # TypeScript types
│   └── utils/                    # Helper utilities
├── content/
│   ├── cookbook/                 # Cookbook MDX files
│   │   ├── accounts/
│   │   ├── development/
│   │   ├── tokens/
│   │   ├── transactions/
│   │   └── wallets/
│   ├── docs/                     # Main docs (localized)
│   │   ├── en/                   # English docs
│   │   ├── ar/, de/, es/...      # Translated docs
│   ├── learn/                    # General learning content
│   └── developers-learn/         # Bootcamp companion content
├── assets/                       # Static assets
└── public/                       # Public files
```

#### Local Development

```bash
# From monorepo root
pnpm dev --filter solana-docs

# Or from this directory
pnpm dev

# Regenerate MDX sources (after content changes)
pnpm postinstall  # Runs fumadocs-mdx

# Lint
pnpm lint
pnpm lint:fix

# Analyze bundle
ANALYZE=true pnpm build
```

#### Content Structure

##### Fumadocs MDX

Content is organized using Fumadocs conventions:

- Files in `content/` are processed by `fumadocs-mdx`
- Generated source maps stored in `.source/` (gitignored)
- Supports frontmatter for metadata

##### Content Categories

1. **Docs** (`/docs/*`) - Core Solana documentation
   - Core concepts (accounts, transactions, programs)
   - Client libraries (JavaScript, Rust, Python)
   - RPC API reference
   - Staking documentation
   - Video tutorials (`/docs/video-guides/*`, from
     `content/docs/{locale}/video-guides/`)

2. **Cookbook** (`/developers/cookbook/*`) - Code recipes
   - Accounts management
   - Token operations
   - Transaction handling
   - Wallet integration

3. **Learn** (`/learn/*`) - General Solana learning resources

4. **Video tutorials** (`/developers/docs/video-guides/*`) - Video courses,
   including the 2026 Developer Bootcamp

##### Localization

Documentation is translated into multiple languages:

- Content stored in `content/docs/{locale}/`
- Uses next-intl for routing
- English (en) is the source language

#### Key Features

##### CodeHike Integration

Advanced code blocks with:

- Syntax highlighting
- Line highlighting
- Code annotations
- File tabs

##### Mermaid Diagrams

Flowcharts and sequence diagrams rendered from markdown. In the current docs
each fence is pre-rendered to a themed SVG pair (diagram system, both modes,
readable without JS): after adding or editing a fence run
`pnpm --filter @workspace/docs-tooling convert`, then
`npx tsx scripts/render-mermaid.ts` and `python3 scripts/embed-diagram-fonts.py`
(needs `pip install fonttools brotli`). `render-mermaid.ts --check` fails on
missing or orphaned figures.

Mermaid follows the diagram system below: orthogonal edges with 8px rounded
corners, open-chevron heads, node labels as a 13px/500 title line plus muted
12px description lines (write `Title<br/>description`; add your own `<br/>`
breaks to keep lines short and avoid one-word orphans), and figures sit
frameless in the column. There is **no default accent**: mark the one focal node
with `class X focal` (flowcharts; the renderer adds the `focal` classDef). Alt
text comes from the fence's `title=`, the caption that follows it, or
`accTitle:` / `accDescr:` lines in the fence (write them), and falls back to
"<heading> diagram".

##### Diagrams (SVG)

Diagrams are SVG light/dark pairs (`name-light.svg` + `name.svg`) shown with
`<img className="block dark:hidden">` / `<img className="hidden dark:block">`.
They follow one illustration system: zinc neutrals with ONE accent (the theme
link purple, `#7a2fe0` light / `#b78aff` dark) on the focal element only; no
pastel fills, gradients, shadows or glows; 1px box strokes and 1.25px
connectors; 8px corners; one open-chevron arrowhead; left-aligned Diatype
13px/500 titles and 12px labels; transparent canvas; solid connector = acts on /
owns, dashed = refers to / derives. One type rule (`draw-concepts.mjs` and
`render-mermaid.ts` both apply it): titles and field labels are names and are
always Diatype, even when the name is an identifier (`MessageHeader`,
`num_required_signatures`); values, header tags and description lines follow
`isCode`: code (`u64`, `Pubkey`, `true`, `5,000`, `"seed"`, `9fXw…k2Qe`,
`findProgramAddress`, `(pda, bump)`) in Favorit Mono 12px, words (System
Program, fee payer, one or more) in Diatype 12px. Mermaid node and message text
sets identifiers (`CreateDvp`, `mint_a`, `PAYMENT-SIGNATURE`) in mono within the
line. No glyph arrows (→) inside figures: draw the connector or use before/after
columns. Write numbers that start a phrase as words ("one instruction"). Edge
labels have one placement: beside the line, 8px off it (above a horizontal
segment, after a vertical one), never knocked out on it. Don't repeat the Frame
caption inside the figure. On phones (<640px) the core figures switch to a
portrait drawing (`<name>-sm-light.svg` / `<name>-sm.svg`, same Frame, listed
after the desktop pair; `draw-concepts.mjs` draws it, `styles/diagrams.css`
picks it). The older static figures (frontend, finance/privacy, Kora, Actions)
have portrait drawings there too; a diagram image without one keeps a 560px
minimum width and scrolls sideways with a fading edge. Every mermaid flowchart
and sequence diagram gets a 336px phone drawing the same way (`<hash>-sm*.svg`,
linked by the mermaid transform, drawn by `scripts/mermaid-phone.ts` from
`render-mermaid.ts`): sequences as numbered steps with sender and receiver
badges, flowcharts as an indented top-to-bottom tree, where an edge the tree
cannot draw is a dashed chip naming its target. In sequence diagrams,
`%% focal: <message>` marks the one message drawn in the accent; flowcharts use
`class X focal`. The core-concept and token figures are hand-laid-out in
`scripts/draw-concepts.mjs` (root `data-sol-drawn="hand"`, skipped by the passes
below). Pipeline, in order: `draw-concepts.mjs` / `draw-diagrams.mjs`,
`sync-diagram-themes.mjs` (generated core/hub diagrams and their dark pairs),
`brand-diagrams.mjs` (folds every other colour into the system; `--check`), then
`embed-diagram-fonts.py` (`--check`). Labels must be SVG `<text>` in Diatype so
they render in Diatype inside `<img>`. The script passes never spread the
accent: `brand-diagrams.mjs` keeps it on one shape per file (`FOCAL`, default
the first) and turns filled triangle heads into open chevrons. Mermaid uses the
same system (`render-mermaid.ts`; see above). Linear flows on hub and path pages
are HTML, not images: `<ol className="sol-flow not-prose">` with
`<li><b>Step</b><span>caption</span></li>` draws a numbered step rail
(horizontal from 640px, vertical below). The last step's badge carries the
accent; put `data-accent` on one `<li>` to move it.

##### AI Chat (Vercel AI SDK)

- OpenAI integration for documentation search
- Configured via `@ai-sdk/openai`

#### Key Dependencies (App-Specific)

- `fumadocs-core`, `fumadocs-mdx`, `fumadocs-ui` - Documentation framework
- `codehike` - Advanced code blocks
- `mermaid` - Diagram rendering
- `ai`, `@ai-sdk/openai` - AI integration
- `@boxicons/react` - UI and file type icons
- `svg-pan-zoom` - Zoomable diagrams
- `zod` - Schema validation

#### API Routes

The `src/app/api/markdown/[...slug]` route serves Markdown representations of
documentation pages.

#### Build Configuration

- Asset prefix: `/docs-assets` for Vercel multi-project deployment
- Memory allocation: 4096MB for builds
- Sentry integration for error tracking
- Fumadocs MDX processing runs on postinstall
- Moved docs routes need redirects for both the page and its `.md` variant in
  `next.config.ts` because the web app forwards raw Markdown requests.

#### Content Conventions

##### MDX Frontmatter

```yaml
---
title: Page Title
description: Page description
sidebarLabel: Sidebar Label (optional)
sidebarSortOrder: 1 (optional)
---
```

##### Code Blocks

Use CodeHike syntax for enhanced code blocks:

````mdx
```ts title="example.ts" {1,3-5}
// highlighted lines
```
````

```

#### Cross-References
Link to other docs using relative paths or Fumadocs link syntax.
```

## From apps/docs/AGENTS.md

Use this app for developer docs, cookbook, learning content, bootcamp content,
and docs-specific UI.

#### Identity

- Workspace: `apps/docs`
- Package: `solana-docs`
- Served by apps/web (dev port `3000`, `pnpm dev:docs`)
- Public route ownership: `/developers/docs`, `/learn`, `/developers/cookbook`

#### First Files To Open

1. `package.json`
2. `next.config.ts`
3. `source.config.ts`
4. `src/app/[locale]/`
5. `content/`

#### Key Facts

- Next.js App Router app with `next-intl`
- Fumadocs powers most content loading and navigation
- MDX sources live in `content/`
- Generated Fumadocs artifacts live in `.source/` after `postinstall`
- Uses asset prefix `/docs-assets`
- Shared header/footer and cross-app link behavior come from
  `@solana-com/ui-chrome`

#### Content Ownership

- `content/docs/*`: core docs by locale
- `content/docs/*/video-guides/*`: video tutorials served from
  `/docs/video-guides`
- `content/cookbook/*`: recipe-style content
- `content/learn/*`: general learning content
- `content/developers-learn/*`: developer bootcamp and companion content
- `packages/docs-examples/*`: runnable code embedded in cookbook pages
- `src/components/*`: docs-only React UI

#### Commands

```bash
pnpm --filter solana-docs dev
pnpm --filter solana-docs build
pnpm --filter solana-docs lint
pnpm --filter solana-docs check-types
pnpm --filter solana-docs postinstall
```

Run `postinstall` if content or MDX wiring changed and generated sources look
stale.

#### Gotchas

- This app is deployed behind `/docs-assets`, so asset-path bugs often involve
  both `next.config.ts` and the consuming component
- If a change touches shared navigation or locale switching, inspect
  `packages/ui-chrome` and `packages/i18n` too
- Content-heavy changes may require checking both MDX sources and the Fumadocs
  source config
- Moved docs routes need matching redirects for both the page and its `.md`
  variant in `next.config.ts`
