/**
 * The new English IA (spec §2.2 as amended by decisions.md), in template
 * form. `compile-legacy-nav` turns it into apps/docs/navigation/en.json by
 * replacing every `{ expand: P }` with the ordered subtree of the legacy
 * meta.json under P. After that one-time compile, en.json is the source of
 * truth and is edited by hand; this file is kept only so the compile can be
 * reproduced and reviewed.
 *
 * Sources: site-src/content.mjs `tabs` + `sidebars` (the mockup) and
 * docs-nav-research.md Revision 3, mapped onto existing page URLs (spec D4:
 * existing pages keep their URLs; only NEW pages get the mockup's URLs).
 *
 * Group labels never repeat their tab name or another tab's group name
 * (the first group of a tab is "<topic> basics"/"Get started", the overview
 * page's sidebarTitle is "Overview"), so breadcrumbs never read
 * "Payments > Payments". The Kora "Guides" subgroup comes from the legacy
 * meta.json and was renamed to "Kora guides" in en.json by hand.
 *
 * Deviations from spec §2.2, each forced by decisions.md:
 * - Video tutorials is an external-link tab on the right (`href`,
 *   `align: "end"`) pointing at the Mintlify-served
 *   https://solana.com/docs/video-guides. A tab
 *   with `href` has no sidebar, so the video guides and the Developer
 *   Bootcamp live in Resources (Stripe keeps learning material in Developer
 *   resources too), and the tab link lands there.
 * - Greek is dropped, so there is no `el` branch.
 */
import type { TemplateTab } from "./types.ts";

const x = (expand: string) => ({ expand });

