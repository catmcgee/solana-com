# Contributing to solana.com

We really appreciate your input, and that's why we've made solana.com an
open-source project! We're all about keeping things easy and transparent when it
comes to contributing to the site, whether it's:

- Reporting a bug
- Submitting a fix
- Discussing the current state of this repo
- Proposing new features

## Avoid official recommendations

Avoid any language around making "official recommendations" such as "I recommend
product X" or "Product Y is the best". The content within this repo will be
publicly published on solana.com which is maintained by the
[Solana Foundation](https://solana.org). As such, any "product recommendations"
may appear as if coming directly from the Solana Foundation. The Solana
Foundation does not make official recommendations for products but rather helps
share what options are available in the broader Solana ecosystem.

## Avoid "picking favorites"

Avoid language similar to "service X is my favorite". When talking about or
naming specific products within the Solana ecosystem, writers and maintainers
should make their best attempt to list multiple options that meet similar use
cases. As a general rule of thumb, try to share at least 3-4 options of similar
products or services, not just a single named one. For example, when talking
about wallet providers, a writer could list Phantom, Solflare, Backpack, and
Ultimate. When talking about RPC providers, a writer should link to
[solana.com/rpc](https://solana.com/rpc) instead of listing specific names.

## Use up-to-date code snippets

Write content that uses up-to-date code. Code bases change, functions get
deprecated, and methods get removed. When submitting code snippets within the
content here, use the most up-to-date code available for the given functionality
being used. Especially net new content, like adding a new guide.

## Style guidelines

To aid in keeping both consistent content and a high-quality experience, all
code/content maintained within this repo shall use the style guidelines set
forth here.

Failure to adhere to these style guidelines will slow down the review process
and block approval/merging.

## i18n localization

Translations are handled via the lingo.dev platform. The content within this
repo is in the default/base language of English. The docs have their own Lingo
project in `apps/docs/.lingo/` (no Greek); the UI message bundles stay in the
root `.lingo/config.json`. Pages without a translation yet are listed in
`packages/docs-tooling/generated/untranslated.json`; their locale navigation
entries point at the English page until `nav:swap` runs after a Lingo run.

## Documentation

The developer docs are a [Mintlify](https://mintlify.com/docs) project in this
folder (`apps/docs`, the Mintlify root):

- `docs/**`, `developers/cookbook/**`, `developers/bootcamp/**`, `learn/*.mdx`
  are the English pages; `<locale>/…` holds the translations. Folder paths are
  public URLs, so moving a file needs a redirect in
  `apps/web/rewrites-redirects.ts`.
- `navigation/en.json` is the English navigation. Edit it by hand, then run
  `pnpm --filter @workspace/docs-tooling nav:build` to regenerate the 17 locale
  navigations.
- Use Mintlify components (`<Note>`, `<Steps>`, `<CodeGroup>`, `<Tabs>`,
  `<Card>`, …). Pages must read completely without JavaScript: see "Reading
  without JavaScript" in `packages/docs-tooling/AUTHORING.md` for the allowed
  patterns.
- Preview locally with `pnpm dev:docs` (`mint dev`). Before pushing run
  `pnpm --filter @workspace/docs-tooling verify` and, in this folder,
  `npx mint@latest validate` and `npx mint@latest broken-links`.

All tooling (converters, generators, checks) lives in `packages/docs-tooling`;
`packages/docs-tooling/AUTHORING.md` is the full guide.

### Hosting and the Mintlify plan

The docs are hosted by Mintlify (Hobby plan) and served on solana.com by
`apps/web`, which rewrites `/docs`, `/learn/*`, `/developers/cookbook` and
`/developers/bootcamp` to the `*.mintlify.site` root
(`apps/web/rewrites-redirects.ts`, MINTLIFY block).

**Recommendation: upgrade to Mintlify Enterprise.** Enterprise includes the
static export, which would let us self-host the docs on Vercel next to
`apps/web` instead of proxying to Mintlify. `mint export` worked locally
without logging in, but Mintlify's documentation describes self-hosting as
Enterprise-only, so we do not rely on it. Features that need Pro or
Enterprise (page feedback, the AI assistant, preview deployments, static
export) are listed in `packages/docs-tooling/AUTHORING.md`.

## Cookbook code examples

The Kit, web3.js, Rust, and Python snippets shown on cookbook pages live in
`packages/docs-examples`, not inline in the MDX. Tests in that package run
against a local surfpool on every PR, so an SDK rename or signature change shows
up as a red CI run rather than rotted documentation.

### TypeScript (Kit / web3.js v3 / web3.js legacy)

A TypeScript example comes in up to three flavours, one file each:

| File        | Library                     | Tab title          |
| ----------- | --------------------------- | ------------------ |
| `kit.ts`    | `@solana/kit` (recommended) | `Kit`              |
| `web3v3.ts` | `@solana/web3.js` 3.x       | `Web3.js v3`       |
| `legacy.ts` | `@solana/web3.js` 1.x       | `Web3.js (legacy)` |

Order tabs `Kit` → `Web3.js v3` → `Rust` → `Web3.js (legacy)`; the legacy tab
always goes last. Use these titles verbatim: Mintlify syncs tabs with the same
title on a page. Token pages use one section per language instead, in the
order `### Kit`, `### Web3.js v3`, `### Rust`, `### Python`,
`### Web3.js (legacy)`; the TypeScript sections use the storage keys
`token-ts-kit`, `token-ts-web3v3`, and `token-ts-legacy`.

Both web3.js majors are installed side by side, which pnpm only allows under
distinct names, so example sources import the aliases `@solana/web3.js-v3` and
`@solana/web3.js-legacy`. Both are rewritten back to `@solana/web3.js` when the
snippet is generated (`examples:build`, via `restoreWeb3jsSpecifier()` in
`packages/docs-tooling`), so readers see the real package name. `@solana/spl-token` depends on legacy web3.js and
resolves to it automatically; v3 token examples use the `@solana-program/*`
clients instead.

1. Put the runnable file under
   `packages/docs-examples/cookbook/<section>/<page>/` (e.g. `kit.ts`).
2. Wrap the part you want to render in `// #region <name>` /
   `// #endregion <name>` markers.
3. Add a sibling `<name>.test.ts` that imports the file — that's enough to
   exercise it end-to-end against surfpool.
4. Describe the block (its tabs, files and regions) in that folder's
   `blocks.json`, then run
   `pnpm --filter @workspace/docs-tooling examples:build`. That writes the
   snippet `apps/docs/snippets/examples/<section>/<page>/<block>.mdx`.
5. In the MDX page, import and place it:
   `import SendSol from "/snippets/examples/cookbook/transactions/send-sol/transfer.mdx";`
   then `<SendSol />`. Every locale copy imports the same snippet.

Run `pnpm --filter @workspace/docs-examples test` locally — needs the `surfpool`
CLI installed via
`cargo install --git https://github.com/solana-foundation/surfpool --locked surfpool-cli`.

### Rust

Each Rust example is a member crate of the Cargo workspace at
`packages/docs-examples/Cargo.toml`. The pattern mirrors the TS one:

1. Add `packages/docs-examples/cookbook/<section>/<page>/rust/Cargo.toml` with
   `name = "cookbook-<section>-<page>"` and `[[bin]]` pointing at `src/main.rs`.
   Pages with two distinct Rust snippets use `src/bin/<variant>.rs` with
   multiple `[[bin]]` entries.
2. Wrap the rendered region of `main.rs` in `// #region <name>` /
   `// #endregion <name>` — same syntax as TS, the include plugin handles both.
3. Add the Rust tab to the block in `blocks.json` and rebuild the snippets
   (`examples:build`).

Run locally with `bash packages/docs-examples/scripts/run-rust-examples.sh` —
spawns surfpool, ensures the fixture keypair exists, and cargo-runs every binary
in the workspace.

### Python

Python snippets follow the same layout, one file per rendered block:

1. Put the snippet in
   `packages/docs-examples/cookbook/<section>/<page>/python.py` — or
   `<variant>-python.py` when the page has more than one runnable block,
   matching its TypeScript siblings.
2. Wrap the rendered region in `# #region <name>` / `# #endregion <name>`,
   reusing the region name the other tabs on that block use.
3. Add the Python tab to the block in `blocks.json` and rebuild the snippets
   (`examples:build`).

There is no Python test suite yet, so these are not covered by CI.

### Runnable blocks and their console output

A generated example snippet shows a Run button beside the code. Nothing
executes in the browser: the console prints output recorded from the real
example, stored beside its source as `<name>.output.txt` (looked up as
`<source>.<region>.output.txt`, then `<source>.output.txt`). Record it with
`RECORD_OUTPUT=1 pnpm --filter @workspace/docs-examples exec vitest run <dir>`
and rebuild the snippets. A tab with no recorded output gets no Run button.
Without JavaScript the recorded output is shown directly.

`cookbook/wallets/create-keypair` builds its output in the browser instead (a
fresh Ed25519 key pair; `data-runner="generate-keypair"`, handled by
`apps/docs/run-examples.js`). Prefer a recorded `.output.txt` wherever a fixed
value is honest — it costs no client JavaScript.

## RPC providers

To be considered for listing on the https://solana.com/rpc page, providers must
demonstrate:

- **Reliability**: High uptime with robust failover and redundancy.
- **Performance**: Low-latency responses and the ability to handle Solana's high
  throughput.
- **Documentation**: Comprehensive guides, API examples, setup instructions, and
  performance dashboards.
- **Developer Support**: Strong resources, active community engagement, and
  transparent service status reporting.
- **Compliance**: Review by the Solana Foundation to ensure technical, security,
  and operational standards are met.
