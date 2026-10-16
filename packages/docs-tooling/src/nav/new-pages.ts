/**
 * NEW pages the IA needs (spec §6.1, decisions.md). WP6 creates a stub for
 * each one (title + TODO) so navigation validates; WP8a replaces the body.
 *
 * Paths follow spec §6.1 exactly. A stub carries `stub: wp8a` in its
 * frontmatter so `nav verify` can list the pages still to be written. Stubs
 * are never overwritten: `nav stubs` only creates missing files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { docsRoot } from "../lib/paths.ts";
import { formatFiles } from "./format.ts";
import type { NavPage } from "./types.ts";

export type NewPageKind =
  | "hub"
  | "path-intro"
  | "path-step"
  | "concept"
  | "research"
  | "nav-stub";

export interface NewPage {
  page: NavPage;
  title: string;
  /** Sidebar label when it differs from the title. */
  sidebarTitle?: string;
  description: string;
  kind: NewPageKind;
  /** What WP8a writes here (from spec §6.1 / the mockup). */
  brief: string;
  /** Extra frontmatter for nav-only stubs (e.g. an external `url`). */
  frontmatter?: Record<string, string>;
}

const path1 = (base: string, steps: [string, string, string][]): NewPage[] =>
  steps.map(([slug, title, brief]) => ({
    page: `${base}/${slug}`,
    title,
    description: "TODO(WP8a)",
    kind: "path-step" as const,
    brief,
  }));

export const NEW_PAGES: readonly NewPage[] = [
  // Start here
  {
    page: "docs/from-ethereum",
    title: "Coming from Ethereum",
    description:
      "How EVM concepts map onto Solana: accounts vs contract storage, programs vs contracts, fees and finality.",
    kind: "hub",
    brief:
      "Coming from Ethereum; link to /developers/migrate-to-solana/ethereum.",
  },
  // Payments. The pay-per-call hub (docs/payments/pay-per-call) was merged
  // into docs/payments/agentic-payments/index, an existing page
  // (migration/dup-audit.md #4).
  {
    page: "docs/payments/checkout",
    title: "Accept dollar payments that settle in seconds",
    sidebarTitle: "Build a checkout",
    description: "TODO(WP8a)",
    kind: "path-intro",
    brief: "Path 1 intro: fit check, time (~30 min), stepper-0.",
  },
  ...path1("docs/payments/checkout", [
    ["try-it", "Pay as a customer", "Step 1 (stepper-1)."],
    ["browser", "Build the checkout in your browser", "Step 2."],
    ["backend", "Confirm payments from your backend", "Step 3."],
    ["go-live", "Go live", "Step 4."],
  ]),
  {
    page: "docs/payments/paywall-api",
    title: "Charge a few cents per API call",
    sidebarTitle: "Paywall an endpoint",
    description: "TODO(WP8a)",
    kind: "path-intro",
    brief: "Path 2 intro: fit check, time (~30 min), stepper-0.",
  },
  ...path1("docs/payments/paywall-api", [
    ["try-it", "Call a paid API", "Step 1."],
    ["browser", "Paywall an endpoint in your browser", "Step 2."],
    ["server", "Add it to your server", "Step 3."],
    ["go-live", "Go live", "Step 4."],
  ]),
  // Assets
  {
    page: "docs/assets/index",
    title: "Assets",
    description:
      "Create and manage tokens: tokenized funds and securities, stablecoins, points, NFTs and game items.",
    kind: "hub",
    brief: "Assets hub.",
  },
  {
    page: "docs/assets/issue-asset",
    title: "Issue a tokenized asset with compliance controls",
    sidebarTitle: "Issue an asset",
    description: "TODO(WP8a)",
    kind: "path-intro",
    brief: "Path 3 intro: fit check, time (~45 min), stepper-0.",
  },
  ...path1("docs/assets/issue-asset", [
    ["try-it", "Hold a restricted asset", "Step 1."],
    ["browser", "Create the asset in your browser", "Step 2."],
    ["local", "Run it from your machine", "Step 3."],
    ["go-live", "Go live", "Step 4."],
  ]),
  {
    page: "docs/assets/games",
    title: "Let players own items across games",
    sidebarTitle: "Let players own items",
    description: "Mint an item to a player and read it from a second app.",
    kind: "hub",
    brief: "Wave 2 placeholder; link cookbook/games and tokens/metaplex.",
  },
  // How Solana works (new concept pages)
  {
    page: "docs/core/wallets",
    title: "Wallets & signatures",
    description: "TODO(WP8a)",
    kind: "concept",
    brief: "Concept page `wallet`; In short from concepts.en.json.",
  },
  {
    page: "docs/core/rent",
    title: "Rent (storage deposit)",
    sidebarTitle: "Rent",
    description: "TODO(WP8a)",
    kind: "concept",
    brief: "Concept page `rent` (today core/accounts#rent).",
  },
  {
    page: "docs/core/transactions/confirmation",
    title: "Confirmation & finality",
    description: "TODO(WP8a)",
    kind: "concept",
    brief: "Concept page `commitment`.",
  },
  {
    page: "docs/core/fees/fee-sponsorship",
    title: "Fee sponsorship",
    description: "TODO(WP8a)",
    kind: "concept",
    brief: "Concept page `sponsorship`; links tools/kora.",
  },
  // Resources
  {
    page: "docs/programs/index",
    title: "Write onchain programs",
    sidebarTitle: "Overview",
    description:
      "When existing programs aren't enough, write your own: Rust, Anchor, testing and deploying.",
    kind: "hub",
    brief: "Programs hub (the folder had no index). Linked from Start here.",
  },
  {
    page: "docs/programs/anchor",
    title: "Anchor framework",
    description: "TODO(WP8a)",
    kind: "hub",
    brief: "Short overview; link anchor-lang.com and programs/anchor-events.",
  },
  {
    page: "docs/tools/microscope",
    title: "Microscope",
    description: "Inspect accounts and transactions with Microscope.",
    kind: "nav-stub",
    brief:
      "Nav-only stub: `url` frontmatter makes the sidebar entry link to /microscope (an apps/web page). Not a WP8a writing task.",
    frontmatter: { url: "https://solana.com/microscope" },
  },
];

