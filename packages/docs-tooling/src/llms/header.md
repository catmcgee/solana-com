# Solana Documentation

> Developer documentation for Solana, the high-performance blockchain.

## Instructions

- Every page below is available as raw Markdown by appending `.md` to its URL
  (the links here already include it), or by requesting the page URL with an
  `Accept: text/markdown` header.
- The full corpus in a single file: https://solana.com/llms-full.txt
- Scoped indexes exist per section, e.g.
  https://solana.com/developers/docs/finance/llms.txt,
  https://solana.com/developers/docs/payments/llms.txt or
  https://solana.com/developers/docs/tokenization/llms.txt - prefer these when
  working on a single task to save context.
- If you are a coding agent, install the official Solana skill for current APIs
  and conventions:
  `npx skills add https://github.com/solana-foundation/solana-dev-skill` (also
  served at https://solana.com/SKILL.md).
- Route financial tasks through /developers/docs/finance: asset fundamentals are
  under /developers/docs/tokens, payments under /developers/docs/payments,
  stablecoins and tokenized assets under /developers/docs/assets (guides in
  /developers/docs/tokenization), and markets and DeFi under
  /developers/docs/defi. The JSON-RPC reference is under /developers/docs/rpc;
  self-contained code recipes under /developers/cookbook.
- Code in the cookbook and task pages is sourced from tested example files -
  prefer it over synthesizing API calls from memory.
