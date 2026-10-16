/**
 * Data for the /developers landing (apps/web/src/app/[locale]/developers).
 *
 * Copy lives in `developers.landing` (packages/i18n/messages/web/en/common.json).
 * This file holds destinations, durations, and every number the page shows,
 * each with a source and a retrieval date. `hub.test.ts` fails when a stat's
 * `retrievedAt` is more than STAT_MAX_AGE_DAYS old, so the figures get
 * re-checked at least twice a year.
 */

/** Job paths. `href` points at the path intro page in the Mintlify docs. */
export const JOB_PATHS = [
  {
    id: "payments",
    href: "/developers/docs/payments/checkout",
    firstResult: "5 min",
    total: "30 min",
  },
  {
    id: "payPerCall",
    href: "/developers/docs/payments/paywall-api",
    firstResult: "5 min",
    total: "30 min",
  },
  {
    id: "asset",
    href: "/developers/docs/assets/issue-asset",
    firstResult: "10 min",
    total: "45 min",
  },
  {
    id: "trade",
    href: "/developers/docs/defi/settle-trade",
    firstResult: "10 min",
    total: "40 min",
  },
] as const;

export type JobPathId = (typeof JOB_PATHS)[number]["id"];

/** Secondary use-case links under the job picker. */
export const MORE_USE_CASES = [
  { id: "markets", href: "/developers/docs/defi" },
  { id: "games", href: "/developers/docs/assets/games" },
  { id: "agents", href: "/developers/docs/payments/agentic-payments" },
  { id: "programs", href: "/developers/docs/programs" },
] as const;

/**
 * Prefix docs-owned paths with the locale. Mintlify serves /<loc>/developers/docs/* and
 * /<loc>/developers/{bootcamp,cookbook}/*; templates and hash links stay
 * unprefixed.
 */
export function localizedHref(locale: string, href: string): string {
  if (locale === "en" || !href.startsWith("/")) return href;
  if (href.startsWith("/developers/templates")) return href;
  return `/${locale}${href}`;
}

export const HERO_LINKS = {
  picker: "#picker",
  docs: "/developers/docs",
} as const;

/**
 * "Set up in one command" hero card: two tabs, "With your AI agent"
 * (`allAgentsCommand`, then a link to Build with AI agents for per-agent
 * setup) and "Install manually" (`INSTALL_SETUP`). The MCP server URL and
 * the per-agent commands are copied verbatim from https://mcp.solana.com
 * (checked 2026-10-15). The Build with AI agents page
 * (apps/docs/developers/docs/intro/coding-with-agents.mdx) shows the same
 * commands; hub-data.test.ts fails when the two drift apart.
 */
export const MCP_SERVER_URL = "https://mcp.solana.com/mcp";

export const AGENT_SETUP = {
  serverUrl: MCP_SERVER_URL,
  /** add-mcp detects the coding agents in use and adds the server to each. */
  allAgentsCommand: `npx add-mcp ${MCP_SERVER_URL} -n solana-mcp -g -y`,
  /** Per-agent commands, shown on the Build with AI agents page. */
  clients: [
    {
      id: "claudeCode",
      name: "Claude Code",
      command: `claude mcp add --transport http solana-mcp ${MCP_SERVER_URL}`,
    },
    {
      id: "codex",
      name: "Codex",
      command: `codex mcp add solana-mcp --url ${MCP_SERVER_URL}`,
    },
  ],
  /** Per-agent setup, including Cursor, VS Code, and Windsurf. */
  moreHref: "/developers/docs/intro/coding-with-agents",
} as const;

/**
 * The line a reader pastes into their coding agent, as on the docs' Start
 * here banner. The guide is an agents-only page (developers/docs/intro/
 * agent-setup.mdx) served as Markdown.
 */
export const AGENT_PROMPT = {
  origin: "https://solana.com",
  guidePath: "/developers/docs/intro/agent-setup.md",
  line: (origin: string) =>
    `Set up Solana for me: fetch and follow this guide ${origin}/developers/docs/intro/agent-setup.md`,
} as const;

/**
 * The one-line installer (Rust, Solana CLI, Anchor, Surfpool, Node.js, and
 * Yarn), as on the Quick installation page.
 */
export const INSTALL_SETUP = {
  command:
    "curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash",
  href: "/developers/docs/intro/installation",
} as const;

/** "Other ways to learn" cards. */
export const LEARN_ROUTES = [
  { id: "docs", href: "/developers/docs" },
  { id: "bootcamp", href: "/developers/bootcamp" },
  { id: "templates", href: "/developers/templates" },
  { id: "cookbook", href: "/developers/cookbook" },
] as const;

export type LearnRouteId = (typeof LEARN_ROUTES)[number]["id"];

/** The four "Why Solana" benefit lines (copy in developers.landing.why.reasons). */
export const WHY_REASONS = [
  "speed",
  "cost",
  "compliance",
  "oneNetwork",
] as const;

/**
 * Companies named under "In production at". Product-owner approved list from
 * the redesign mockup. Names only, no logos.
 */
export const PRODUCTION_USERS = [
  "Visa",
  "Stripe",
  "PayPal",
  "Western Union",
  "Worldpay",
] as const;

export type StatSource = { name: string; url: string };

export type HubStat = {
  id: string;
  /** Numeric value, formatted per locale with Intl.NumberFormat. */
  value: number;
  /** How to format `value`. */
  format: "usd-compact" | "compact" | "integer";
  /** Text appended after the formatted number (e.g. "+"). */
  suffix?: string;
  /** Key under developers.landing.why.stats.<id> holding `label` and `note`. */
  labelKey: string;
  source: StatSource;
  /** When the figure was last checked against the source (YYYY-MM-DD). */
  retrievedAt: string;
  /** Date or period the figure describes, as stated by the source. */
  asOf: string;
  note?: string;
};

