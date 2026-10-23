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
 * - Video tutorials is a regular tab on the right (`align: "end"`) whose
 *   sidebar holds the video guides; the Developer Bootcamp stays in
 *   Resources.
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
          "developers/docs/index",
          "developers/docs/finance/index", // sidebarTitle: All use cases
          "developers/docs/from-evm",
        ],
      },
    ],
  },

  {
    tab: "Payments",
    icon: "credit-card",
    groups: [
      {
        group: "Payment basics",
        pages: [
          "developers/docs/payments/index",
          "developers/docs/payments/how-payments-work",
          "developers/docs/payments/interacting-with-solana",
        ],
      },
      {
        group: "Payment tutorials",
        pages: [
          {
            group: "Build a checkout",
            root: "developers/docs/payments/checkout",
            tag: "~30 min",
            expanded: true,
            pages: [
              "developers/docs/payments/checkout/try-it",
              "developers/docs/payments/checkout/browser",
              "developers/docs/payments/checkout/backend",
              "developers/docs/payments/checkout/go-live",
            ],
          },
          {
            group: "Paywall an endpoint",
            root: "developers/docs/payments/paywall-api",
            tag: "~30 min",
            expanded: true,
            pages: [
              "developers/docs/payments/paywall-api/try-it",
              "developers/docs/payments/paywall-api/browser",
              "developers/docs/payments/paywall-api/server",
              "developers/docs/payments/paywall-api/go-live",
            ],
          },
          // docs/payments/quickstart was merged into checkout/browser
          // (migration/dup-audit.md #2) and is a redirect now.
        ],
      },
      {
        group: "Payment guides",
        pages: [
          {
            group: "Send payments",
            root: "developers/docs/payments/send-payments/index",
            pages: [
              "developers/docs/payments/send-payments/basic-payment",
              "developers/docs/payments/send-payments/payment-with-memo",
              "developers/docs/payments/send-payments/verify-address",
              {
                group: "Payment processing",
                root: "developers/docs/payments/send-payments/payment-processing/index",
                pages: [
                  "developers/docs/payments/send-payments/payment-processing/fee-abstraction",
                  // sidebarTitle: Payouts & disbursements (moved into its own
                  // group, dup-audit nav clean-up)
                  "developers/docs/payments/send-payments/payment-processing/batch-payments",
                ],
              },
            ],
          },
          {
            group: "Accept payments",
            root: "developers/docs/payments/accept-payments/index",
            // accept-payments/solana-pay was merged into
            // tools/commerce-kit/quickstart/solana-pay (dup-audit #3).
            pages: [
              "developers/docs/payments/accept-payments/verification-tools",
              "developers/docs/payments/accept-payments/indexing",
            ],
          },
          {
            group: "Subscriptions",
            root: "developers/docs/payments/subscriptions/overview",
            pages: [x("developers/docs/payments/subscriptions")],
          },
          {
            // docs/payments/pay-per-call was merged into agentic-payments
            // (now titled "Pay-per-call & agents", dup-audit #4), and
            // x402/making-a-payment into pay-sh (#5).
            group: "Pay-per-call & agents",
            root: "developers/docs/payments/agentic-payments/index",
            labelFrom: "none",
            pages: [
              "developers/docs/payments/agentic-payments/x402/index", // sidebarTitle: How x402 works
              "developers/docs/payments/agentic-payments/mpp",
              "developers/docs/payments/pay-sh",
            ],
          },
          "developers/docs/finance/privacy", // sidebarTitle: Private payments
          {
            group: "Advanced payments",
            labelFrom: "none",
            pages: [
              "developers/docs/payments/advanced-payments/deferred-execution",
              "developers/docs/payments/advanced-payments/spend-permissions",
            ],
          },
        ],
      },
      {
        group: "Tools",
        pages: [
          "developers/docs/payments/developer-tools",
          {
            group: "Commerce Kit",
            root: "developers/docs/tools/commerce-kit/index",
            pages: [x("developers/docs/tools/commerce-kit/quickstart")],
          },
          {
            group: "Kora (fee sponsorship)",
            root: "developers/docs/tools/kora/index",
            labelFrom: "none",
            pages: [x("developers/docs/tools/kora")],
          },
          {
            // tools/solana-pay/quickstart/index was merged into the index's
            // Quick Start section (dup-audit #8); the Quick Start group is
            // rootless in en.json.
            group: "Solana Pay",
            root: "developers/docs/tools/solana-pay/index",
            pages: [x("developers/docs/tools/solana-pay")],
          },
          "developers/docs/tools/x402-facilitator",
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
        pages: ["developers/docs/assets/index"],
      },
      {
        group: "Asset tutorials",
        pages: [
          {
            group: "Issue an asset",
            root: "developers/docs/assets/issue-asset",
            tag: "~45 min",
            expanded: true,
            pages: [
              "developers/docs/assets/issue-asset/try-it",
              "developers/docs/assets/issue-asset/browser",
              "developers/docs/assets/issue-asset/local",
              "developers/docs/assets/issue-asset/go-live",
            ],
          },
          // docs/tokenization/quickstart was merged into the issue-asset path;
          // its Kit/Legacy/Rust tabs live on the cookbook page
          // developers/cookbook/tokens/create-mint-with-extensions (#1).
        ],
      },
      {
        group: "Tokenization",
        labelFrom: "meta:docs/tokenization",
        // Rootless: the tokenization index was merged into
        // docs/assets#tokenization (dup-audit #7).
        pages: [
          "developers/docs/tokenization/token-acl",
          {
            group: "KYC with Attestations",
            root: "developers/docs/tools/attestations/index",
            labelFrom: "none",
            pages: [x("developers/docs/tools/attestations")],
          },
          "developers/docs/tokenization/nav-strikes",
        ],
      },
      {
        group: "Tokens",
        labelFrom: "message:tokenization",
        pages: [
          "developers/docs/tokens/index",
          "developers/docs/tokens/quickstart",
          {
            group: "Token basics",
            root: "developers/docs/tokens/basics/index",
            labelFrom: "meta:docs/tokens/basics",
            pages: [x("developers/docs/tokens/basics")],
          },
          {
            group: "Token extensions",
            root: "developers/docs/tokens/extensions/index",
            labelFrom: "meta:docs/tokens/extensions",
            pages: [x("developers/docs/tokens/extensions")],
          },
          {
            group: "Advanced tokens",
            root: "developers/docs/tokens/advanced/index",
            pages: [x("developers/docs/tokens/advanced")],
          },
          "developers/docs/tokens/how-to-verify-a-token",
        ],
      },
      {
        group: "NFTs & game items",
        pages: [
          "developers/docs/tokens/metaplex",
          "developers/docs/assets/games",
        ],
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
        pages: ["developers/docs/defi/index"],
      },
      {
        group: "Market tutorials",
        pages: [
          {
            group: "Settle a trade",
            root: "developers/docs/defi/settle-trade",
            tag: "~40 min",
            expanded: true,
            pages: [
              "developers/docs/defi/settle-trade/try-it",
              "developers/docs/defi/settle-trade/browser",
              "developers/docs/defi/settle-trade/local",
              "developers/docs/defi/settle-trade/go-live",
            ],
          },
        ],
      },
      {
        group: "Trading guides",
        pages: [
          "developers/docs/defi/exchange",
          {
            group: "Delivery vs payment",
            root: "developers/docs/tokenization/dvp",
            labelFrom: "none",
            pages: [
              "developers/docs/defi/dvp-program/index",
              x("developers/docs/defi/dvp-program"),
            ],
          },
          "developers/docs/defi/mev-protection",
          "developers/docs/defi/stake-weighted-qos",
        ],
      },
    ],
  },

  {
    tab: "How Solana works",
    icon: "box",
    groups: [
      { group: "Introduction", pages: ["developers/docs/core/index"] },
      {
        group: "The basics",
        pages: [
          "developers/docs/core/wallets",
          {
            group: "Accounts",
            root: "developers/docs/core/accounts/index",
            pages: [x("developers/docs/core/accounts")],
          },
          {
            group: "Transactions",
            root: "developers/docs/core/transactions/index",
            pages: [
              x("developers/docs/core/transactions"),
              "developers/docs/core/transactions/confirmation",
            ],
          },
          "developers/docs/references/clusters",
        ],
      },
      {
        group: "Costs & speed",
        pages: [
          {
            group: "Fees",
            root: "developers/docs/core/fees/index",
            pages: [
              x("developers/docs/core/fees"),
              "developers/docs/core/fees/fee-sponsorship",
            ],
          },
          "developers/docs/core/rent",
        ],
      },
      {
        group: "Building",
        pages: [
          {
            group: "Programs",
            root: "developers/docs/core/programs/index",
            pages: [x("developers/docs/core/programs")],
          },
          {
            group: "Instructions",
            root: "developers/docs/core/instructions/index",
            pages: [x("developers/docs/core/instructions")],
          },
          {
            group: "Program-derived addresses",
            root: "developers/docs/core/pda/index",
            labelFrom: "meta:docs/core/pda",
            pages: [x("developers/docs/core/pda")],
          },
          {
            group: "Cross-program calls",
            root: "developers/docs/core/cpi/index",
            labelFrom: "meta:docs/core/cpi",
            pages: [x("developers/docs/core/cpi")],
          },
        ],
      },
      {
        group: "Staking",
        pages: [
          "developers/docs/references/staking/index",
          x("developers/docs/references/staking"),
        ],
      },
      {
        group: "Glossary",
        labelFrom: "message:terminology",
        pages: ["developers/docs/references/terminology"],
      },
    ],
  },

  {
    tab: "Resources",
    icon: "wrench",
    groups: [
      { group: "Browse resources", pages: ["developers/docs/tools/index"] },
      {
        group: "Set up",
        pages: [
          "developers/docs/intro/coding-with-agents",
          "developers/docs/tools/ai",
          {
            group: "Set up your machine",
            root: "developers/docs/intro/installation/index",
            labelFrom: "meta:docs/intro/installation",
            pages: [
              "developers/docs/intro/installation/dependencies",
              "developers/docs/intro/installation/solana-cli-basics",
              "developers/docs/intro/installation/anchor-cli-basics",
              "developers/docs/intro/installation/surfpool-cli-basics",
            ],
          },
        ],
      },
      {
        group: "Write programs",
        labelFrom: "meta:docs/core/programs",
        pages: [
          "developers/docs/programs/index",
          {
            group: "First program in the browser",
            root: "developers/docs/intro/quick-start/index",
            labelFrom: "none",
            pages: [x("developers/docs/intro/quick-start")],
          },
          {
            group: "Rust programs",
            root: "developers/docs/programs/rust/index",
            pages: [x("developers/docs/programs/rust")],
          },
          {
            group: "Anchor framework",
            root: "developers/docs/programs/anchor",
            labelFrom: "none",
            pages: ["developers/docs/programs/anchor-events"],
          },
          {
            group: "Testing programs",
            labelFrom: "meta:docs/programs/testing",
            pages: [x("developers/docs/programs/testing")],
          },
          {
            group: "Deploying",
            root: "developers/docs/programs/deploying",
            labelFrom: "none",
            pages: ["developers/docs/programs/verified-builds"],
          },
          {
            group: "IDLs & Codama clients",
            root: "developers/docs/programs/idls",
            labelFrom: "none",
            pages: [x("developers/docs/programs/codama")],
          },
          "developers/docs/programs/examples",
          "developers/docs/programs/limitations",
        ],
      },
      {
        group: "Build apps",
        pages: [
          {
            group: "React & Next.js",
            root: "developers/docs/frontend/index",
            labelFrom: "meta:docs/frontend",
            pages: [x("developers/docs/frontend")],
          },
          {
            group: "Developer tools",
            labelFrom: "none",
            pages: [
              {
                group: "Surfpool",
                root: "developers/docs/tools/surfpool/index",
                pages: [x("developers/docs/tools/surfpool")],
              },
              {
                group: "LiteSVM",
                root: "developers/docs/tools/litesvm/index",
                pages: [x("developers/docs/tools/litesvm")],
              },
              "developers/docs/tools/microscope",
              {
                group: "Keychain",
                root: "developers/docs/tools/keychain/index",
                pages: [x("developers/docs/tools/keychain")],
              },
              {
                group: "Private Channels",
                root: "developers/docs/tools/private-channels/index",
                pages: [x("developers/docs/tools/private-channels")],
              },
              "developers/docs/tools/actions",
            ],
          },
        ],
      },
      { group: "Ship", pages: ["developers/docs/tools/production-readiness"] },
      {
        group: "Cookbook",
        labelFrom: "message:cookbook",
        pages: ["developers/cookbook/index", x("developers/cookbook")],
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
          "developers/docs/rpc/index",
          "developers/docs/rpc/providers",
          "developers/docs/rpc/json-structures",
          {
            group: "HTTP methods",
            root: "developers/docs/rpc/http/index",
            pages: [x("developers/docs/rpc/http")],
          },
          {
            group: "WebSocket methods",
            root: "developers/docs/rpc/websocket/index",
            pages: [x("developers/docs/rpc/websocket")],
          },
          {
            group: "Removed methods",
            root: "developers/docs/rpc/deprecated/index",
            expanded: false,
            pages: [x("developers/docs/rpc/deprecated")],
          },
        ],
      },
      {
        group: "SDKs",
        labelFrom: "meta:docs/clients",
        pages: [
          "developers/docs/clients/index",
          "developers/docs/clients/official/javascript",
          "developers/docs/clients/official/rust",
          {
            group: "Python & community",
            labelFrom: "meta:docs/clients/community",
            pages: [x("developers/docs/clients/community")],
          },
        ],
      },
      {
        group: "CLI reference",
        pages: [
          "developers/docs/references/solana-cli",
          "developers/docs/references/spl-token-cli",
        ],
      },
      {
        group: "Network constants",
        pages: ["developers/docs/core/constants-reference"],
      },
    ],
  },

  // Video tutorials: a regular tab on the right, with the video guides in
  // its own sidebar. styles/theme.css pushes the last tab to the far end.
  {
    tab: "Video tutorials",
    icon: "play",
    align: "end",
    labelFrom: "message:videoTutorials",
    groups: [
      {
        group: "Videos",
        labelFrom: "message:videoTutorials",
        pages: [
          "developers/docs/video-guides/index",
          {
            group: "Foundations",
            labelFrom: "meta:developers/bootcamp/foundations",
            pages: [
              "developers/docs/video-guides/solana-crash-course",
              "developers/docs/video-guides/2026-developer-bootcamp",
            ],
          },
          {
            group: "Payments",
            labelFrom: "message:payments",
            pages: [
              "developers/docs/video-guides/agent-payments",
              "developers/docs/video-guides/pay-sh-video-tutorials",
            ],
          },
          {
            group: "Privacy",
            pages: ["developers/docs/video-guides/confidential-balances"],
          },
          {
            group: "Hardware & DePIN",
            pages: ["developers/docs/video-guides/building-depin-projects"],
          },
        ],
      },
    ],
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
      // Indexed: the URL stays live.
      {
        group: "Documentation tags",
        searchable: true,
        pages: ["developers/docs/tags/index"],
      },
    ],
  },
];
