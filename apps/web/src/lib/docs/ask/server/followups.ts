import "server-only";

import { visualIntent } from "./intent";

/**
 * The follow-ups a finished answer offers, computed without a model call as
 * the docs agent does, in its wire shapes:
 * - `code_followups` (AgentService::conceptualCodeFollowups): a conceptual
 *   answer ends with CONCEPTUAL_CODE_PROMPT and one button per language
 *   found in the answer and the docs it was given;
 * - `suggested_followups` (FollowupSuggestionService): the next lesson of
 *   the Learn track, curated questions for the docs' main topics (the
 *   question's own first), then pages that were read but not cited.
 */

export const CONCEPTUAL_CODE_PROMPT =
  "Do you want to see a code example for that? If so, what language do you want it in?";

export const SUGGESTED_FOLLOWUPS_PROMPT =
  "Want to keep going? Try one of these:";

export type CodeFollowupsWire = {
  prompt: string;
  buttons: Array<{
    type: "show_code";
    label: string;
    language: string;
    message: string;
  }>;
};

export type SuggestedFollowupsWire = {
  prompt: string;
  buttons: Array<{ type: "ask"; label: string; message: string }>;
};

// --- Code follow-ups -------------------------------------------------------------

const CODE_LANGUAGES: Array<{ id: string; label: string; aliases: string[] }> =
  [
    {
      id: "rust",
      label: "Rust",
      aliases: ["rust", "rs", "anchor", "anchor-lang"],
    },
    {
      id: "typescript",
      label: "TypeScript",
      aliases: ["typescript", "ts", "tsx", "@solana/kit"],
    },
    {
      id: "javascript",
      label: "JavaScript",
      aliases: ["javascript", "js", "jsx", "web3.js", "@solana/web3.js"],
    },
    { id: "python", label: "Python", aliases: ["python", "py"] },
  ];

const DEFAULT_LANGUAGES = ["rust", "typescript"];

const FENCE_LANGUAGES: Record<string, string> = {
  rust: "rust",
  rs: "rust",
  typescript: "typescript",
  ts: "typescript",
  tsx: "typescript",
  javascript: "javascript",
  js: "javascript",
  jsx: "javascript",
  python: "python",
  py: "python",
};