/** Stats older than this (by retrievedAt) fail the unit test. */
export const STAT_MAX_AGE_DAYS = 180;

export const HUB_STATS: readonly HubStat[] = [
  {
    id: "stablecoinSupply",
    value: 16_700_000_000,
    format: "usd-compact",
    labelKey: "stablecoinSupply",
    source: {
      name: "Solana Compass",
      url: "https://solanacompass.com/news/solana-stablecoin-supply-reaches-167b-growing-11x-in-three-years-to-rank-third-globally",
    },
    retrievedAt: "2026-10-13",
    asOf: "2026-08-09",
    note: "Source: “As of August 9, 2026, that figure stands at $16.7 billion.”",
  },
  {
    id: "stablecoinVolume",
    value: 650_000_000_000,
    format: "usd-compact",
    suffix: "+",
    labelKey: "stablecoinVolume",
    source: {
      name: "stake.fish",
      url: "https://blog.stake.fish/the-state-of-solana-in-2026/",
    },
    retrievedAt: "2026-10-13",
    asOf: "2026-02",
    note: "Source: “$650B+” in stablecoin transactions during February 2026 (published 2026-04-21).",
  },
  {
    id: "dailyTransactions",
    value: 120_000_000,
    format: "compact",
    labelKey: "dailyTransactions",
    source: {
      name: "Crypto Briefing",
      url: "https://cryptobriefing.com/solana-14-billion-transactions-q3-2026/",
    },
    retrievedAt: "2026-10-13",
    asOf: "2026-Q3",
    note: "Source: “Average daily transactions came in at 120 million” for Q3 2026 (published 2026-10-01).",
  },
  {
    id: "uptime",
    value: 30,
    format: "integer",
    suffix: "+",
    labelKey: "uptime",
    source: {
      name: "Crypto Briefing",
      url: "https://cryptobriefing.com/solana-100-percent-uptime-30-months/",
    },
    retrievedAt: "2026-10-13",
    asOf: "2026-08-10",
    note: "Source: 30 consecutive months without a network-wide outage; last outage 2024-02-06 (published 2026-08-10).",
  },
] as const;

/**
 * Inputs for the cost calculator. Card pricing is Stripe's published standard
 * rate for domestic cards; the Solana figure is the ~5,000-lamport base fee
 * per signature converted at a rounded SOL price, matching the "about $0.001"
 * used across the page.
 */
export const COST_MODEL = {
  card: {
    percent: 0.029,
    fixedUsd: 0.3,
    source: { name: "Stripe pricing", url: "https://stripe.com/pricing" },
  },
  solana: {
    feeUsd: 0.001,
    source: {
      name: "Solana docs: fees",
      url: "/developers/docs/core/fees",
    },
  },
  retrievedAt: "2026-10-13",
  defaults: { paymentsPerMonth: 10_000, averagePaymentUsd: 20 },
  /** Volumes shown in the static (no-JS) comparison table. */
  tableVolumes: [1_000, 10_000, 100_000],
  slider: {
    /** Payments slider is log-scaled from 100 to 1,000,000. */
    payments: { min: 0, max: 100, defaultPosition: 50 },
    average: { min: 1, max: 500 },
  },
} as const;

export type CostBreakdown = { card: number; solana: number; savings: number };

/** Rounds to cents, dropping binary floating-point noise. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rounds a dollar amount the way `formatUsd` displays it: whole dollars from
 * $100 up, cents below.
 */
export function roundUsd(value: number): number {
  return value >= 100 ? Math.round(value) : toCents(value);
}

/**
 * Monthly costs, each rounded as displayed. The saving is the difference of
 * the two rounded figures, so the three numbers on the page always add up.
 */
export function computeCosts(
  paymentsPerMonth: number,
  averagePaymentUsd: number,
): CostBreakdown {
  const card = roundUsd(
    paymentsPerMonth *
      (averagePaymentUsd * COST_MODEL.card.percent + COST_MODEL.card.fixedUsd),
  );
  const solana = roundUsd(paymentsPerMonth * COST_MODEL.solana.feeUsd);
  return { card, solana, savings: toCents(card - solana) };
}

/** Maps a 0–100 slider position to 100…1,000,000 payments (log scale). */
export function paymentsFromSliderPosition(position: number): number {
  return Math.round(10 ** (2 + (position / 100) * 4) / 10) * 10;
}

/**
 * Whole dollars from $100 up, cents below. An amount of $100 or more that
 * still has cents (a saving: whole-dollar card cost minus a cents-precise
 * Solana cost) keeps them, so it is never rounded a second time.
 */
export function formatUsd(value: number, locale: string): string {
  const digits = value >= 100 && Number.isInteger(toCents(value)) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatStatValue(stat: HubStat, locale: string): string {
  let formatted: string;
  switch (stat.format) {
    case "usd-compact":
      formatted = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(stat.value);
      break;
    case "compact":
      formatted = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(stat.value);
      break;
    default:
      formatted = formatInteger(stat.value, locale);
  }
  return `${formatted}${stat.suffix ?? ""}`;
}

/**
 * Formats a stat's `asOf` ("YYYY-MM-DD", "YYYY-MM", or "YYYY-Qn") for display.
 */
export function formatAsOf(asOf: string, locale: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(asOf);
  if (quarter) return `Q${quarter[2]} ${quarter[1]}`;
  if (/^\d{4}-\d{2}$/.test(asOf)) {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${asOf}-01T00:00:00Z`));
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${asOf}T00:00:00Z`));
}

/** Newsletter list used by the developer hub since the docs-app version. */
export const DEVELOPER_NEWSLETTER_FORM_ID =
  "f1bc79b9-a1cd-463a-8c2c-e761b2fa108d";
