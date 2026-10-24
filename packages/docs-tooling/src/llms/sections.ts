/**
 * One-line routing hints shown to agents at the top of each per-section
 * index (/developers/docs/<section>/llms.txt). Ported verbatim from the deleted
 * apps/docs/src/app/docs/[section]/llms.txt/route.ts.
 */
export const SECTION_NOTES: Record<string, string> = {
  finance:
    "Financial products on Solana - assets, payments, markets, and DeFi.",
  payments:
    "Sending, accepting, and processing payments on Solana - subscriptions, batching, and agentic flows.",
  tokenization:
    "Issuing stablecoins, tokenizing real-world assets, and operating compliant tokens on Solana.",
  defi: "Trading systems, DEX and oracle integration, and financial applications on Solana.",
  rpc: "The complete Solana JSON-RPC reference - HTTP methods and websocket subscriptions.",
  tools:
    "Developer resources - tools, indexing, references, and ecosystem links.",
  core: "Core concepts - accounts, transactions, programs, PDAs, and CPIs.",
  tokens: "The token programs, token accounts, and token extensions.",
};

/** Sections of the site-wide /llms.txt, in order (old route's SECTIONS). */
export const INDEX_SECTIONS: { heading: string; prefix: string }[] = [
  { heading: "Core documentation", prefix: "/developers/docs" },
  { heading: "Cookbook", prefix: "/developers/cookbook" },
  { heading: "Learn", prefix: "/learn" },
];