export const IA_TEMPLATE: TemplateTab[] = [
  {
    tab: "Start here",
    icon: "house",
    groups: [
      {
        group: "Get started",
        pages: [
          "docs/index",
          "docs/finance/index", // sidebarTitle: All use cases
          "docs/from-ethereum",
        ],
      },
      { group: "About these docs", pages: ["docs/research"] },
    ],
  },

  {
    tab: "Payments",
    icon: "credit-card",
    groups: [
      {
        group: "Payment basics",
        pages: [
          "docs/payments/index",
          "docs/payments/how-payments-work",
          "docs/payments/interacting-with-solana",
        ],
      },
      {
        group: "Payment tutorials",
        pages: [
          {
            group: "Build a checkout",
            root: "docs/payments/checkout",
            tag: "~30 min",
            expanded: true,
            pages: [
              "docs/payments/checkout/try-it",
              "docs/payments/checkout/browser",
              "docs/payments/checkout/backend",
              "docs/payments/checkout/go-live",
            ],
          },
          {
            group: "Paywall an endpoint",
            root: "docs/payments/paywall-api",
            tag: "~30 min",
            expanded: true,
            pages: [
              "docs/payments/paywall-api/try-it",
              "docs/payments/paywall-api/browser",
              "docs/payments/paywall-api/server",
              "docs/payments/paywall-api/go-live",
            ],
          },
          "docs/payments/quickstart",
        ],
      },
      {
        group: "Payment guides",
        pages: [
          {
            group: "Send payments",
            root: "docs/payments/send-payments/index",
            pages: [
              "docs/payments/send-payments/basic-payment",
              "docs/payments/send-payments/payment-with-memo",
              "docs/payments/send-payments/verify-address",
              {
                group: "Payment processing",
                root: "docs/payments/send-payments/payment-processing/index",
                pages: [
                  "docs/payments/send-payments/payment-processing/fee-abstraction",
                ],
              },
            ],
          },
          {
            group: "Accept payments",
            root: "docs/payments/accept-payments/index",
            pages: [
              "docs/payments/accept-payments/solana-pay",
              "docs/payments/accept-payments/verification-tools",
              "docs/payments/accept-payments/indexing",
            ],
          },
          {
            group: "Subscriptions",
            root: "docs/payments/subscriptions/overview",
            pages: [x("docs/payments/subscriptions")],
          },
          // sidebarTitle: Payouts & disbursements
          "docs/payments/send-payments/payment-processing/batch-payments",
          {
            group: "Pay-per-call & agents",
            root: "docs/payments/pay-per-call",
            labelFrom: "none",
            pages: [
              {
                group: "How x402 works",
                root: "docs/payments/agentic-payments/x402/index",
                labelFrom: "none",
                pages: [x("docs/payments/agentic-payments/x402")],
              },
              "docs/payments/agentic-payments/index",
              "docs/payments/agentic-payments/mpp",
              "docs/payments/pay-sh",
            ],
          },
          "docs/finance/privacy", // sidebarTitle: Private payments
          {
            group: "Advanced payments",
            labelFrom: "none",
            pages: [
              "docs/payments/advanced-payments/deferred-execution",
              "docs/payments/advanced-payments/spend-permissions",
            ],
          },
        ],
      },
      {
        group: "Tools",
        pages: [
          "docs/payments/developer-tools",
          {
            group: "Commerce Kit",
            root: "docs/tools/commerce-kit/index",
            pages: [x("docs/tools/commerce-kit/quickstart")],
          },
          {
            group: "Kora (fee sponsorship)",
            root: "docs/tools/kora/index",
            labelFrom: "none",
            pages: [x("docs/tools/kora")],
          },
          {
            group: "Solana Pay",
            root: "docs/tools/solana-pay/index",
            pages: [x("docs/tools/solana-pay")],
          },
          "docs/tools/x402-facilitator",
        ],
      },
    ],
  },

  {
    tab: "Assets",
    icon: "layers",
    groups: [
      {
        group: "Asset basics",
        labelFrom: "none",
        pages: ["docs/assets/index"],
      },
      {
        group: "Asset tutorials",
        pages: [
          {
            group: "Issue an asset",
            root: "docs/assets/issue-asset",
            tag: "~45 min",
            expanded: true,
            pages: [
              "docs/assets/issue-asset/try-it",
              "docs/assets/issue-asset/browser",
              "docs/assets/issue-asset/local",
              "docs/assets/issue-asset/go-live",
            ],
          },
          "docs/tokenization/quickstart",
        ],
      },
      {
        group: "Tokenization",
        labelFrom: "meta:docs/tokenization",
        pages: [
          "docs/tokenization/index",
          "docs/tokenization/token-acl",
          {
            group: "KYC with Attestations",
            root: "docs/tools/attestations/index",
            labelFrom: "none",
            pages: [x("docs/tools/attestations")],
          },
          "docs/tokenization/nav-strikes",
        ],
      },
      {
        group: "Tokens",
        labelFrom: "message:tokenization",
        pages: [
          "docs/tokens/index",
          "docs/tokens/quickstart",
          {
            group: "Token basics",
            root: "docs/tokens/basics/index",
            labelFrom: "meta:docs/tokens/basics",
            pages: [x("docs/tokens/basics")],
          },
          {
            group: "Token extensions",
            root: "docs/tokens/extensions/index",
            labelFrom: "meta:docs/tokens/extensions",
            pages: [x("docs/tokens/extensions")],
          },
          {
            group: "Advanced tokens",
            root: "docs/tokens/advanced/index",
            pages: [x("docs/tokens/advanced")],
          },
          "docs/tokens/how-to-verify-a-token",
        ],
      },
      {
        group: "NFTs & game items",
        pages: ["docs/tokens/metaplex", "docs/assets/games"],
      },
    ],
  },

  {
    tab: "Markets",
    icon: "chart-line",
    groups: [
      {
        group: "Market basics",
        labelFrom: "meta:docs/defi",
        pages: ["docs/defi/index"],
      },
      {
        group: "Trading guides",
        pages: [
          "docs/defi/exchange",
          {
            group: "Delivery vs payment",
            root: "docs/tokenization/dvp",
            labelFrom: "none",
            pages: ["docs/defi/dvp-program/index", x("docs/defi/dvp-program")],
          },
          "docs/defi/mev-protection",
          "docs/defi/stake-weighted-qos",
        ],
      },
    ],
  },

  {
    tab: "How Solana works",
    icon: "box",
    groups: [
      { group: "Introduction", pages: ["docs/core/index"] },
      {
        group: "The basics",
        pages: [
          "docs/core/wallets",
          {
            group: "Accounts",
            root: "docs/core/accounts/index",
            pages: [x("docs/core/accounts")],
          },
          {
            group: "Transactions",
            root: "docs/core/transactions/index",
            pages: [
              x("docs/core/transactions"),
              "docs/core/transactions/confirmation",
            ],
          },
          "docs/references/clusters",
        ],
      },
      {
        group: "Costs & speed",
        pages: [
          {
            group: "Fees",
            root: "docs/core/fees/index",
            pages: [x("docs/core/fees"), "docs/core/fees/fee-sponsorship"],
          },
          "docs/core/rent",
        ],
      },
      {
        group: "Building",
        pages: [
          {
            group: "Programs",
            root: "docs/core/programs/index",
            pages: [x("docs/core/programs")],
          },
          {
            group: "Instructions",
            root: "docs/core/instructions/index",
            pages: [x("docs/core/instructions")],
          },
          {
            group: "Program-derived addresses",
            root: "docs/core/pda/index",
            labelFrom: "meta:docs/core/pda",
            pages: [x("docs/core/pda")],
          },
          {
            group: "Cross-program calls",
            root: "docs/core/cpi/index",
            labelFrom: "meta:docs/core/cpi",
            pages: [x("docs/core/cpi")],
          },
        ],
      },
      {
        group: "Staking",
        pages: ["docs/references/staking/index", x("docs/references/staking")],
      },
      {
        group: "Glossary",
        labelFrom: "message:terminology",
        pages: ["docs/references/terminology"],
      },
    ],
  },

  {
    tab: "Resources",
    icon: "wrench",
    groups: [
      { group: "Browse resources", pages: ["docs/tools/index"] },
      {
        group: "Set up",
        pages: [
          "docs/intro/coding-with-agents",
          {
            group: "Set up your machine",
            root: "docs/intro/installation/index",
            labelFrom: "meta:docs/intro/installation",
            pages: [
              "docs/intro/installation/dependencies",
              "docs/intro/installation/solana-cli-basics",
              "docs/intro/installation/anchor-cli-basics",
              "docs/intro/installation/surfpool-cli-basics",
            ],
          },
        ],
      },
      {
        group: "Write programs",
        labelFrom: "meta:docs/core/programs",
        pages: [
          "docs/programs/index",
          {
            group: "First program in the browser",
            root: "docs/intro/quick-start/index",
            labelFrom: "none",
            pages: [x("docs/intro/quick-start")],
          },
          {
            group: "Rust programs",
            root: "docs/programs/rust/index",
            pages: [x("docs/programs/rust")],
          },
          {
            group: "Anchor framework",
            root: "docs/programs/anchor",
            labelFrom: "none",
            pages: ["docs/programs/anchor-events"],
          },
          {
            group: "Testing programs",
            labelFrom: "meta:docs/programs/testing",
            pages: [x("docs/programs/testing")],
          },
          {
            group: "Deploying",
            root: "docs/programs/deploying",
            labelFrom: "none",
            pages: ["docs/programs/verified-builds"],
          },
          {
            group: "IDLs & Codama clients",
            root: "docs/programs/idls",
            labelFrom: "none",
            pages: [x("docs/programs/codama")],
          },
          "docs/programs/examples",
          "docs/programs/limitations",
        ],
      },
      {
        group: "Build apps",
        pages: [
          {
            group: "React & Next.js",
            root: "docs/frontend/index",
            labelFrom: "meta:docs/frontend",
            pages: [x("docs/frontend")],
          },
          {
            group: "Developer tools",
            labelFrom: "none",
            pages: [
              {
                group: "Surfpool",
                root: "docs/tools/surfpool/index",
                pages: [x("docs/tools/surfpool")],
              },
              {
                group: "LiteSVM",
                root: "docs/tools/litesvm/index",
                pages: [x("docs/tools/litesvm")],
              },
              "docs/tools/microscope",
              {
                group: "Keychain",
                root: "docs/tools/keychain/index",
                pages: [x("docs/tools/keychain")],
              },
              {
                group: "Private Channels",
                root: "docs/tools/private-channels/index",
                pages: [x("docs/tools/private-channels")],
              },
              "docs/tools/actions",
            ],
          },
        ],
      },
      { group: "Ship", pages: ["docs/tools/production-readiness"] },
      {
        group: "Cookbook",
        labelFrom: "message:cookbook",
        pages: ["developers/cookbook/index", x("developers/cookbook")],
      },
      {
        group: "Videos",
        labelFrom: "message:videoTutorials",
        pages: [
          "docs/video-guides/index",
          {
            group: "Foundations",
            labelFrom: "meta:developers/bootcamp/foundations",
            pages: [
              "docs/video-guides/solana-crash-course",
              "docs/video-guides/2026-developer-bootcamp",
            ],
          },
          {
            group: "Payments",
            labelFrom: "message:payments",
            pages: [
              "docs/video-guides/agent-payments",
              "docs/video-guides/pay-sh-video-tutorials",
            ],
          },
          {
            group: "Privacy",
            pages: ["docs/video-guides/confidential-balances"],
          },
          {
            group: "Hardware & DePIN",
            pages: ["docs/video-guides/building-depin-projects"],
          },
        ],
      },
      {
        group: "Developer Bootcamp",
        labelFrom: "meta:developers/bootcamp",
        pages: ["developers/bootcamp/index", x("developers/bootcamp")],
      },
    ],
  },

  {
    tab: "API",
    icon: "book",
    groups: [
      {
        group: "RPC methods",
        labelFrom: "meta:docs/rpc",
        pages: [
          "docs/rpc/index",
          "docs/rpc/providers",
          "docs/rpc/json-structures",
          {
            group: "HTTP methods",
            root: "docs/rpc/http/index",
            pages: [x("docs/rpc/http")],
          },
          {
            group: "WebSocket methods",
            root: "docs/rpc/websocket/index",
            pages: [x("docs/rpc/websocket")],
          },
          {
            group: "Removed methods",
            root: "docs/rpc/deprecated/index",
            expanded: false,
            pages: [x("docs/rpc/deprecated")],
          },
        ],
      },
      {
        group: "SDKs",
        labelFrom: "meta:docs/clients",
        pages: [
          "docs/clients/index",
          "docs/clients/official/javascript",
          "docs/clients/official/rust",
          {
            group: "Python & community",
            labelFrom: "meta:docs/clients/community",
            pages: [x("docs/clients/community")],
          },
        ],
      },
      {
        group: "CLI reference",
        pages: ["docs/references/solana-cli", "docs/references/spl-token-cli"],
      },
      {
        group: "Network constants",
        pages: ["docs/core/constants-reference"],
      },
    ],
  },

  // External-link tab on the right (decisions.md). The pages are served by
  // this Mintlify project behind the solana.com proxy. The URL is absolute:
  // Mintlify renders a relative tab href as "/" (checked with mint dev), and
  // styles/theme.css (WP11) styles external tabs by `href^="http"`. The
  // locale builder rewrites it to /<loc>/docs/video-guides once translated.
  {
    tab: "Video tutorials",
    icon: "play",
    href: "https://solana.com/docs/video-guides",
    align: "end",
    labelFrom: "message:videoTutorials",
  },

  // Hidden tabs: published, reachable, not in the tab bar.
  {
    tab: "Learn",
    hidden: true,
    searchable: true,
    groups: [
      {
        group: "Learn",
        pages: [
          // order: packages/docs-tooling/data/learn/learn-tutorials.ts
          // (tutorialOrder), after the getting-started intro
          "learn/getting-started",
          "learn/what-is-solana",
          "learn/what-is-a-wallet",
          "learn/understanding-solana-transaction-fees",
          "learn/sending-and-receiving-sol",
          "learn/what-is-staking",
          "learn/introduction-to-solana-tokens",
          "learn/what-are-nfts",
          "learn/introduction-to-defi-on-solana",
          "learn/exploring-solana-applications",
          "learn/staying-safe-on-solana",
        ],
      },
    ],
  },
  {
    tab: "Hidden",
    hidden: true,
    groups: [
      // Indexed: the URL stays live (spec §5.3).
      {
        group: "Documentation tags",
        searchable: true,
        pages: ["docs/tags/index"],
      },
      // Not searchable: apps/web redirects /docs/tools/ai to
      // /docs/intro/coding-with-agents, so the page is shadowed. WP8 merges it
      // and deletes the file (spec §2.2 notes).
      { group: "Pending merge", pages: ["docs/tools/ai"] },
    ],
  },
];
