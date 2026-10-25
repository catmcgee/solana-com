import "server-only";

import type { TemplateVisualName } from "../fixtures/template-visuals";
import { LEARN_TRACK } from "./followups";

/**
 * Canonical docs pages for the most common questions, given to the model
 * before search results: the docs agent's DocsWorkflowRouter routes, used as
 * retrieval pins only (the agent also serves canned answers for them; this
 * backend always asks the model), with its /docs paths moved to
 * /developers/docs. Search only covers titles and descriptions, so these
 * make sure "how do I create a token" reads the quickstart.
 */
export type Workflow = {
  key: string;
  /** The template visual the route stands for (see ./templates.ts). */
  visual: TemplateVisualName;
  /** The docs topic facet it is about (./followups.ts ranks it first). */
  topic: string;
  docs: string[];
  /**
   * Ours: pages with the route's code, read for "show me the code"; the
   * canonical pages above explain without code (the PDA, Accounts and CPI
   * overviews have none), so the model wrote it from memory.
   */
  code: string[];
};

const WORKFLOWS: Array<Workflow & { match: RegExp }> = [
  {
    key: "token_lifecycle",
    visual: "tokenLifecycle",
    topic: "tokens",
    match:
      /\b(create|make|new|mint)\b.*\b(spl\s+token|token|mint)\b|\bspl-token create-token\b/i,
    docs: [
      "/developers/docs/tokens/quickstart",
      "/developers/docs/tokens/basics",
    ],
    code: [
      "/developers/docs/tokens/basics/create-mint",
      "/developers/docs/tokens/basics/create-token-account",
      "/developers/docs/tokens/basics/mint-tokens",
    ],
  },
  {
    key: "pda_derivation",
    visual: "pdaDerivation",
    topic: "pda",
    match:
      /\b(program derived address|derive(?: a)? pda|pda derivation|what(?:'s| is) (?:a )?pda)\b/i,
    docs: [
      "/developers/docs/core/pda",
      "/developers/docs/core/accounts",
      "/developers/docs/core/cpi",
    ],
    code: [
      "/developers/docs/core/pda/pda-derivation",
      "/developers/docs/core/pda/pda-accounts",
    ],
  },
  {
    key: "transaction_signing",
    visual: "transactionSigning",
    topic: "transactions",
    match:
      /\b(sign|send|submit|confirm)\b.*\b(transaction|tx)\b|\btransaction signing\b|\brecent blockhash\b/i,
    docs: ["/developers/docs/core/transactions", "/developers/docs/core/fees"],
    code: ["/developers/cookbook/transactions/send-sol"],
  },
  {
    key: "cpi_flow",
    visual: "cpiFlow",
    topic: "cpi",
    // Ours after the agent's: the empty state asks it in plain words.
    match:
      /\b(cross-program invocation|cross program invocation|cpi|invoke_signed|invoke another program)\b|\b(?:one|a) program calls? another\b|\bcall(?:s|ing)? another program\b/i,
    docs: ["/developers/docs/core/cpi", "/developers/docs/core/pda"],
    code: [
      "/developers/docs/core/cpi/cpi-without-pda",
      "/developers/docs/core/cpi/cpi-with-pda",
    ],
  },
  {
    key: "account_initialization",
    visual: "accountInitialization",
    topic: "accounts",
    match:
      /\b(initialize|initialise|create)\b.*\b(account|pda account|state account)\b|\brent[- ]exempt\b.*\baccount\b/i,
    docs: ["/developers/docs/core/accounts", "/developers/docs/core/pda"],
    code: ["/developers/cookbook/accounts/create-account"],
  },
  {
    key: "rpc_request_lifecycle",
    visual: "rpcRequestLifecycle",
    topic: "rpc",
    match:
      /\b(rpc request lifecycle|rpc lifecycle|how .*rpc node|json-rpc request|fetch account state)\b/i,
    docs: [
      "/developers/docs/rpc",
      "/developers/docs/rpc/http/getaccountinfo",
      "/developers/docs/rpc/http/sendtransaction",
    ],
    // The method pages carry the examples.
    code: [
      "/developers/docs/rpc/http/getaccountinfo",
      "/developers/docs/rpc/http/sendtransaction",
    ],
  },
];

const COMPARISON =
  /\b(compare|comparison|difference|differences|versus|vs\.?|better|which one)\b/i;

/** The question's workflow route, if any (never for comparisons). */
export function workflowFor(question: string): Workflow | null {
  const text = question.trim();
  if (!text || COMPARISON.test(text)) return null;
  const route = WORKFLOWS.find((workflow) => workflow.match.test(text));
  if (!route) return null;
  const { match: _match, ...workflow } = route;
  return workflow;
}

/**
 * A request for code ("Show me the code for that in TypeScript.", the code
 * follow-up buttons' message; "example in Rust"): short follow-ups like it
 * are about the previous question, not their own words.
 */
export const CODE_FOLLOWUP =
  /\bshow me (?:the |some )?code\b|\bcode (?:example|sample|snippet)s?\b|\b(?:an |the )?(?:example|snippet)s?\b|\bin (?:rust|typescript|javascript|python|ts|js)\b/i;

/**
 * Ours, not the agent's: common questions whose page search (titles and
 * descriptions only) missed in the live eval, where the agent's full-text
 * search finds it. Pages only, no visual.
 */
const TOPIC_PINS: Array<{ match: RegExp; docs: string[] }> = [
  {
    match:
      /\binstall(?:ing|ation)?\b[^.?!]*\b(?:solana|cli|command[- ]line|tool(?:s|chain)?|agave|anchor)\b/i,
    docs: [
      "/developers/docs/intro/installation/dependencies",
      "/developers/docs/intro/installation/solana-cli-basics",
    ],
  },
  {
    match:
      /\b(?:what is|what's|how (?:do|can|should) i)\b[^.?!]*\bstak(?:e|ing)\b|\bstake (?:my )?sol\b|\bstaking rewards?\b/i,
    docs: ["/learn/what-is-staking"],
  },
  {
    match:
      /\btransactions?\b[^.?!]*\bexpir|\bexpir\w*\b[^.?!]*\btransactions?\b|\bblockhash not found\b|\bblock ?height exceeded\b/i,
    docs: ["/developers/cookbook/transactions/confirmation"],
  },
];

/**
 * "Teach me the next lesson: What is Staking?." (the Next lesson button)
 * reads the lesson it names; search may not find a Learn page by title.
 */
const LESSON_ASK = /\bnext lesson\b|\bteach me\b/i;

function lessonPins(question: string): string[] {
  if (!LESSON_ASK.test(question)) return [];
  const text = question.toLowerCase();
  return LEARN_TRACK.filter(({ title }) =>
    text.includes(title.toLowerCase()),
  ).map(({ url }) => url);
}

const RPC_METHOD =
  /^(?:get[a-z]{3,}|send(?:raw)?transaction|simulatetransaction|requestairdrop|is[a-z]{4,}|minimumledgerslot|[a-z]+subscribe|[a-z]+unsubscribe)$/;

/**
 * RPC method names in the text (getAccountInfo, accountSubscribe, …),
 * lowercased like their page slugs. Callers drop the ones without a page.
 */
export function rpcMethods(text: string): string[] {
  const words = text.match(/[A-Za-z]{6,}/g) ?? [];
  return [
    ...new Set(
      words.map((word) => word.toLowerCase()).filter((w) => RPC_METHOD.test(w)),
    ),
  ];
}

/**
 * Pages to read before searching, most specific first: a Learn lesson the
 * question asks for, the RPC method pages it may name (HTTP, then
 * WebSocket; most candidates are words like "getting" with no page, which
 * the caller drops), the workflow's canonical pages, then the topic pins.
 */
export function pinnedPaths(question: string): string[] {
  const methods = rpcMethods(question)
    .slice(0, 8)
    .flatMap((method) => [
      `/developers/docs/rpc/http/${method}`,
      `/developers/docs/rpc/websocket/${method}`,
    ]);
  const topics = TOPIC_PINS.filter(({ match }) => match.test(question));
  return [
    ...new Set([
      ...lessonPins(question),
      ...methods,
      ...(workflowFor(question)?.docs ?? []),
      ...topics.flatMap(({ docs }) => docs),
    ]),
  ];
}
