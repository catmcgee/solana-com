/*
 * Mintlify stand-in for <LiveFeed>: a link to Explorer. apps/web drops this
 * import and renders the live mainnet feed
 * (apps/web/src/components/docs/docs-live-feed.client.tsx) instead.
 */
export const LiveFeed = () => (
  <p>
    <a href="https://explorer.solana.com">Watch mainnet on Solana Explorer</a>
  </p>
);