function containsAlias(text: string, alias: string): boolean {
  if (/[/.@]/.test(alias)) return text.includes(alias);
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

/** Languages in code fences and named in the text, in the agent's order. */
export function availableCodeLanguages(haystack: string): string[] {
  const found = new Set<string>();
  for (const match of haystack.matchAll(/```([A-Za-z0-9_+#.-]+)/g)) {
    const language = FENCE_LANGUAGES[match[1]!.toLowerCase()];
    if (language) found.add(language);
  }
  const lower = haystack.toLowerCase();
  for (const { id, aliases } of CODE_LANGUAGES) {
    if (aliases.some((alias) => containsAlias(lower, alias))) found.add(id);
  }
  return CODE_LANGUAGES.map(({ id }) => id).filter((id) => found.has(id));
}

/**
 * True when the answer already asks the code question. Anywhere, not only
 * at the end: GLM sometimes puts it above its closing links, and a second
 * copy must not be added below them.
 */
export function asksCodePrompt(answer: string): boolean {
  return answer.includes(CONCEPTUAL_CODE_PROMPT);
}

/**
 * The answer as it should end (the agent's appendConceptualCodePrompt):
 * with code buttons, the code question once and last, where the client
 * shows it above the buttons; without them, no code question at all (a
 * decline the model closed with it).
 */
export function finalAnswer(answer: string, offersCode: boolean): string {
  const body = answer
    .split(CONCEPTUAL_CODE_PROMPT)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
  return offersCode ? `${body}\n\n${CONCEPTUAL_CODE_PROMPT}`.trim() : body;
}

/**
 * Code buttons for a conceptual answer, or null. Unlike the agent, never
 * for a decline (`grounded` false), an explanation of code the reader
 * pasted, or a user answer whose best-ranked source is a Learn lesson
 * (wallets, staking: no code to show), even when the model asked the code
 * question anyway
 * (finalAnswer then drops it); nor for an answer that already shows code,
 * unless the model asked, so the question never shows without its buttons.
 * Rust and TypeScript are always offered: the agent finds languages in the
 * whole pages its tools read, the excerpts here often show only one (or,
 * for overview pages, none).
 */
export function codeFollowupsFor(options: {
  question: string;
  answer: string;
  /** The docs text the model was given. */
  context: string;
  /** Languages in the whole pages the excerpts come from. */
  languages?: string[];
  /** False for a decline (see nous-agent.ts). */
  grounded: boolean;
  /** The reader asked about code they pasted. */
  aboutCode?: boolean;
  /** The pages the answer cites. */
  citations?: Array<{ url: string }>;
}): CodeFollowupsWire | null {
  const { question, answer, context, grounded } = options;
  const body = answer.trim();
  if (!body || !grounded || options.aboutCode) return null;
  const first = options.citations?.[0];
  if (first && isLesson(first.url)) return null;
  if (!asksCodePrompt(body)) {
    if (/```/.test(body)) return null;
    if (visualIntent(question, body) !== "conceptual") return null;
  }
  const found = new Set([
    ...availableCodeLanguages(`${body}\n${context}`),
    ...(options.languages ?? []),
    ...DEFAULT_LANGUAGES,
  ]);
  const languages = CODE_LANGUAGES.map(({ id }) => id).filter((id) =>
    found.has(id),
  );
  return {
    prompt: CONCEPTUAL_CODE_PROMPT,
    buttons: languages.map((id) => {
      const label = CODE_LANGUAGES.find((option) => option.id === id)!.label;
      return {
        type: "show_code",
        label,
        language: id,
        message: `Show me the code for that in ${label}.`,
      };
    }),
  };
}

// --- Suggested follow-ups --------------------------------------------------------

const MAX_SUGGESTIONS = 3;

/** Curated next questions per docs topic, in learning order (the agent's catalog). */
const TOPIC_QUESTIONS: Record<
  string,
  Array<{ label: string; message: string }>
> = {
  accounts: [
    {
      label: "Rent exemption",
      message: "How does rent exemption affect creating accounts?",
    },
    {
      label: "Account ownership",
      message: "How do programs own and modify account data?",
    },
  ],
  pda: [
    {
      label: "PDA signing",
      message: "How does a program sign for a PDA with invoke_signed?",
    },
    {
      label: "Canonical bumps",
      message: "What is a canonical bump and why does it matter?",
    },
  ],
  tokens: [
    {
      label: "Associated token accounts",
      message: "How do associated token accounts work?",
    },
    {
      label: "Token-2022 extensions",
      message:
        "What do Token-2022 extensions add over the original token program?",
    },
  ],
  transactions: [
    {
      label: "Priority fees",
      message: "How do priority fees affect whether my transaction lands?",
    },
    {
      label: "Transaction expiry",
      message:
        "Why do transactions expire, and how do I handle an expired blockhash?",
    },
  ],
  rpc: [
    {
      label: "Commitment levels",
      message:
        "What do the commitment levels mean when reading on-chain state?",
    },
    {
      label: "Websocket subscriptions",
      message: "How do I subscribe to account changes over websockets?",
    },
  ],
  cpi: [
    {
      label: "CPI privileges",
      message:
        "How is signer privilege passed through a cross-program invocation?",
    },
  ],
  programs: [
    {
      label: "Local testing",
      message: "How do I test a program locally with Surfpool or LiteSVM?",
    },
    {
      label: "Anchor discriminators",
      message: "What does the account discriminator do in an Anchor program?",
    },
  ],
  wallets: [
    {
      label: "Wallet connection",
      message: "How do I connect a wallet in a React app with @solana/kit?",
    },
  ],
  surfpool: [
    {
      label: "Surfpool cheatcodes",
      message: "How do Surfpool cheatcodes help me test against mainnet state?",
    },
  ],
};

/** The agent's docs topic facets (DocsMetadataInferer::topics), sorted. */
const TOPIC_NEEDLES: Array<[string, string[]]> = [
  ["accounts", ["account model", "accounts", "lamports", "owner", "rent"]],
  ["anchor", ["anchor", "anchor.toml", "anchor_lang"]],
  ["cpi", ["cross-program invocation", "cpi", "invoke_signed"]],
  ["fees", ["priority fee", "compute budget", "fee payer", "transaction fee"]],
  ["kit", ["@solana/kit", "createclient", "plugin client"]],
  ["pda", ["program derived address", "pda", "findprogramaddress"]],
  ["programs", ["program", "on-chain", "programs", "rust", "pinocchio"]],
  [
    "rpc",
    [
      "/rpc/http",
      "/rpc/websocket",
      "json-rpc",
      "getaccountinfo",
      "accountsubscribe",
    ],
  ],
  ["staking", ["stake", "staking", "validator", "delegation"]],
  ["surfpool", ["surfpool", "surfnet_"]],
  [
    "tokens",
    [
      "spl token",
      "token-2022",
      "mint account",
      "associated token",
      "transfer fee",
    ],
  ],
  [
    "transactions",
    ["transaction", "blockhash", "signature", "durable nonce", "confirmation"],
  ],
  ["wallets", ["wallet", "wallet standard", "signer", "seed phrase"]],
];

/**
 * The needles as patterns. Unlike the agent's substring match, a word
 * needle must start a word: "rent" in "current" or "different" tagged
 * nearly every page `accounts`, so every answer suggested rent exemption.
 */
const TOPIC_PATTERNS: Array<[string, RegExp[]]> = TOPIC_NEEDLES.map(
  ([topic, needles]) => [
    topic,
    needles.map(
      (needle) =>
        new RegExp(
          `${/^[a-z0-9]/.test(needle) ? "(?<![a-z0-9])" : ""}${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ),
    ),
  ],
);

/** A page's topics from its path and text, as the agent's index tags them. */
export function docTopics(haystack: string): string[] {
  const text = haystack.toLowerCase();
  return TOPIC_PATTERNS.filter(([, patterns]) =>
    patterns.some((pattern) => pattern.test(text)),
  ).map(([topic]) => topic);
}

/**
 * The Learn track in the docs navigation order (apps/docs/navigation),
 * for "Next lesson". Titles are the pages' own.
 */
export const LEARN_TRACK: Array<{ url: string; title: string }> = [
  { url: "/learn/getting-started", title: "Getting Started with Solana" },
  { url: "/learn/what-is-solana", title: "What is Solana?" },
  { url: "/learn/what-is-a-wallet", title: "What is a Wallet?" },
  {
    url: "/learn/understanding-solana-transaction-fees",
    title: "Understanding Solana Transaction Fees",
  },
  {
    url: "/learn/sending-and-receiving-sol",
    title: "Sending and Receiving SOL",
  },
  { url: "/learn/what-is-staking", title: "What is Staking?" },
  {
    url: "/learn/introduction-to-solana-tokens",
    title: "Introduction to Solana Tokens",
  },
  { url: "/learn/what-are-nfts", title: "What are NFTs?" },
  {
    url: "/learn/introduction-to-defi-on-solana",
    title: "Introduction to DeFi on Solana",
  },
  {
    url: "/learn/exploring-solana-applications",
    title: "Exploring Solana Applications",
  },
  { url: "/learn/staying-safe-on-solana", title: "Staying Safe on Solana" },
];

/** A site path without origin, locale, query, anchor or trailing slash. */
function sitePath(url: string): string {
  const path = url
    .trim()
    .replace(/^https:\/\/(?:www\.)?solana\.com(?=\/)/i, "")
    .split(/[?#]/)[0]!
    .replace(/\/+$/, "");
  return path.startsWith("/") ? path.replace(/^\/[a-z]{2}(?=\/)/, "") : "";
}

function nextLesson(
  citedUrls: string[],
): { label: string; message: string } | null {
  const paths = new Set(citedUrls.map(sitePath));
  let last = -1;
  LEARN_TRACK.forEach((lesson, index) => {
    if (paths.has(lesson.url)) last = index;
  });
  const next = last >= 0 ? LEARN_TRACK[last + 1] : undefined;
  return next
    ? {
        label: `Next lesson: ${next.title}`,
        message: `Teach me the next lesson: ${next.title}.`,
      }
    : null;
}

const SIMILARITY_STOP_WORDS = new Set([
  "how",
  "what",
  "why",
  "the",
  "and",
  "for",
  "does",
  "with",
  "work",
  "solana",
]);

function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(word)) return word;
  return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9@/-]+/)
        .filter((word) => word.length > 2 && !SIMILARITY_STOP_WORDS.has(word))
        .map(singular),
    ),
  ];
}

/** So the reader is never offered the question they just asked. */
function tooSimilar(suggestion: string, question: string): boolean {
  const suggested = tokens(suggestion);
  const asked = new Set(tokens(question));
  if (suggested.length === 0 || asked.size === 0) return false;
  const overlap = suggested.filter((word) => asked.has(word)).length;
  return overlap / suggested.length >= 0.6;
}

/**
 * A suggestion the answer's sources already cover: every word of its label
 * is in a cited page's title ("CPI privileges" after "CPI Execution and
 * Privileges").
 */
function namedBy(label: string, title: string): boolean {
  const words = tokens(label);
  const named = new Set(tokens(title));
  return words.length > 0 && words.every((word) => named.has(word));
}

export type FollowupPage = { url: string; title: string; topics: string[] };

/** Words in a page's path or title that name its topic, beyond the facets. */
const FOCUS_WORDS: Array<[string, RegExp]> = [
  ["tokens", /(?<![a-z0-9])(?:tokens?|mints?)(?![a-z0-9])/],
  ["transactions", /(?<![a-z0-9])fees?(?![a-z0-9])/],
  ["rpc", /(?<![a-z0-9])rpc(?![a-z0-9])/],
];

/**
 * What a page is about: the facets of its path, plus topic words in its
 * path or title. Nearly every page's text mentions accounts and programs,
 * so ranking by text facets alone put "Rent exemption" after every token
 * answer. (Titles skip the facets: "Program-derived addresses" is not
 * about programs.)
 */
function pageFocus(page: FollowupPage): string[] {
  const path = sitePath(page.url)
    .replace(/[/_-]+/g, " ")
    .toLowerCase();
  const named = `${path}\n${page.title.toLowerCase()}`;
  return [
    ...new Set([
      ...docTopics(path),
      ...FOCUS_WORDS.filter(([, word]) => word.test(named)).map(
        ([topic]) => topic,
      ),
    ]),
  ];
}

function isLesson(url: string): boolean {
  return sitePath(url).startsWith("/learn/");
}

/**
 * Up to three next questions, or null rather than filler. `pages` are the
 * docs the model was given, `citations` the ones the answer linked,
 * `topics` the question's own (its workflow route, an RPC method, the page
 * it was asked on), which come first.
 *
 * Unlike the agent: an answer whose best-ranked source is a Learn lesson
 * (a user's question: wallets, staking) is offered only the next lesson
 * and the other lessons it read, not developer questions; and a topic
 * question that repeats the title of a page the answer cites is skipped.
 */
export function suggestFollowups(options: {
  question: string;
  answer: string;
  pages: FollowupPage[];
  citations: Array<{ url: string; title?: string }>;
  topics?: string[];
}): SuggestedFollowupsWire | null {
  const { question, answer, pages, citations } = options;
  // Citations without pages: the links a guidance pack listed.
  if (!answer.trim() || (pages.length === 0 && citations.length === 0)) {
    return null;
  }
  const buttons: Array<{ label: string; message: string }> = [];
  const lesson = nextLesson(citations.map((citation) => citation.url));
  if (lesson) buttons.push(lesson);
  const learner = !!citations[0] && isLesson(citations[0].url);

  // Topics the cited pages are about first, then those of the pages read,
  // then by how many pages mention them; ties keep first-seen order.
  const tally = (lists: string[][]) => {
    const counts = new Map<string, number>();
    for (const topic of lists.flat()) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    return counts;
  };
  const pageTitles = new Map(
    pages.map((page) => [sitePath(page.url), page.title]),
  );
  const citedFocus = tally(
    citations.map(({ url }) =>
      pageFocus({
        url,
        title: pageTitles.get(sitePath(url)) ?? "",
        topics: [],
      }),
    ),
  );
  const focus = tally(pages.map(pageFocus));
  const counts = tally(pages.map((page) => page.topics));
  const asked = new Set(options.topics ?? []);
  const rank = (topic: string) => [
    asked.has(topic) ? 1 : 0,
    citedFocus.get(topic) ?? 0,
    focus.get(topic) ?? 0,
    counts.get(topic) ?? 0,
  ];
  const topics = [
    ...new Set([
      ...asked,
      ...counts.keys(),
      ...focus.keys(),
      ...citedFocus.keys(),
    ]),
  ]
    .sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      return (
        rb[0]! - ra[0]! || rb[1]! - ra[1]! || rb[2]! - ra[2]! || rb[3]! - ra[3]!
      );
    })
    .filter((topic) => Object.hasOwn(TOPIC_QUESTIONS, topic));
  const citedTitles = citations.map(
    ({ url, title }) => title ?? pageTitles.get(sitePath(url)) ?? "",
  );
  topicLoop: for (const topic of learner ? [] : topics) {
    for (const suggestion of TOPIC_QUESTIONS[topic]!) {
      if (buttons.length >= MAX_SUGGESTIONS) break topicLoop;
      if (tooSimilar(suggestion.message, question)) continue;
      if (citedTitles.some((title) => namedBy(suggestion.label, title))) {
        continue;
      }
      buttons.push(suggestion);
    }
  }

  // Pages the model read but the answer did not cite: adjacent reading.
  const cited = citations.map((citation) => citation.url.toLowerCase());
  const lowerAnswer = answer.toLowerCase();
  const titles = new Set<string>();
  for (const page of pages) {
    if (buttons.length >= MAX_SUGGESTIONS) break;
    if (learner && !isLesson(page.url)) continue;
    const url = page.url.toLowerCase();
    const title = page.title.trim();
    if (!title || lowerAnswer.includes(url)) continue;
    if (cited.some((citedUrl) => citedUrl.includes(url))) continue;
    if (titles.has(title.toLowerCase())) continue;
    titles.add(title.toLowerCase());
    buttons.push({ label: title, message: `Tell me more about ${title}.` });
  }

  const seen = new Set<string>();
  const unique = buttons
    .filter((button) => {
      const key = button.message.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS)
    .map((button) => ({ type: "ask" as const, ...button }));
  return unique.length > 0
    ? { prompt: SUGGESTED_FOLLOWUPS_PROMPT, buttons: unique }
    : null;
}
