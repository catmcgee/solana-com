import "server-only";

/**
 * Skill packs from the docs agent (solana-com-agent skills/) that only some
 * questions need, chosen by keyword and sent in the user message as
 * <guidance>, so the system prompt stays byte-stable and cacheable. The
 * agent keeps them always on; here they cost tokens only when they apply.
 *
 * Edits from the agent's text: /docs/... links are /developers/docs/...;
 * "search_docs"/"read_doc" are the docs excerpts; Surfpool drops its
 * decode_error line (decoded errors arrive as <reference> blocks); the
 * learning paths keep the Learn Solana track only (the Developer Bootcamp
 * lessons now redirect to three video pages).
 */

const SURFPOOL = `# Surfpool Skill

You route and answer questions about Surfpool, the drop-in replacement for \`solana-test-validator\` that simulates programs locally against mainnet accounts fetched just in time. Its docs live under /developers/docs/tools/surfpool/... — always cite those pages (docs.surfpool.run redirects there).

Division of labor: the solana-dev skill owns test-strategy choice (Surfpool vs LiteSVM vs Mollusk) and the general program-testing workflow; this skill owns the Surfpool product surface — which entry point to recommend and where each topic is documented.

## Advisory Voice

A visitor's surfnet runs on their own machine (localhost). You can never start, reach, or query one — present commands and code for the visitor to run. If they want an AI agent to drive Surfpool, that is their own coding agent (Claude Code, Cursor) connected to \`surfpool mcp\` — never you.

## Pick the Right Surface

- Running a local network or trying things out: the CLI — \`surfpool start\` launches a surfnet with a terminal UI dashboard, and in an Anchor workspace it also generates deployment runbooks and deploys the workspace programs. Cite /developers/docs/tools/surfpool/toolchain/getting-started, .../toolchain/cli, .../toolchain/tui.
- Rust integration tests: the \`surfpool-sdk\` crate embeds a surfnet in-process. Cite /developers/docs/tools/surfpool/sdk/rust-reference (installation and configuration live under /developers/docs/tools/surfpool/sdk/).
- Node.js / TypeScript tests: the \`@solana/surfpool\` package. Cite /developers/docs/tools/surfpool/sdk/overview and .../sdk/js-reference.
- Apps or tests already on @solana/kit: the Kit plugin — \`createClient().use(surfpool())\` from \`@solana/surfpool/kit\` gives a pre-funded \`client.payer\`, \`client.rpc\`, and typed \`client.cheatcodes\` (method names drop the \`surfnet_\` prefix: \`setAccount\`, \`timeTravel\`, ...). Cite /developers/docs/tools/surfpool/sdk/kit-plugin.
- Driving Surfpool from a coding agent: \`surfpool mcp\` (stdio MCP server). Cite /developers/docs/tools/surfpool/toolchain/cli.
- Reproducible program deployments to any network: Infrastructure-as-Code runbooks in the txtx DSL, executed with \`surfpool run\`. Cite /developers/docs/tools/surfpool/iac/getting-started, .../iac/language, and the SVM addon at .../iac/svm/overview (actions, functions, signers are sibling pages). The slug is \`iac/svm/overview\` — there is no \`iac/svm-addon\` page.

## Cheatcodes

Cheatcodes are Surfpool-only JSON-RPC methods (prefix \`surfnet_\`) for shaping network state in tests; the canonical reference is /developers/docs/tools/surfpool/rpc/cheatcodes. Families and representative methods:

- Account state: \`surfnet_setAccount\`, \`surfnet_cloneProgramAccount\`, \`surfnet_resetAccount\`, \`surfnet_offlineAccount\`, \`surfnet_setProgramAuthority\`, \`surfnet_writeProgram\`, \`surfnet_setSupply\`
- Token balances: \`surfnet_setTokenAccount\` — set SOL and SPL token balances directly instead of long setup transactions
- Clock: \`surfnet_timeTravel\` (to an absolute epoch, slot, or timestamp), \`surfnet_pauseClock\`, \`surfnet_resumeClock\`
- Compute-unit profiling: \`surfnet_profileTransaction\`, \`surfnet_getTransactionProfile\`, \`surfnet_getProfileResultsByTag\`
- IDLs: \`surfnet_registerIdl\`, \`surfnet_getActiveIdl\`
- Scenarios and account streaming: \`surfnet_registerScenario\`, \`surfnet_streamAccount\` / \`surfnet_streamAccounts\`, \`surfnet_getStreamedAccounts\`
- Network: \`surfnet_resetNetwork\`, \`surfnet_exportSnapshot\`, \`surfnet_getSurfnetInfo\`, \`surfnet_getLocalSignatures\`

Use this map to name the right method and cite the cheatcodes page. Verify exact parameter shapes against the docs excerpts before quoting them; if they lack that detail, give the method name and the citation without inventing a signature.

Standard Solana JSON-RPC and WebSocket methods all work against a surfnet too — the references are /developers/docs/tools/surfpool/rpc/{overview, accounts, transactions, network, node, admin, websockets}.

## Interplay With Other Guidance

- For "why is my transaction over the compute limit" point to \`surfnet_profileTransaction\`.
- Keep answers version-agnostic: Surfpool releases frequently, so never state version numbers, flag lists, or install commands from memory — take them from the docs excerpts (installation lives at /developers/docs/tools/surfpool/toolchain/getting-started).`;

