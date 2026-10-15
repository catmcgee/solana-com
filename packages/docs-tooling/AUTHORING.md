# Authoring and tooling guide: Solana developer docs (Mintlify)

This file replaces `apps/docs/CLAUDE.md` and `apps/docs/AGENTS.md`. They moved
here because Mintlify publishes every `.md`/`.mdx` file under `apps/docs` as a
page, so agent/contributor notes cannot live in the Mintlify root.

Status: the Fumadocs to Mintlify migration is integrated on the
`mintlify-migration` branch (WP12, review fixes WP13). Every page is converted
(`convert --check` is clean on all 8,870 files, including the pages the WP8a
writers edited), navigation, generators and edge routing are wired, and
`docs-tooling verify` runs every repo-side check. What can only be checked on a
deployed `*.mintlify.site` is listed under "Release gates" below.

## Where things live

| Path                                                  | What                                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs/`                                          | Mintlify project root (dashboard: "docs.json is in a subdirectory" = `/apps/docs`). No `package.json`.                                                                                                                |
| `apps/docs/docs.json`                                 | Mintlify config (WP11 keys; `navigation` = `$ref` to `navigation/<lang>.json`, `redirects` = `$ref` to `redirects.json`).                                                                                             |
| `apps/docs/docs/**`                                   | English docs, served at `/docs/**` (`index.mdx` = folder URL).                                                                                                                                                        |
| `apps/docs/developers/cookbook/**`                    | Cookbook (English only), `/developers/cookbook/**`.                                                                                                                                                                   |
| `apps/docs/developers/bootcamp/**`                    | English bootcamp, `/developers/bootcamp/**`.                                                                                                                                                                          |
| `apps/docs/learn/*.mdx`                               | English learn articles, `/learn/<slug>`. The `/learn` landing is a React page moving to apps/web (WP10).                                                                                                              |
| `apps/docs/<loc>/{docs,developers/bootcamp,learn}/**` | Translations for ar de es fi fr id it ja ko nl pl pt ru tr uk vi zh. Greek (`el`) was removed.                                                                                                                        |
| `apps/docs/docs-assets/**`                            | Images/video served at `/docs-assets/<original public path>`.                                                                                                                                                         |
| `apps/docs/**/meta.json`                              | Removed at integration (WP12): the legacy Fumadocs nav is compiled into `navigation/en.json`; `nav compile-legacy` reads the originals from git (`LEGACY_REF`).                                                       |
| `packages/docs-tooling/`                              | All build/migration tooling (this package).                                                                                                                                                                           |
| `packages/docs-tooling/data/`                         | Data moved out of the Next app: Surfpool JSON schemas, bootcamp curriculum, learn order, legacy `resources.json`.                                                                                                     |
| `packages/docs-tooling/legacy/`                       | Legacy TypeScript kept for reference by later work packages (not compiled).                                                                                                                                           |
| `migration/` (repo root)                              | Review artifacts: `legacy-urls.{txt,tsv}`, `move-map.csv`, `assets-diff.txt`, `asset-refs.csv`, `docs-app-redirects.json`, `pending-web-work.json` (WP9/WP10 handoff), `verify-urls.tsv`, `missing-translations.txt`. |

Rules for `apps/docs`:

- Never add `.js`, `.jsx` or `.css` files except the owned globals
  (`run-examples.js`, `ask-ai.js`, `playground.js`, `styles/*.css`): Mintlify
  injects every one of them on every page. `verify-urls` fails on strays.
- Never add `.md` notes (README, CLAUDE.md, AGENTS.md): they become pages.
  `.mintignore` is defence in depth only.
- Folder paths are public URLs. Moving a file changes its URL and needs an
  `apps/web/rewrites-redirects.ts` redirect (page and `.md` twin).
- Merging a duplicate page into another: move its unique content first, delete
  the EN file and its locale copies, add the old URL to `movedDocsRedirects`
  (the bare, `/:locale/` and `.md` variants are generated; a destination with an
  `#anchor` gets no `.md` twin, so add that to `anchoredMdTwinRedirects`),
  repoint any existing redirect that targeted the removed page (no chains),
  update `navigation/en.json` and inbound links, then run `generate` and
  `verify` (`gen:redirects` mirrors the result into `apps/docs/redirects.json`).
  The 2026-10-15 merges are listed in the comment above those redirects.
- Locale folders keep our codes (`ja`, `zh`, `pt`); Mintlify's
  `navigation.languages` uses `jp`, `cn`, `pt-BR` (see `src/lib/locales.ts`).
- Translations come from Lingo, never from agents.

## Commands

```bash
pnpm dev:docs                                         # mint dev on :3003
pnpm --filter @workspace/docs-tooling mint:validate   # npx mint@latest validate
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
| `gen:manifest`, `gen:llms`, `gen:redirects` `[--check]`                   | `src/manifest/cli.ts`                                                    |
| `generate` / `generate:check`                                             | every generator, in dependency order                                     |
| `collections:remove-tools-ai [--dry-run]`                                 | `src/collections/remove-tools-ai.ts`                                     |
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

| Order   | Transforms                                                                                                                                                    | Why there                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10      | frontmatter                                                                                                                                                   | everything else sees normalized keys                                                                                                                                                                                                                                                                                                                    |
| 80-90   | notes 80, mentions 81, side-by-side 82, scrolly 83, files 84, codetabs-examples 85, mermaid 86, return-type 87, terminal 88, api-method 89, code-reference 90 | they read RAW Code Hike fence syntax (`!tooltip`, `!!request`, `!hover`, `file=`) that fences.ts rewrites                                                                                                                                                                                                                                               |
| 150     | inline-code                                                                                                                                                   | `_lang`code`_`, plus the unclosed `_lang`code`` / `\_lang`code`` that some translations left (known code languages only); residual has a pattern for each                                                                                                                                                                                               |
| 210-300 | callout, cards, tabs, steps, accordion, embed, html, themed-image, images, codetabs 300                                                                       | Mintlify components                                                                                                                                                                                                                                                                                                                                     |
| 610-650 | bootcamp, video-guides, learn, tools-ai, site-links 650                                                                                                       | collections, then link rewriting                                                                                                                                                                                                                                                                                                                        |
| 900     | fences                                                                                                                                                        | deliberately last among rewrites: skips fences still inside an unconverted Code Hike container; writes highlights as `highlight={…}` so a re-run can tell them from legacy brace meta                                                                                                                                                                   |
| 910     | web3js-specifier                                                                                                                                              | `@solana/web3.js-(v3\|legacy)` -> `@solana/web3.js`; `restoreWeb3jsSpecifier()` is used by examples                                                                                                                                                                                                                                                     |
| 920     | anchors                                                                                                                                                       | needs final headings and Step titles                                                                                                                                                                                                                                                                                                                    |
| 930     | dedupe-lede                                                                                                                                                   | drops a first body paragraph that repeats `description` (Mintlify renders `description` as the lede; 51 EN pages, mostly RPC, showed it twice)                                                                                                                                                                                                          |
| 950     | dollar-escape                                                                                                                                                 | Mintlify always runs remark-math (single-dollar inline math): two `$` in one paragraph, heading or table row render as KaTeX. Every unescaped prose `$` in such a block becomes `\$`; code and JSX attributes are untouched. `verify` fails on any remaining block (pages and snippets); a page that really wants math sets `math: true` in frontmatter |

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
   identifiers are quoted (`"og:title": …`), as Mintlify's docs write them.
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

Assets live at `apps/docs/docs-assets/<original public path>` and Mintlify
serves them at `/docs-assets/<same path>`. Convert rewrote every `/assets/...`,
`/images/...` and `/img/...` reference (WP2 `images.ts`, `themed-image.ts`,
`html.ts`); new content must use `/docs-assets/...` (`verify` checks every
reference exists and every `-light` themed variant has its dark twin).
`migration/asset-refs.csv` lists every reference, its file and its rewritten
URL. All 130 referenced files came from `apps/docs/public`; none had to be
copied from `apps/web/public`. `apps/web/public` keeps its own copies for
existing hotlinks.

## Site config, theme and Mintlify plan limits (WP11)

`apps/docs/docs.json` top-level keys (everything except `navigation` and
`redirects`) are the WP11 site config. `apps/docs/styles/theme.css` is the brand
theme. Brand files are in `apps/docs/docs-assets/brand/`:

- `solana-logo-on-light.svg` (black wordmark) and `solana-logo-on-dark.svg`
  (white wordmark). Both are copied from `packages/ui-chrome`
  `logotype.inline.svg`.
- `favicon.svg` and `favicon.ico`.
- `fonts/`: ABC Diatype (300/400/500/700 plus italics), ABC Monument Extended
  (400/700) and ABC Favorit Mono (variable). All are woff2 copies of
  `apps/web/src/fonts`.

Theme rules:

- **Fonts.** `docs.json` `fonts` can load only one weight each for headings and
  body (Diatype 500 and 400). `theme.css` declares the other faces with
  `@font-face`. Code uses ABC Favorit Mono. Monument is opt-in through
  `className="solana-display"` for hub and landing headings. CSS font URLs must
  be absolute (`/docs-assets/...`), because Mintlify inlines CSS into the page.
- **Colors.** Light mode links use `#7A2FE0` (6.3:1 on white). Dark mode links
  use `#B78AFF` (8.1:1 on black). The dark page background is `#000`, like
  solana.com.
- **Top bar.** The docs use Mintlify's own navbar (logo, search, language and
  theme) with no solana.com links; the solana.com header appears only on
  solana.com pages such as /developers. (An injected bundle of the ui-chrome
  header was tried and removed on 2026-10-16; see git history for
  `src/header-bundle`.) Links from solana.com pages into the docs open in a new
  tab (`isDocsHref` in packages/ui-chrome/src/url-config.ts).
- **Tab divider and external tab.** The divider after tab 4 (Markets) and
  pushing any `http` tab to the far end are done in CSS. External tabs need an
  absolute `href`. Mintlify renders a relative tab `href` as `/`.
- **RTL (`ar`).** Mintlify never sets `dir="rtl"`. It sets `<html lang="ar">`
  only after hydration. `theme.css` detects Arabic from `html[lang="ar"]` or,
  without JS, from `/ar/` tab and sidebar links. It flips the text regions
  (content, header, sidebar, TOC, pagination) to RTL and keeps code LTR. The
  page frame (sidebar position) stays LTR.
- **No JS.** Mintlify always ships `class="dark"` without JS, so no-JS readers
  get dark mode. The theme is built for that case too.
- **Verify** with `migration/wp11-theme-check.mjs --base <url>`. It is
  Playwright-based and covers light and dark, JS on and off, desktop and mobile.
  Run it after every Mintlify version bump, because the tab, footer and top-row
  selectors are not a documented API.

Consent and analytics:

- GTM (`GTM-TNX63HZ`) and PostHog (the production `phc_` key, events sent to
  `https://us.i.posthog.com` as today) are loaded by Mintlify only when
  analytics consent is true. Mintlify's client renders the GTM script only when
  consent is true, and the PostHog mediator is created the same way. Analytics
  run on production deployments only, never on `mint dev`.
- Consent comes from **Mintlify's built-in cookie banner**. It is enabled in the
  dashboard (project settings, privacy / cookie consent), not in `docs.json`.
  When the banner is on, it is the only consent source.
- `integrations.cookies` (`cookie_consent` = `"true"`) is the fallback when the
  banner is off. Mintlify compares the localStorage string exactly. solana.com
  now stores `{"value":true,"timeToExpire":…}`, so only the legacy `"true"`
  value matches. With the banner off, analytics therefore stay off for almost
  everyone, which fails closed.
- Consent given in the solana.com banner (apps/web) does not carry over to
  Mintlify's banner, which uses its own c15t storage. The reverse is also true.
  Readers may be asked twice.

Plan limits. The project runs on Mintlify **Hobby (Starter, free)**:

| Feature                                                                                                | Hobby                                            | Needs                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| Custom CSS (`styles/*.css`), custom JS, fonts, logos, colors, navbar, footer, banner                   | yes                                              |                                                     |
| Built-in search (`search.prompt`)                                                                      | yes; local `mint dev` search needs `mint login`  | search filters: Enterprise                          |
| Contextual menu (`copy`, `view`, `chatgpt`, `claude`)                                                  | yes                                              | `assistant` option: Pro; `download-pdf`: Enterprise |
| SEO (`seo.metatags` canonical, `indexing: all`, organization JSON-LD), sitemap, `llms.txt` (generated) | yes                                              |                                                     |
| Markdown for agents (`.md`, `markdown.instructions`), search MCP server                                | yes                                              |                                                     |
| Analytics integrations (GTM, PostHog) + `integrations.cookies`                                         | yes (configured in docs.json)                    |                                                     |
| Built-in cookie consent banner                                                                         | dashboard toggle; confirm it is offered on Hobby |                                                     |
| Page feedback (thumbs, suggest edits, raise issue)                                                     | **no**                                           | Pro                                                 |
| AI Assistant, agent, automations, AI translations                                                      | **no**                                           | Pro                                                 |
| Preview deployments                                                                                    | **no**; check branches with `mint dev`           | Pro                                                 |
| Mintlify platform analytics dashboard                                                                  | **no** (use GTM and PostHog)                     | Pro                                                 |
| Static files `.txt`, `.pdf`, `.xml`, `.csv`, `.zip`                                                    | **no**, they return 404                          | Enterprise                                          |
| Static export or self-hosting, white labeling (removing "Powered by Mintlify")                         | **no**                                           | Enterprise                                          |
| Editor seats                                                                                           | 5                                                | Pro: unlimited                                      |

`feedback` has no `docs.json` key. Enabling it in the dashboard is a no-op on
Hobby. Do not disable `integrations.telemetry`: that also turns off feedback
once the plan has it.

## Integration pipeline (WP12)

Order (each step is idempotent; re-run from the top after any change):

1. `examples:build --check` (and `examples:extract` once): `codetabs-examples`
   errors when a snippet or `blocks.json` entry is missing.
2. `convert` (write), then `convert --check` must report 0 changes.
3. `generate`: `examples:build`, `gen:surfpool`, `gen:paths`,
   `gen:concepts --sync`, `gen:addresses --sync` (concepts reads the path pages,
   so this order), `nav:build`, `gen:tags` (after any tab-root title or
   description change, or a new hub), `gen:manifest`, `gen:llms`,
   `gen:redirects` (manifest, then llms, then redirects).
4. `verify` (below), then in `apps/docs`: `mint validate`,
   `mint broken-links --check-snippets --check-redirects`, and
   `mint broken-links --check-anchors` (reported).
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
- `docs/finance/index`: now the "All use cases" hub. The intro sentence ("Build
  financial products on Solana. Start with assets, then move through payments
  and onchain markets…") and the "Issuing and operating assets" H2 with its
  paragraph were replaced by card text: the "Issuance & tokenization" card
  carries the same summary (token creation, access controls, DvP, fund
  operations). All four original card targets and the Core Concepts link remain.

Locale copies of these hubs keep the old structure until the next Lingo run.

`scripts/crawl-mint.py --base http://localhost:3333` fetches every page in
`generated/pages.json` from a running `mint dev` (or preview) and checks HTTP
200 plus the page title in the HTML.

### Links and anchors

- `site-links` (650): root-relative links to pages apps/web serves (`/skills`,
  `/discord`, `/developers/templates`, …) become `https://solana.com/…`;
  Mintlify serves only `/docs/**`, `/learn/<article>`,
  `/developers/cookbook/**`, `/developers/bootcamp/**`, `/docs-assets/**`
  (optionally locale-prefixed). Bare relative links are resolved the way the
  legacy browser did. GFM autolinks that swallowed CJK/Arabic punctuation are
  cut.
- `anchors` (920): Mintlify heading ids come from @sindresorhus/slugify
  (`actions.json` -> `#actions-json`), not github-slugger (`#actionsjson`).
  Fragments that pointed at a legacy id are rewritten to the Mintlify id of the
  same heading; English fragments on translated pages are mapped by heading
  position when the outlines match. Write new anchors in Mintlify form
  (`src/lib/slugs.ts`). Fragments that match nothing are warnings: they were
  already dead on the legacy site.
- Step titles get ids too. Set `id` on a `<Step>` if inbound anchor links matter
  more than the generated slug.

## Reading without JavaScript

Every page must read completely with JavaScript off (decisions.md). Mintlify
server-renders inactive Tabs/CodeGroup panels but hides them;
`apps/docs/styles/nojs.css` un-hides and stacks them when
`html:not([data-theme-preference])` (Mintlify's head script sets that attribute;
without JS it never appears). Patterns:

| Need                                  | Use                                                                                                                                                                                                                                   | Never                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hide-without-JS-only content          | `className="nojs-only"` (`div` or `span`)                                                                                                                                                                                             | raw `<noscript>` (stripped)                                                                   |
| Collapsible                           | `<Accordion>` / `<Expandable>` (native `<details>`)                                                                                                                                                                                   | raw `<details>`, `<abbr>` (stripped)                                                          |
| Tooltip text                          | `<Tooltip tip="T">x</Tooltip><span className="nojs-only"> (T)</span>` (sibling, not child)                                                                                                                                            | text only in `tip`                                                                            |
| Mermaid                               | keep the fence; convert adds `<div className="sol-mermaid" data-fallback="mermaid">` with the pre-rendered light/dark SVG (run `tsx scripts/render-mermaid.ts` then `python3 scripts/embed-diagram-fonts.py`); caption `.sol-caption` | hand-written fallback divs                                                                    |
| iframe / YouTube                      | `<Frame><iframe/></Frame>` plus a plain link right after (no iframe is in the server HTML; nojs.css hides the empty box)                                                                                                              | iframe alone                                                                                  |
| Snippets that must render server-side | default-imported MDX snippet with string props, or page-local `export const`                                                                                                                                                          | `/snippets/*.jsx` components or JSX expression children `{"…"}` inside snippets (client-only) |
| Code in several languages             | `<CodeGroup>` (titles = tab labels; without JS panels are numbered `1 · …` to match the tab row)                                                                                                                                      |                                                                                               |

`expandable` code blocks: Mintlify server-renders every line but collapses the
block to 190px behind a "See all N lines" button that needs JS. `nojs.css`
un-collapses them without JS (in `@layer base`, because the viewport's
`overflow-y-hidden!` is an important utility) and hides the inert button.
`theme-check` fails if any code block is clipped or a "See all" button shows
with JS off.

Known limits (accepted losses, see below): without JS Mintlify always serves
`<html class="dark">`, so no-JS readers get dark mode (themed images still pair
correctly). Stacked CodeGroup panels are labelled `n · <language>` (Mintlify
puts the tab title only on the tab button, and the panel has no
`aria-labelledby`), so match them to the numbered tab row (`2 · Kit`).

## Accepted losses and release gates

Accepted losses (platform limits, nothing in content can fix them; raise with
Mintlify if they matter):

- **No-JS light mode.** Without JS every page renders dark, on `mint dev` and
  per Mintlify's client code also in production. With JS, light and dark both
  work. This is a partial loss against "dark and light everywhere" for no-JS
  readers only.
- **No-JS CodeGroup labels** are numbered languages, not tab titles (above).
- **Iframes** (Commerce Kit playground, YouTube, 2048) never server-render;
  every one has a plain link next to it.
- **`<title>` from `seoTitle`** (392 pages) and the Code Hike hover links, as
  listed under "Component and content notes".

Release gates: check these on the deployed `*.mintlify.site` (and through
solana.com) before cutover. `mint dev` cannot answer them:

1. **Canonical and `og:url`.** Mintlify builds them as
   `seo.metatags.canonical + page.href`; a page's own `canonical` frontmatter
   wins. On `mint dev` `href` carries the dev-only `src/_props/` prefix
   (`https://solana.com/src/_props/docs/core/wallets`). Checked on `mint dev`: a
   page-level `canonical: https://solana.com/ja/docs/core/accounts` renders
   exactly. Locale pages that exist get a canonical; untranslated locale URLs
   404 on Mintlify itself and are served the English page (with the English
   canonical) by the apps/web fallback rewrite. If production also shows a wrong
   path, stamp `canonical` frontmatter on every page with a transform.
2. **`/docs/tools`.** On `mint dev` it 307s to its first sub-page. Mintlify's
   dev page lookup only tries `src/_props/<slug>.mdx`, never `<slug>/index.mdx`,
   and falls back to the first nav page under the prefix. For `/docs/tools` that
   page (commerce-kit, in Payments) comes before the index in nav order, so dev
   redirects. Production resolves pages differently. The apps/web
   `MINTLIFY_INDEX_SHADOWED` rewrite to `/<section>/index` keeps solana.com
   correct either way; remove it only if the deployed site answers 200.
   (`/docs/tokenization` was the second case until its index was merged into
   `/docs/assets#tokenization`; it is now a redirect.)
3. **`.md` twins and `Accept: text/markdown`** are served by Mintlify (all 404
   on `mint dev`).
4. **Proxy headers.** Mintlify accepts the proxied Host/Origin, including the
   analytics POST to `/_mintlify/api/v1/e`.
5. **Consent.** The dashboard cookie banner is on, and GTM/PostHog load only
   after Accept.
6. **The origin serves pages publicly.** `MINTLIFY_ORIGIN`
   (apps/web/apps-urls.ts, default `https://solana-f31f4a8d.mintlify.site`) must
   answer a docs page with `200` and the page HTML. At WP12 review it answered
   every request with a `302` to Mintlify's end-user auth
   (`app.mintlify.com/api/end-user-auth/deployment?next=solana.mintlify.io`), so
   the deployment was either auth-protected or not this project. Confirm the
   subdomain is ours and public, then
   `curl -sI "$MINTLIFY_ORIGIN/docs/core/accounts"` returns 200.
7. **Repository links.** Path pages tell readers to clone `catmcgee/solana-com`
   on `mintlify-migration` (checkout and paywall `Run it on your machine`,
   issue-asset `demo.ts`), because the examples exist only there. After the
   merge into `solana-foundation/solana-com`, switch them back:
   `grep -rn "catmcgee/solana-com" apps/docs/docs`.

## Component and content notes from the work packages

- **Dollar signs (WP12 `dollar-escape.ts`).** Write prose amounts as `\$20`.
  Mintlify parses `$…$` as KaTeX, so "\$5 or \$50" written without the
  backslashes renders as math italic "5or" with the dollars gone. Convert
  escapes them in converted pages and `verify` fails on any that remain
  (hand-written pages and snippets included).
- **CodeTabs (WP12 `codetabs.ts`).** Non-example `<CodeTabs>` became
  `<CodeGroup>` (one fence: a plain titled fence; prose between tabs: `<Tabs>`
  with one `<Tab>` per fence). `storage`/`flags`/`runner` are dropped; there is
  no Run button without recorded output.
- **Fences (WP2).** `!mark[/re/]` (a token mark in Code Hike) became a
  whole-line highlight; `!collapse(…) collapsed` became block-level
  `expandable`.
- **Frontmatter (WP2).** `seoTitle` -> `"og:title"` + `"twitter:title"`;
  Mintlify's `<title>` is built from `title` (the old `seoTitle || h1 || title`
  is a known SEO loss, 392 pages). `docs/tools/microscope` keeps an external
  `url` (sidebar link); no other page may have `url`.
- **RPC (WP4).** API method pages must not use `mode: wide` (RequestExample
  needs the default layout). Nested fields: the first level is `defaultOpen`.
  Surfpool snippets are generated (`gen:surfpool`) from `data/surfpool/*.json`;
  `data/surfpool/upstream.json` is the 3-way merge base for `--sync --ref main`.
- **Runnable examples (WP5).** Write code with `#region` markers in
  `packages/docs-examples`, add the block to that folder's `blocks.json`, record
  with
  `RECORD_OUTPUT=1 pnpm --filter @workspace/docs-examples exec vitest run <dir>`,
  run `pnpm --filter @workspace/docs-tooling examples:build`, then
  `import X from "/snippets/examples/<id>.mdx"` and `<X />`. The old
  `file=...#region=` fence syntax is gone.
- **Open in Playground.** `apps/docs/playground.js` (styles
  `styles/playground.css`) adds the control to every code block's toolbar. Only
  code from a generated example snippet can be enabled: before each fence the
  generator writes a hidden
  `<div className="sol-pg" data-pg-src data-pg-open data-pg-kind>` marker
  (`src/examples/playground.ts`). The link is
  `<origin>/github.com/<source>/<data-pg-open>`. `source` is the one
  owner/repo/ref value in `playground.js`
  (`catmcgee/solana-com/tree/mintlify-migration`, which becomes
  `solana-foundation/solana-com/tree/main` after the merge). Never prefix
  `https://`, because the playground router then rejects the URL. The
  playground's GitHub import only accepts Anchor/Native programs ("Could not
  identify framework" on TS/JS/Rust-client/Python), so `CONFIG.enabledKinds` is
  `anchor`, `native`, and every current example is greyed out. Add a kind there
  when the playground can import it. Linked files must exist at that ref on
  GitHub. Each import costs one unauthenticated GitHub API call per folder
  (60/hour per reader IP).
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
  `LEARN_ORDER` in `transforms/learn.ts`. `docs/tools/ai` stays in the Hidden
  tab ("Pending merge") until its content is merged into
  `intro/coding-with-agents`; only then run `collections:remove-tools-ai`. oxfmt
  runs on staged EN content at commit, so generator output must be oxfmt-stable
  (it de-indents JSX children after a blank line and re-wraps attributes longer
  than 80 characters).
- **Navigation (WP6).** Edit `navigation/en.json` by hand, then `nav:build`.
  Locale label keys are slugs of the English label path (`labels.ts`), not
  stable ids: renaming or moving an English group silently drops its
  translations back to English (listed in `generated/untranslated.json`).

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
expression children in an MDX snippet. Mintlify's server render drops them, and
the text then exists only in the client payload. Raw `<nav>`, `<details>`,
`<noscript>` and `<abbr>` are dropped too. Tooltip `tip`/`headline`/`cta`/`href`
are client-only.

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

4. **Developer bootcamp** (`/developers/bootcamp/*`) - Structured learning
   tracks and companion material

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

Flowcharts and sequence diagrams rendered from markdown. In the Mintlify project
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
picks it); other diagram images keep a 560px minimum width and scroll sideways
with a fading edge. Left-to-right mermaid flowcharts get a top-to-bottom phone
drawing the same way (`<hash>-sm*.svg`, written by the mermaid transform and
`render-mermaid.ts`). In sequence diagrams, `%% focal: <message>` marks the one
message drawn in the accent; flowcharts use `class X focal`. The core-concept
and token figures are hand-laid-out in `scripts/draw-concepts.mjs` (root
`data-sol-drawn="hand"`, skipped by the passes below). Pipeline, in order:
`draw-concepts.mjs` / `draw-diagrams.mjs`, `sync-diagram-themes.mjs` (generated
core/hub diagrams and their dark pairs), `brand-diagrams.mjs` (folds every other
colour into the system; `--check`), then `embed-diagram-fonts.py` (`--check`).
Labels must be SVG `<text>` in Diatype so they render in Diatype inside `<img>`.
The script passes never spread the accent: `brand-diagrams.mjs` keeps it on one
shape per file (`FOCAL`, default the first) and turns filled triangle heads into
open chevrons. Mermaid uses the same system (`render-mermaid.ts`; see above).
Linear flows on hub and path pages are HTML, not images:
`<ol className="sol-flow not-prose">` with
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
documentation pages. Inkeep feedback uses a server action under
`src/app/components/inkeep/`.

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
- Default dev port: `3003`
- Public route ownership: `/docs`, `/learn`, `/developers`,
  `/developers/cookbook`, `/developers/bootcamp`

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
