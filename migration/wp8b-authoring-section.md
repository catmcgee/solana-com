## Path and concept components (WP8b)

Generators: `pnpm --filter @workspace/docs-tooling gen:concepts|gen:paths|gen:addresses [--sync] [--check]`
(`src/generators/*.ts`). Output under `apps/docs/snippets/{concepts,paths}/<lang>/` is
generated: never edit it, and never put hand-written files there (the generator
refuses to delete them, and `--check` fails). `--check` fails on stale, missing or
orphaned output and on pages that `--sync` would change (`--check` runs the page
sync in memory, with or without `--sync`, and never writes).

Sources: `apps/docs/concepts/concepts.<lang>.json`, `apps/docs/paths/paths.<lang>.json`,
`apps/docs/addresses.json` (plus optional `addresses.<lang>.json` with `_ui.cta` and
per-address `label` overrides). A locale JSON only overrides text: keys, order, hrefs,
`first`, demo components and recorded-output paths always come from English. If
the locale page exists, links point at `/<loc>/…`. Otherwise they point at the
English page. This holds even when a locale has no concepts JSON yet: the chip
text is English, but the link goes to the translated page.

**Rule for anything that must read without JavaScript.** Never use `{…}` expression
children in an MDX snippet. The SSR probe showed the server render dropping them,
and the text then existed only in the client payload. Raw `<nav>`, `<details>`, `<noscript>` and
`<abbr>` are dropped too. Tooltip `tip`/`headline`/`cta`/`href` are client-only.

| Want | Write |
|---|---|
| Concept card | `import Accounts from "/snippets/concepts/en/account.mdx"` then `<Accounts />` |
| "In short" on a concept's canonical page | `## In short`, then `<Short />` from `…/<key>.short.mdx`, then `<UsedIn />` from `…/<key>.used-in.mdx` |
| Inline concept chip | `<span className="sol-chip" data-concept="account">accounts</span>`, then run `gen:concepts --sync`. Sync expands it into a Tooltip plus a `nojs-only` "(Accounts: …)" fallback that contains a real link. The spec form `<Tooltip data-concept="account">accounts</Tooltip>` is accepted and converted. |
| Coverage table (How Solana works root) | `import Coverage from "/snippets/concepts/en/coverage.mdx"` |
| Path stepper | `/snippets/paths/en/<path>/stepper-<n>.mdx`: n = 0 on the path intro page, n = step number on step pages |
| Next-step card | `/snippets/paths/en/<path>/next-<n>.mdx`: n = 0 on the intro page, n = step number on step pages. The last step has one only if `after` is set. |
| Path card (job picker, hubs) | `/snippets/paths/en/<path>/card.mdx` |
| Demo (step 1 pages) | `/snippets/paths/en/<path>/demo.mdx`. The static Steps with the recorded Surfpool output are the content. The `snippets/demos/*-demo.jsx` replay above them renders only with JS. A demo with no recorded output gets no replay. |
| Address mention | ``<span className="sol-address" data-address="EPjF…Dt1v">`EPjF…Dt1v`</span>``, then run `gen:addresses --sync`. The address must be in `addresses.json`. Never inside code or recorded output. `--report` lists unmarked prose mentions. |

Avoid chips and address mentions inside GFM tables: syncing re-pads the whole
table (codec behaviour), so the diff is not local. The generators warn when they
find one.

Backlinks ("You've used this in") and the coverage table are computed from the
English path pages (intro and steps in `paths.en.json`). A page *introduces* a concept
when it imports `/snippets/concepts/<lang>/<key>.mdx`. It *mentions* the concept
when it has a `data-concept="<key>"` chip. Re-run `gen:concepts` after editing a path
page.

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

Styles: `apps/docs/styles/concepts.css` and `apps/docs/styles/stepper.css` (light and
dark through `html.dark`; tokens `--solui-*`). No-JS fallbacks rely on the
`.nojs-only` rules from `migration/setup-nojs-fallback.css`, which WP11 must ship as a
root CSS file.