const LEARN = `# Guided learning paths

solana.com has an ordered learning track for new Solana users, listed below. Use it whenever the user signals they are learning in sequence: "where do I start", "what should I learn next", "I finished X", "what comes after X", or when they identify as a beginner working through the material.

Rules:

- Pick by audience: non-technical users → Learn Solana. Developers have no ordered track here: answer from the docs excerpts as usual, and for "where do I start" recommend the Quickstart at /developers/docs/quickstart. If unclear, ask one short question before recommending.
- When the user says they finished a lesson, find it in the track below and recommend the next lesson in order — name it, link its URL, and say in one sentence what it covers. Offer the one after it as "after that".
- When the user asks where to start, recommend the track's first lesson.
- Always cite the lesson URLs exactly as listed below; never invent lesson names or URLs that are not in the outline.
- If what they finished is not in the track, do not force a sequence — answer from the docs excerpts as usual and suggest the closest track lesson only if one clearly fits.
- The track orders solana.com material only; deeper reference material still comes from the docs excerpts.

## Learn Solana (user track)

_Audience: New Solana users: wallets, tokens, staking, safety — no coding._

1. [What is Solana?](/learn/what-is-solana) — An introduction to Solana - a fast, low-cost network that enables new ways to transfer value, create applications, and interact online.
2. [What is a Wallet?](/learn/what-is-a-wallet) — Learn what a Solana wallet is, how it works, and how to set one up safely. Your wallet is the tool you'll use to interact with Solana applications.
3. [Understanding Solana Transaction Fees](/learn/understanding-solana-transaction-fees) — Learn how transaction fees work on Solana, why they're low, and what this means for different use cases.
4. [Sending and Receiving SOL](/learn/sending-and-receiving-sol) — Learn how to send and receive SOL tokens - the fundamental skill for interacting with the Solana network and its applications.
5. [What is Staking?](/learn/what-is-staking) — Learn how staking works on Solana, how to earn rewards by helping secure the network, and what to consider when choosing validators.
6. [Introduction to Solana Tokens](/learn/introduction-to-solana-tokens) — Learn about tokens - the different types of digital assets on Solana including stablecoins, wrapped tokens, and project tokens.
7. [What are NFTs?](/learn/what-are-nfts) — Learn about Non-Fungible Tokens (NFTs) on Solana - unique digital assets that represent ownership of specific items like art, collectibles, and more.
8. [Introduction to DeFi on Solana](/learn/introduction-to-defi-on-solana) — Learn about decentralized finance (DeFi) applications on Solana, including trading, lending, and yield opportunities.
9. [Exploring Solana Applications](/learn/exploring-solana-applications) — Discover the diverse ecosystem of applications built on Solana - from financial services and gaming to social platforms and creative tools, all accessible with just your wallet.
10. [Staying Safe on Solana](/learn/staying-safe-on-solana) — Learn essential security practices to protect your assets and avoid common scams while using Solana applications.`;

const PACKS: Array<{ name: string; text: string; trigger: RegExp }> = [
  {
    name: "surfpool",
    text: SURFPOOL,
    trigger:
      /\bsurf(?:pool|net)|\bcheatcodes?\b|\btxtx\b|\brunbooks?\b|\blitesvm\b|\bmollusk\b|\btest[- ]validator\b|\blocal (?:network|validator|cluster)\b|\bintegration[- ]tests?\b/i,
  },
  {
    name: "learn",
    text: LEARN,
    trigger:
      /\bnext lesson\b|\bteach me (?:the |this |a )?lesson\b|\bwhere (?:do|should) i (?:start|begin)\b|\bwhat(?:'s|’s| is| should i (?:learn|read|do)) next\b|\bi (?:just )?(?:finished|completed)\b|\bafter (?:the|this|that) (?:lesson|page|tutorial)\b|\bnew to solana\b|\bbeginners?\b|\broadmap\b|\blearning path\b|\bgetting started\b|\blearn solana\b/i,
  },
];

/** The packs a question needs: its own words, or the previous question's. */
export function guidancePacks(question: string, previous = ""): string[] {
  return PACKS.filter(
    ({ trigger }) => trigger.test(question) || trigger.test(previous),
  ).map(({ name }) => name);
}

function packText(question: string, previous: string): string {
  const names = guidancePacks(question, previous);
  return PACKS.filter(({ name }) => names.includes(name))
    .map((pack) => pack.text)
    .join("\n\n");
}

/** The <guidance> block for a question, or "" when no pack applies. */
export function guidanceFor(question: string, previous = ""): string {
  const text = packText(question, previous);
  return text ? `<guidance>\n${text}\n</guidance>\n\n` : "";
}

/**
 * The docs paths the question's packs list, which the answer may link (and
 * so cite) like the docs excerpts. Some are sections without a page of
 * their own; the caller keeps the ones that resolve.
 */
export function guidanceLinks(question: string, previous = ""): string[] {
  const paths =
    packText(question, previous).match(
      /\/(?:developers\/docs|learn)\/[a-z0-9/-]*[a-z0-9]/g,
    ) ?? [];
  return [...new Set(paths)];
}
