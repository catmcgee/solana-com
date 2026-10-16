# Before production

Things that are deliberately set for the preview and must change before the
new docs and /developers go live on solana.com.

## Search engines (the preview is hidden on purpose)

The preview is deployed as a Vercel **preview** (staging) deployment, with the
`solana-docs-preview.vercel.app` alias pointed at it. That keeps it out of
search engines without any extra switches. Undo the preview-only bits:

- [ ] Remove the preview branch from `apps/web/src/app/robots.ts` (it
      disallows every crawler when `VERCEL_ENV === "preview"`). Production
      never matches it, but it is preview-only scaffolding.
- [ ] Remove `"robots": "noindex, nofollow"` from `seo.metatags` in
      `apps/docs/docs.json`, so the Mintlify pages are indexed.
- [ ] Deploy production with `vercel deploy --prod` (not the preview + alias
      flow) and check `/robots.txt` lists the sitemaps again.

## Links and hosts

- [ ] Replace `catmcgee/solana-com` (`tree/mintlify-migration`) links with
      `solana-foundation/solana-com` (`tree/main`): tutorial "view the code"
      links and `apps/docs/playground.js` `CONFIG.source`.
- [ ] `MINTLIFY_ORIGIN` on the production Vercel project.
- [ ] Start here agent banner: on solana.com, fetch
      `https://solana.com/developers/docs/intro/agent-setup.md` and check it
      returns the Markdown guide (the banner's copied line points there;
      `agent-banner.js` swaps in the preview origin before launch).

## Docs head injection (needed for the docs header)

The one-row docs header is our CSS (`apps/docs/styles/theme.css` sections
4-5b), but Mintlify inlines that CSS deep in `<body>`, after the header markup,
so on its own the browser first paints Mintlify's two-row header and then
reflows it. apps/web fixes that at the proxy: for HTML document navigations
to the docs (`/developers/docs/**`, `/:locale/developers/docs/**`,
`/developers/cookbook/**`, `/developers/bootcamp/**`, `/learn/*`), the
middleware (`apps/web/src/middleware.ts`,
`apps/web/src/lib/docs-edge/head-inject.ts`) fetches the page from the same
Mintlify URL the rewrite would use and streams it back with:

- font preloads for `/fonts/ABCDiatype-{Regular,Medium,Bold}.woff2` right
  after `<head>` (the URLs /developers and docs.json `fonts` use too);
- `<link rel="stylesheet" href="/docs-head.css?v=<hash>">` right before
  `</head>`. `apps/web/public/docs-head.css` is generated from
  `apps/docs/styles/{nojs,theme,assistant}.css` by
  `pnpm --filter @workspace/docs-tooling gen:docs-head`; `docs-tooling verify`
  fails when it is stale.

Every other request (assets, `.md`, `_mintlify` calls, RSC and prefetch
fetches from Mintlify's client router) keeps the plain rewrite. If Mintlify is
unreachable, the middleware falls back to the rewrite. Responses carry
`x-solana-docs-head: <hash>`.

This only applies through the solana.com proxy. The raw `*.mintlify.site`
host serves the pages unchanged, so the header still flashes there.

- [ ] Keep `MINTLIFY_ORIGIN` and the head injection when moving to a custom
      domain or a self-hosted export: both serve the same HTML.
- [ ] After a Mintlify version bump, rerun the throttled first-paint check:
      the header must be one row in the first painted frame.

## Translations

- [ ] Run Lingo for all English changes since the migration.
