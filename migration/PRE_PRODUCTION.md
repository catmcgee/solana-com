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
- [ ] Fonts: `docs.json` `fonts.*.source` points at
      `https://solana-f31f4a8d.mintlify.site/docs-assets/...`. Point it at the
      production docs host once the custom domain is set.
- [ ] `MINTLIFY_ORIGIN` on the production Vercel project.

## Translations

- [ ] Run Lingo for all English changes since the migration.