export const NEW_PAGE_SET: ReadonlySet<NavPage> = new Set(
  NEW_PAGES.map((p) => p.page),
);

const yamlString = (s: string) => JSON.stringify(s);

export function stubSource(p: NewPage): string {
  const fm: string[] = [
    `title: ${yamlString(p.title)}`,
    ...(p.sidebarTitle ? [`sidebarTitle: ${yamlString(p.sidebarTitle)}`] : []),
    `description: ${yamlString(p.description)}`,
    ...Object.entries(p.frontmatter ?? {}).map(
      ([k, v]) => `${k}: ${yamlString(v)}`,
    ),
    ...(p.kind === "nav-stub" ? [] : ["noindex: true", "stub: wp8a"]),
  ];
  const body =
    p.kind === "nav-stub"
      ? `{/* Navigation stub created by WP6 (docs-tooling nav stubs). ${p.brief} */}\n\nMicroscope lives at [solana.com/microscope](https://solana.com/microscope).\n`
      : `{/* TODO(WP8a): ${p.brief} Stub created by WP6 so navigation validates; replace this body and drop the \`stub\` and \`noindex\` keys. */}\n\n<Note>This page is being written.</Note>\n`;
  return `---\n${fm.join("\n")}\n---\n\n${body}`;
}

/** Create missing stub files. Never overwrites. Returns created paths. */
export function writeStubs(root: string = docsRoot): string[] {
  const created: string[] = [];
  for (const p of NEW_PAGES) {
    const candidates = [`${p.page}.mdx`, `${p.page}.md`];
    if (p.page.endsWith("/index"))
      candidates.push(`${p.page.replace(/\/index$/, "")}.mdx`);
    else candidates.push(`${p.page}/index.mdx`);
    if (candidates.some((c) => existsSync(path.join(root, c)))) continue;
    const file = path.join(root, `${p.page}.mdx`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, stubSource(p));
    created.push(path.relative(root, file));
  }
  formatFiles(created.map((c) => path.join(root, c)));
  return created;
}

/** New pages whose file is still a WP6 stub (frontmatter `stub: wp8a`). */
export function remainingStubs(root: string = docsRoot): NavPage[] {
  return NEW_PAGES.filter((p) => {
    const file = path.join(root, `${p.page}.mdx`);
    if (!existsSync(file)) return false;
    const head = readFileSync(file, "utf8").slice(0, 2000);
    return /^stub:\s*wp8a\s*$/m.test(head);
  }).map((p) => p.page);
}
