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
      rotated. The Quickstart's `/api/devnet-airdrop` sends over it (public
      devnet without it).
- [ ] Give the Quickstart's `/api/devnet-airdrop` its own production faucet
      wallet: a new keypair as DEVNET_FAUCET_SECRET_KEY (sensitive) in Vercel
      Production, never the preview one, funded with devnet SOL from
      faucet.solana.com (each new reader wallet gets 0.02 SOL, so 2 SOL covers
      about 100). Without it, the route answers 503 and readers are sent to
      faucet.solana.com.
- [ ] Give the "Solana in action" demos their own production wallets: new
      DEMO_PAYER_SECRET_KEY and DEMO_PAYEE_SECRET_KEY in Vercel Production
      (the current ones are preview-only), and fund the new payer with devnet
      SOL for fees and devnet USDC from faucet.circle.com. Without them,
      `/api/demo/checkout` and `/api/demo/paywall-call` answer 503 and the
      scenes show "Explorer link unavailable".

## Translations

- [ ] Run Lingo for all English changes since the migration.
