# Authoring and tooling guide: Solana developer docs (Mintlify)

This file replaces `apps/docs/CLAUDE.md` and `apps/docs/AGENTS.md`. They moved
here because Mintlify publishes every `.md`/`.mdx` file under `apps/docs` as a
page, so agent/contributor notes cannot live in the Mintlify root.

Status: the Fumadocs to Mintlify migration is in progress on the
`mintlify-migration` branch. WP0 (this package's skeleton) and WP1 (move and
scaffold) are done; content is **not converted yet**, so most pages still
contain Fumadocs/Code Hike syntax.

## Where things live

| Path                                                  | What                                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs/`                                          | Mintlify project root (dashboard: "docs.json is in a subdirectory" = `/apps/docs`). No `package.json`.                                                                                                                |
| `apps/docs/docs.json`                                 | Mintlify config (placeholder navigation until WP6/WP11).                                                                                                                                                              |
| `apps/docs/docs/**`                                   | English docs, served at `/docs/**` (`index.mdx` = folder URL).                                                                                                                                                        |
| `apps/docs/developers/cookbook/**`                    | Cookbook (English only), `/developers/cookbook/**`.                                                                                                                                                                   |
| `apps/docs/developers/bootcamp/**`                    | English bootcamp, `/developers/bootcamp/**`.                                                                                                                                                                          |
| `apps/docs/learn/*.mdx`                               | English learn articles, `/learn/<slug>`. The `/learn` landing is a React page moving to apps/web (WP10).                                                                                                              |
| `apps/docs/<loc>/{docs,developers/bootcamp,learn}/**` | Translations for ar de es fi fr id it ja ko nl pl pt ru tr uk vi zh. Greek (`el`) was removed.                                                                                                                        |
| `apps/docs/docs-assets/**`                            | Images/video served at `/docs-assets/<original public path>`.                                                                                                                                                         |
| `apps/docs/**/meta.json`                              | Legacy Fumadocs nav, kept until WP6 compiles `navigation/en.json`, then deleted. Ignored via `.mintignore`.                                                                                                           |
| `packages/docs-tooling/`                              | All build/migration tooling (this package).                                                                                                                                                                           |
| `packages/docs-tooling/data/`                         | Data moved out of the Next app: Surfpool JSON schemas, bootcamp curriculum, learn order, legacy `resources.json`.                                                                                                     |
| `packages/docs-tooling/legacy/`                       | Legacy TypeScript kept for reference by later work packages (not compiled).                                                                                                                                           |
| `migration/` (repo root)                              | Review artifacts: `legacy-urls.{txt,tsv}`, `move-map.csv`, `assets-diff.txt`, `asset-refs.csv`, `docs-app-redirects.json`, `pending-web-work.json` (WP9/WP10 handoff), `verify-urls.tsv`, `missing-translations.txt`. |

Rules for `apps/docs`:

- Never add `.js`, `.jsx` or `.css` files except the owned globals
  (`run-examples.js`, `styles/*.css`): Mintlify injects every one of them on
  every page. `verify-urls` fails on strays.
- Never add `.md` notes (README, CLAUDE.md, AGENTS.md): they become pages.
  `.mintignore` is defence in depth only.
- Folder paths are public URLs. Moving a file changes its URL and needs an
  `apps/web/rewrites-redirects.ts` redirect (page and `.md` twin).
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

CLI commands (`src/cli.ts`):

| Command                                      | Purpose                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-urls [--ref <sha>]`                  | Every URL the Fumadocs app served (read from git at `023c6d918`), plus locale-only files it never served (kind `locale-only`) -> `migration/legacy-urls.{txt,tsv}`                                                                                                                                                                              |
| `move [--dry-run]`                           | R1-R9 `git mv`/`git rm`, Greek removal, data + asset moves; writes `migration/move-map.csv`. Idempotent.                                                                                                                                                                                                                                        |
| `remove-next-app [--dry-run] [--force]`      | `git rm` the Next app; refuses while code outside apps/docs imports it                                                                                                                                                                                                                                                                          |
| `verify-redirects`                           | apps/web redirect coverage for R8 files (uses Next's own matcher)                                                                                                                                                                                                                                                                               |
| `verify-urls`                                | Legacy URL parity: each URL -> one file, a live apps/web redirect, a recorded redirect not yet in apps/web (`redirect-pending`, reported; see `migration/pending-web-work.json`), a cookbook rewrite, an English fallback (missing translation, reported) or a pending route (`/learn`, `/developers`). Redirects win over files, as in Next.js |
| `convert [--files p] [--locale l] [--check]` | Transform registry runner. Empty until WP2, so `--check` is a no-op                                                                                                                                                                                                                                                                             |
| `nav`, `examples`                            | Stubs for WP6 / WP5                                                                                                                                                                                                                                                                                                                             |

## Writing a convert transform (WP2+)

1. Add `src/convert/transforms/<name>.ts` exporting a `Transform`
   (`src/types.ts`): `{ name, order, owner, appliesTo?, run(tree, file, ctx) }`.
2. Register it in `defaultTransforms()` (`src/convert/registry.ts`).
3. Add fixtures `__fixtures__/convert/<name>/<case>/{in.mdx,out.mdx,meta.json?}`
   with at least one English and one locale case.
   `test/convert-fixtures.test.ts` checks the golden output and idempotency for
   every registered transform.
4. Transforms are pure and idempotent; none of their input constructs may appear
   in their output.

The runner currently uses a `raw` codec (whole file as one node). WP2 adds the
unified + remark-mdx codec in `src/convert/run.ts`.

## Assets

Content still references `/assets/...`, `/images/...` and `/img/...`. Those
files now live at `apps/docs/docs-assets/<same path>` and Mintlify serves them
at `/docs-assets/<same path>`. The URL rewrite is **planned in convert** (WP2
`images.ts`, `themed-image.ts`, `html.ts`): `/assets/X` ->
`/docs-assets/assets/X` etc. `migration/asset-refs.csv` lists every reference,
its file and its rewritten URL. All 130 referenced files came from
`apps/docs/public`; none had to be copied from `apps/web/public`.
`apps/web/public` keeps its own copies for existing hotlinks.

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

Flowcharts and sequence diagrams rendered from markdown.

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
