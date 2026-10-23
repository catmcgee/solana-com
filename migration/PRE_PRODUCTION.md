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
      `apps/docs/docs.json`, so the docs pages are indexed.
- [ ] Deploy production with `vercel deploy --prod` (not the preview + alias
      flow) and check `/robots.txt` lists the sitemaps again.

## Links and hosts

- [ ] Replace `catmcgee/solana-com` (`tree/docs-redesign`) links with
      `solana-foundation/solana-com` (`tree/main`): tutorial "view the code"
      links and `apps/docs/playground.js` `CONFIG.source`.
- [ ] Start here agent banner: on solana.com, fetch
      `https://solana.com/developers/docs/intro/agent-setup.md` and check it
      returns the Markdown guide (the banner's copied line points there;
      `agent-banner.js` swaps in the preview origin before launch).

## Keys

- [ ] Set a production HELIUS_API_KEY (and SOLANA_RPC_URL for the live feed)
      in Vercel Production; the current key is preview-only and must be
      rotated. Without it, the Quickstart's `/api/devnet-airdrop` answers 503
      and readers are sent to faucet.solana.com.

## Translations

- [ ] Run Lingo for all English changes since the migration.
