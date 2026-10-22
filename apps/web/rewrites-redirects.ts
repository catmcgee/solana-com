import {
  MEDIA_APP_URL,
  templatesAppUrl,
  ACCELERATE_APP_URL,
  BREAKPOINT_APP_URL,
} from "./apps-urls";
import { locales } from "@workspace/i18n/config";
import { DOCS_TRANSLATED_LOCALE_PATTERN } from "./src/lib/docs-edge/paths";

const LOCALE_REGEX = locales.join("|");

type RedirectInput = {
  source: string;
  destination: string;
  localeDestination?: string;
  permanent?: boolean;
  /**
   * `false` emits the redirect exactly as written, with no locale twin. Used
   * by rules that already carry their own locale.
   */
  localize?: false;
};

type LocaleRedirect = RedirectInput & { locale: false };

/**
 * Generates both bare-path and locale-prefixed versions of each redirect.
 * - For internal destinations: `:locale` param is prepended to both source and destination
 * - `localeDestination` overrides that destination when the resource exists only at the root
 * - For external destinations (http/https): `:locale` param is only prepended to source
 * - All generated redirects use `locale: false` for explicit path control
 */
function withLocaleRedirects(redirects: RedirectInput[]): LocaleRedirect[] {
  return redirects.flatMap(
    ({
      source,
      destination,
      localeDestination: override,
      localize,
      ...rest
    }): LocaleRedirect[] => {
      if (localize === false) {
        return [{ source, destination, locale: false, ...rest }];
      }

      const isExternalDest =
        destination.startsWith("https://") || destination.startsWith("http://");

      const localeDestination =
        override ??
        (isExternalDest
          ? destination
          : destination.startsWith("/")
            ? `/:locale${destination}`
            : `/:locale/${destination}`);

      return [
        // Bare path (e.g. /brand → /branding)
        { source, destination, locale: false, ...rest },
        // Locale-prefixed (e.g. /:locale/brand → /:locale/branding)
        {
          source: `/:locale(${LOCALE_REGEX})${source}`,
          destination: localeDestination,
          locale: false,
          ...rest,
        },
      ];
    },
  );
}

/**
 * Adds a `.md` twin for each redirect so the raw-markdown variants of moved
 * pages (served via the docs app's markdown middleware) keep working.
 * Skipped for external destinations and destinations with anchors.
 */
function withMdVariants(redirects: RedirectInput[]): RedirectInput[] {
  return redirects.flatMap((redirect) => {
    const { source, destination } = redirect;
    const isExternalDest =
      destination.startsWith("https://") || destination.startsWith("http://");
    if (isExternalDest || destination.includes("#")) {
      return [redirect];
    }
    return [
      redirect,
      { ...redirect, source: `${source}.md`, destination: `${destination}.md` },
    ];
  });
}

/**
 * The /developers/guides section was dissolved in the docs restructure.
 * Every page has a specific destination - mapped page by page, never a
 * blanket redirect. Do not remove entries: external links and AI agents
 * hold these URLs indefinitely.
 */
const dissolvedGuideRedirects: RedirectInput[] = withMdVariants([
  // Section and category indexes
  { source: "/developers/guides", destination: "/developers/docs" },
  { source: "/developers/guides/advanced", destination: "/developers/docs" },
  {
    source: "/developers/guides/games",
    destination:
      "/developers/cookbook/games/getting-started-with-game-development",
  },
  {
    source: "/developers/guides/getstarted",
    destination: "/developers/docs/quickstart",
  },
  {
    source: "/developers/guides/dapps",
    destination: "/developers/docs/video-guides/2026-developer-bootcamp",
  },
  {
    source: "/developers/guides/depin",
    destination: "/developers/cookbook/depin",
  },
  {
    source: "/developers/guides/token-extensions",
    destination: "/developers/docs/tokens/extensions",
  },
  // advanced/* → verticals, programs, tools, and cookbook
  {
    source: "/developers/guides/advanced/acl",
    destination: "/developers/docs/tokenization/token-acl",
  },
  {
    source: "/developers/guides/advanced/dvp",
    destination: "/developers/docs/tokenization/dvp",
  },
  {
    source: "/developers/guides/advanced/nav-strikes",
    destination: "/developers/docs/tokenization/nav-strikes",
  },
  {
    source: "/developers/guides/advanced/exchange",
    destination: "/developers/docs/defi/exchange",
  },
  {
    source: "/developers/guides/advanced/mev-protection",
    destination: "/developers/docs/defi/mev-protection",
  },
  {
    source: "/developers/guides/advanced/stake-weighted-qos",
    destination: "/developers/docs/defi/stake-weighted-qos",
  },
  {
    source: "/developers/guides/advanced/idls",
    destination: "/developers/docs/programs/idls",
  },
  {
    source: "/developers/guides/advanced/actions",
    destination: "/developers/docs/tools/actions",
  },
  {
    source: "/developers/guides/advanced/security-best-practices",
    destination: "/developers/docs/tools/production-readiness",
  },
  {
    source: "/developers/guides/advanced/confirmation",
    destination: "/developers/cookbook/transactions/confirmation",
  },
  {
    source: "/developers/guides/advanced/retry",
    destination: "/developers/cookbook/transactions/retry",
  },
  {
    source: "/developers/guides/advanced/versions",
    destination: "/developers/cookbook/transactions/versions",
  },
  {
    source: "/developers/guides/advanced/lookup-tables",
    destination: "/developers/cookbook/transactions/lookup-tables",
  },
  {
    source: "/developers/guides/advanced/introduction-to-durable-nonces",
    destination: "/developers/cookbook/transactions/durable-nonces",
  },
  {
    source: "/developers/guides/advanced/how-to-optimize-compute",
    destination: "/developers/cookbook/transactions/optimize-compute",
  },
  {
    source: "/developers/guides/advanced/auto-approve",
    destination: "/developers/cookbook/wallets/auto-approve",
  },
  // dapps and depin → bootcamp
  {
    source: "/developers/guides/dapps/journal",
    destination: "/developers/cookbook/development/crud-dapp",
  },
  {
    source: "/developers/guides/depin/getting-started",
    destination: "/developers/cookbook/depin",
  },
  // games/* → cookbook games category
  {
    source: "/developers/guides/games/energy-system",
    destination: "/developers/cookbook/games/energy-system",
  },
  {
    source: "/developers/guides/games/game-examples",
    destination: "/developers/cookbook/games/game-examples",
  },
  {
    source: "/developers/guides/games/getting-started-with-game-development",
    destination:
      "/developers/cookbook/games/getting-started-with-game-development",
  },
  {
    source: "/developers/guides/games/hello-world",
    destination: "/developers/cookbook/games/hello-world",
  },
  {
    source: "/developers/guides/games/interact-with-tokens",
    destination: "/developers/cookbook/games/interact-with-tokens",
  },
  {
    source: "/developers/guides/games/nfts-in-games",
    destination: "/developers/cookbook/games/nfts-in-games",
  },
  {
    source: "/developers/guides/games/porting-anchor-to-unity",
    destination: "/developers/cookbook/games/porting-anchor-to-unity",
  },
  {
    source: "/developers/guides/games/saving-game-state",
    destination: "/developers/cookbook/games/saving-game-state",
  },
  {
    source: "/developers/guides/games/store-sol-in-pda",
    destination: "/developers/cookbook/games/store-sol-in-pda",
  },
  // getstarted/* → payments, tools, cookbook
  {
    source: "/developers/guides/getstarted/intro-to-x402",
    destination: "/developers/docs/payments/agentic-payments/x402",
  },
  {
    source: "/developers/guides/getstarted/build-a-x402-facilitator",
    destination: "/developers/docs/tools/x402-facilitator",
  },
  {
    source: "/developers/guides/getstarted/intro-to-ai",
    destination: "/developers/docs/intro/coding-with-agents",
  },
  {
    source: "/developers/guides/getstarted/how-to-verify-a-token",
    destination: "/developers/docs/tokens/how-to-verify-a-token",
  },
  {
    source: "/developers/guides/getstarted/tokens",
    destination: "/developers/docs/tokens",
  },
  {
    source: "/developers/guides/getstarted/actions",
    destination: "/developers/docs/tools/actions",
  },
  {
    source: "/developers/guides/getstarted/solana-token-airdrop-and-faucets",
    destination: "/developers/cookbook/development/airdrops-and-faucets",
  },
  {
    source: "/developers/guides/getstarted/supabase-auth-guide",
    destination: "/developers/cookbook/wallets/supabase-auth",
  },
  {
    source: "/developers/guides/permissioned-environments",
    destination: "https://launch.solana.com/products/private-channels",
  },
  // token-extensions/* → tokens extensions reference
  {
    source: "/developers/guides/token-extensions/transfer-hook",
    destination: "/developers/docs/tokens/extensions/transfer-hook",
  },
  {
    source: "/developers/guides/token-extensions/dynamic-meta-data-nft",
    destination: "/developers/docs/tokens/extensions/dynamic-metadata-nft",
  },
]);

const movedDocsRedirects: RedirectInput[] = withMdVariants([
  {
    source: "/docs/payments/agentic-payments/intro-to-x402",
    destination: "/developers/docs/payments/agentic-payments/x402",
  },
  {
    // Points straight at the final page: x402/making-a-payment was merged
    // into pay-sh (below), and redirects must never chain.
    source: "/docs/payments/agentic-payments/x402-quickstart",
    destination: "/developers/docs/payments/pay-sh#let-an-agent-pay-x402",
  },
  {
    source: "/docs/payments/agentic-payments/x402-facilitator",
    destination: "/developers/docs/tools/x402-facilitator",
  },
  {
    source: "/docs/references",
    destination: "/developers/docs/references/clusters",
  },
  {
    source: "/docs/clients/javascript",
    destination: "/developers/docs/clients/official/javascript",
  },
  {
    source: "/docs/clients/game-sdks",
    destination: "/developers/docs/clients/community/game-sdks",
  },
  {
    source: "/docs/clients/go",
    destination: "/developers/docs/clients/community/go",
  },
  {
    source: "/docs/clients/java",
    destination: "/developers/docs/clients/community/java",
  },
  {
    source: "/docs/clients/python",
    destination: "/developers/docs/clients/community/python",
  },
  {
    source: "/docs/clients/rust",
    destination: "/developers/docs/clients/official/rust",
  },
  {
    source: "/docs/frontend/kit",
    destination: "/developers/docs/frontend/client",
  },
  {
    source: "/docs/intro/quick-start/cross-program-invocation",
    destination: "/developers/docs/core/cpi",
  },
  {
    source: "/docs/intro/quick-start/deploying-programs",
    destination: "/developers/docs/programs/build-first-program",
  },
  {
    source: "/docs/intro/quick-start/program-derived-address",
    destination: "/developers/docs/core/pda",
  },
  {
    source: "/docs/references/economics/staking",
    destination: "/developers/docs/references/staking",
  },
  {
    source: "/docs/advanced/actions",
    destination: "/developers/docs/tools/actions",
  },
  {
    source: "/developers/guides/token-extensions/confidential-transfer",
    destination: "/developers/docs/tokens/extensions/confidential-transfer",
  },
  // Ported from the deleted apps/docs/next.config.ts (spec §5.8; saved in
  // migration/docs-app-redirects.json). They also cover the 17 stale
  // locale-only payment-button pages that were removed (R8).
  {
    source: "/docs/payments/accept-payments/payment-button",
    destination:
      "/developers/docs/tools/commerce-kit/quickstart/payment-button",
  },
  {
    source: "/docs/payments/accept-payments/pay-sh",
    destination: "/developers/docs/payments/pay-sh",
  },
  {
    source: "/docs/payments/subscriptions/pay-sh",
    destination: "/developers/docs/payments/pay-sh",
  },
  {
    source: "/docs/payments/production-readiness",
    destination: "/developers/docs/tools/production-readiness",
  },
  // Duplicate pages merged into the page that covers the same job
  // (migration/dup-audit.md, 2026-10-15). Their unique content moved first;
  // the EN file and its 17 locale copies were deleted. Destinations with an
  // anchor get no automatic `.md` twin (withMdVariants); see
  // anchoredMdTwinRedirects below.
  {
    // The quickstart launched a plain Token-2022 mint with extensions; its
    // code, tabs and prose live on this cookbook page (2026-10-16), not on
    // the compliance-controls issue-asset path.
    source: "/docs/tokenization/quickstart",
    destination: "/developers/cookbook/tokens/create-mint-with-extensions",
  },
  {
    // Exact path only: /docs/tokenization/<page> still exists.
    source: "/docs/tokenization",
    destination: "/developers/docs/assets#tokenization",
  },
  {
    source: "/docs/payments/quickstart",
    destination: "/developers/docs/payments/checkout/browser",
  },
  {
    source: "/docs/payments/accept-payments/solana-pay",
    destination: "/developers/docs/tools/commerce-kit/quickstart/solana-pay",
  },
  {
    source: "/docs/payments/pay-per-call",
    destination: "/developers/docs/payments/agentic-payments",
  },
  {
    source: "/docs/payments/agentic-payments/x402/making-a-payment",
    destination: "/developers/docs/payments/pay-sh#let-an-agent-pay-x402",
  },
  {
    source: "/docs/tools/solana-pay/quickstart",
    destination: "/developers/docs/tools/solana-pay#quick-start",
  },
  // The Kora JSON-RPC "Authentication" page was an unlisted stub; Kora
  // authentication is documented for operators (2026-10-16).
  {
    source: "/docs/tools/kora/json-rpc-api/authentication",
    destination: "/developers/docs/tools/kora/operators/authentication",
  },
  {
    source: "/developers/docs/tools/kora/json-rpc-api/authentication",
    destination: "/developers/docs/tools/kora/operators/authentication",
  },
  // Start here / Resources reorganisation (2026-10-16). "Coming from
  // Ethereum" became "Coming from EVM" (Resources > Set up), and the program
  // quickstart moved under Write programs. Both the pre-move /docs URL and
  // the /developers/docs URL it had for a day redirect.
  {
    source: "/docs/from-ethereum",
    destination: "/developers/docs/from-evm",
  },
  {
    source: "/developers/docs/from-ethereum",
    destination: "/developers/docs/from-evm",
  },
  {
    source: "/docs/intro/quick-start/build-first-program",
    destination: "/developers/docs/programs/build-first-program",
  },
  {
    source: "/developers/docs/intro/quick-start/build-first-program",
    destination: "/developers/docs/programs/build-first-program",
  },
  // The Playground quick start and its two walkthroughs were merged into the
  // Quickstart tutorial (2026-10-16): reading -> Check a balance, writing ->
  // Send dollars (Send SOL until 2026-10-21). The pages and their locale
  // copies were deleted.
  ...[
    ["", "/developers/docs/quickstart"],
    ["/reading-from-network", "/developers/docs/quickstart/check-balance"],
    ["/writing-to-network", "/developers/docs/quickstart/send-dollars"],
  ].flatMap(([page, destination]) => [
    { source: `/docs/intro/quick-start${page}`, destination: destination! },
    {
      source: `/developers/docs/intro/quick-start${page}`,
      destination: destination!,
    },
  ]),
  // The "All use cases" hub was removed (2026-10-16): Start here and the tab
  // landings (Payments, Assets, Markets) link every page it listed. Exact
  // paths only: /docs/finance/privacy still exists.
  { source: "/docs/finance", destination: "/developers/docs" },
  { source: "/developers/docs/finance", destination: "/developers/docs" },
]);

/**
 * `.md` twins for the movedDocsRedirects whose destination carries an anchor
 * (withMdVariants skips those). A markdown twin has no anchors, so it goes to
 * the destination page's own `.md`. Kept out of withMdVariants, which would
 * add a `.md.md` twin.
 */
const anchoredMdTwinRedirects: RedirectInput[] = [
  {
    source: "/docs/payments/agentic-payments/x402-quickstart.md",
    destination: "/developers/docs/payments/pay-sh.md",
  },
  {
    source: "/docs/payments/agentic-payments/x402/making-a-payment.md",
    destination: "/developers/docs/payments/pay-sh.md",
  },
  {
    source: "/docs/tokenization.md",
    destination: "/developers/docs/assets.md",
  },
  {
    source: "/docs/tools/solana-pay/quickstart.md",
    destination: "/developers/docs/tools/solana-pay.md",
  },
];

/**
 * Quick installation moved into the Quickstart's "Follow along manually"
 * tab (2026-10-21). Temporary while the docs are in preview.
 */
const installRedirects: RedirectInput[] = withMdVariants([
  // The Quickstart now sends dollars and creates an asset (2026-10-21).
  {
    source: "/developers/docs/quickstart/send-sol",
    destination: "/developers/docs/quickstart/send-dollars",
    permanent: false,
  },
  {
    source: "/developers/docs/quickstart/create-token",
    destination: "/developers/docs/quickstart/create-asset",
    permanent: false,
  },
  {
    source: "/developers/docs/intro/installation",
    destination: "/developers/docs/quickstart",
    permanent: false,
  },
  {
    source: "/developers/docs/intro/installation/index",
    destination: "/developers/docs/quickstart",
    permanent: false,
  },
  {
    source: "/docs/intro/installation",
    destination: "/developers/docs/quickstart",
    permanent: false,
  },
]);

/**
 * The Developer Bootcamp lives in Video tutorials: /developers/bootcamp is
 * the 2026 Developer Bootcamp video page, with the Video tutorials sidebar.
 * The old lesson-by-lesson pages (and /developers/learn, its earlier name)
 * go to the matching video page in one hop. Temporary while the docs are in
 * preview; make them permanent at launch.
 */
const VIDEO = "/developers/docs/video-guides";
const bootcampRedirects: RedirectInput[] = [
  ...withMdVariants([
    {
      source: "/developers/bootcamp",
      destination: `${VIDEO}/2026-developer-bootcamp`,
      permanent: false,
    },
    {
      source: "/developers/learn",
      destination: `${VIDEO}/2026-developer-bootcamp`,
      permanent: false,
    },
  ]),
  ...["bootcamp", "learn"].flatMap((base): RedirectInput[] => [
    {
      source: `/developers/${base}/solana-crashcourse/:path*`,
      destination: `${VIDEO}/solana-crash-course`,
      permanent: false,
    },
    {
      source: `/developers/${base}/depin/:path*`,
      destination: `${VIDEO}/building-depin-projects`,
      permanent: false,
    },
    {
      source: `/developers/${base}/:path*`,
      destination: `${VIDEO}/2026-developer-bootcamp`,
      permanent: false,
    },
  ]),
];

/**
 * /docs/tags/<tag> never had pages; the tags index is a hidden docs page
 * (spec §5.3). Temporary, so the index can grow real tag pages later. The
 * old /docs prefix gets its own rule so it takes one hop, not two.
 */
const docsTagRedirects: RedirectInput[] = [
  {
    source: "/docs/tags/:tag+",
    destination: "/developers/docs/tags",
    permanent: false,
  },
  {
    source: "/developers/docs/tags/:tag+",
    destination: "/developers/docs/tags",
    permanent: false,
  },
];

/**
 * The docs moved from /docs to /developers/docs (2026-10-16). Every old
 * docs URL, its `.md` twin and its locale twins answer one permanent
 * redirect to the same path under /developers/docs (query strings are kept,
 * so /docs?q=... search hand-offs still work). Placed LAST: the page-level
 * redirects above match old /docs URLs first and point straight at the
 * final /developers/docs page, so a moved page is still one hop.
 * `localize: false` because the rules carry their own locale handling:
 * `/en/docs/x` goes straight to the unprefixed English URL.
 * Greek (/el/docs/...) is handled by greekDocsRedirects, which runs first.
 */
const DOCS_MOVE_LOCALES = `:locale(${DOCS_TRANSLATED_LOCALE_PATTERN})`;
const docsPrefixMoveRedirects: RedirectInput[] = [
  { source: "/docs", destination: "/developers/docs" },
  { source: "/docs.md", destination: "/developers/docs.md" },
  { source: "/docs/:path+", destination: "/developers/docs/:path+" },
  { source: "/en/docs", destination: "/developers/docs" },
  { source: "/en/docs.md", destination: "/developers/docs.md" },
  { source: "/en/docs/:path+", destination: "/developers/docs/:path+" },
  {
    source: `/${DOCS_MOVE_LOCALES}/docs`,
    destination: "/:locale/developers/docs",
  },
  {
    source: `/${DOCS_MOVE_LOCALES}/docs.md`,
    destination: "/:locale/developers/docs.md",
  },
  {
    source: `/${DOCS_MOVE_LOCALES}/docs/:path+`,
    destination: "/:locale/developers/docs/:path+",
  },
].map((r) => ({ ...r, permanent: true, localize: false as const }));

/**
 * Greek (el) docs were dropped (decisions.md). One rule,
 * placed first, sends every el-prefixed docs collection URL (and its `.md`
 * twin) to the same path without `/el`:
 *   /el/docs[.md|/*], /el/learn[.md|/*], /el/developers[.md] and
 *   /el/developers/{docs,cookbook,bootcamp,guides,learn}[.md|/*].
 * Because it runs before everything else, the per-locale twins below never
 * see /el docs URLs. A Greek URL whose English page also moved takes two
 * hops (/el/docs/x -> /docs/x -> /developers/docs/x, or
 * /el/docs/old -> /docs/old -> /developers/docs/new); that keeps the route
 * count down instead of adding a Greek copy of every docs redirect.
 * /el/... pages served by apps/web itself (news, wallets,
 * /el/developers/payments, ...) do not match.
 */
const greekDocsRedirects: RedirectInput[] = [
  {
    source:
      "/el/:path((?:docs|learn|developers/(?:docs|cookbook|bootcamp|guides|learn))(?:\\.md|/.+)?|developers(?:\\.md)?)",
    destination: "/:path",
    permanent: true,
    localize: false,
  },
];

const breakpointSubrouteRedirects: RedirectInput[] = [
  { source: "/agenda", destination: "/breakpoint/schedule" },
  { source: "/faq", destination: "/breakpoint/faq" },
  { source: "/registration", destination: "/breakpoint/registration" },
  { source: "/schedule", destination: "/breakpoint/schedule" },
  { source: "/speakers", destination: "/breakpoint/speakers" },
  { source: "/sponsors", destination: "/breakpoint/sponsors" },
  { source: "/tickets", destination: "/breakpoint/registration" },
  { source: "/travel", destination: "/breakpoint/travel" },
  { source: "/breakpoint/tickets", destination: "/breakpoint/registration" },
];

/**
 * The EVM→SVM and Cosmos→SVM guides were consolidated under
 * /developers/migrate-to-solana. Permanent redirects keep the old URLs
 * working: external links and AI agents hold them indefinitely.
 */
const chainMigrationRedirects: RedirectInput[] = [
  // EVM→SVM guides moved 1:1 under /developers/migrate-to-solana
  {
    source: "/developers/evm-to-svm/:path+",
    destination: "/developers/migrate-to-solana/:path+",
    permanent: true,
  },
  {
    source: "/developers/evm-to-svm",
    destination: "/developers/migrate-to-solana/ethereum",
    permanent: true,
  },
  {
    source: "/developers/cosmos-to-svm",
    destination: "/developers/migrate-to-solana/cosmos",
    permanent: true,
  },
  // The CosmWasm guide lives under the Cosmos hub
  {
    source: "/developers/migrate-to-solana/cosmwasm",
    destination: "/developers/migrate-to-solana/cosmos/cosmwasm",
    permanent: true,
  },
];

/*
 * The developer docs (/developers/docs, /developers/cookbook,
 * /developers/bootcamp, /learn/<article> and their locale copies) are pages
 * of this app (Fumadocs, src/app/[locale]/developers/docs etc.), so they
 * need no rewrites: only the redirects above and src/proxy.ts (canonical
 * paths, Markdown twins).
 */

export default {
  rewrites: {
    beforeFiles: [
      {
        source: "/breakpoint",
        destination: `${BREAKPOINT_APP_URL}/breakpoint`,
        locale: false,
      },
      // everything underneath
      {
        source: "/breakpoint/:path*",
        destination: `${BREAKPOINT_APP_URL}/breakpoint/:path*`,
        locale: false,
      },
      // Breakpoint app – locale-prefixed
      {
        source: "/:locale/breakpoint",
        destination: `${BREAKPOINT_APP_URL}/:locale/breakpoint`,
        locale: false,
      },
      {
        source: "/:locale/breakpoint/:path*",
        destination: `${BREAKPOINT_APP_URL}/:locale/breakpoint/:path*`,
        locale: false,
      },
      {
        source: "/breakpoint-assets/:path+",
        destination: `${BREAKPOINT_APP_URL}/breakpoint-assets/:path+`,
        locale: false,
      },
      // Media app rewrites - new routes
      {
        source: "/admin",
        destination: `${MEDIA_APP_URL}/admin`,
        locale: false,
      },
      {
        source: "/news",
        destination: `${MEDIA_APP_URL}/news`,
        locale: false,
      },
      {
        source: "/news/:path*",
        destination: `${MEDIA_APP_URL}/news/:path*`,
        locale: false,
      },
      {
        source: "/changelog",
        destination: `${MEDIA_APP_URL}/changelog`,
        locale: false,
      },
      {
        source: "/changelog/:path*",
        destination: `${MEDIA_APP_URL}/changelog/:path*`,
        locale: false,
      },
      {
        source: "/reports",
        destination: `${MEDIA_APP_URL}/reports`,
        locale: false,
      },
      {
        source: "/reports/:path*",
        destination: `${MEDIA_APP_URL}/reports/:path*`,
        locale: false,
      },
      {
        source: "/podcasts",
        destination: `${MEDIA_APP_URL}/podcasts`,
        locale: false,
      },
      {
        source: "/podcasts/:path*",
        destination: `${MEDIA_APP_URL}/podcasts/:path*`,
        locale: false,
      },
      {
        source: "/:locale/news",
        destination: `${MEDIA_APP_URL}/:locale/news`,
        locale: false,
      },
      {
        source: "/:locale/news/:path*",
        destination: `${MEDIA_APP_URL}/:locale/news/:path*`,
        locale: false,
      },
      {
        source: "/:locale/changelog",
        destination: `${MEDIA_APP_URL}/:locale/changelog`,
        locale: false,
      },
      {
        source: "/:locale/changelog/:path*",
        destination: `${MEDIA_APP_URL}/:locale/changelog/:path*`,
        locale: false,
      },
      {
        source: "/:locale/reports",
        destination: `${MEDIA_APP_URL}/:locale/reports`,
        locale: false,
      },
      {
        source: "/:locale/reports/:path*",
        destination: `${MEDIA_APP_URL}/:locale/reports/:path*`,
        locale: false,
      },
      {
        source: "/:locale/podcasts",
        destination: `${MEDIA_APP_URL}/:locale/podcasts`,
        locale: false,
      },
      {
        source: "/:locale/podcasts/:path*",
        destination: `${MEDIA_APP_URL}/:locale/podcasts/:path*`,
        locale: false,
      },
      {
        source: "/upgrade",
        destination: `${MEDIA_APP_URL}/upgrades`,
        locale: false,
      },
      {
        source: "/upgrades",
        destination: `${MEDIA_APP_URL}/upgrades`,
        locale: false,
      },
      {
        source: "/upgrades/:path+",
        destination: `${MEDIA_APP_URL}/upgrades/:path+`,
        locale: false,
      },
      {
        source: "/:locale/upgrade",
        destination: `${MEDIA_APP_URL}/:locale/upgrades`,
        locale: false,
      },
      {
        source: "/:locale/upgrades",
        destination: `${MEDIA_APP_URL}/:locale/upgrades`,
        locale: false,
      },
      {
        source: "/:locale/upgrades/:path+",
        destination: `${MEDIA_APP_URL}/:locale/upgrades/:path+`,
        locale: false,
      },
      {
        source: "/api/developer-updates/latest",
        destination: `${MEDIA_APP_URL}/api/developer-updates/latest`,
        locale: false,
      },
      {
        source: "/api/changelog/:path*",
        destination: `${MEDIA_APP_URL}/api/changelog/:path*`,
        locale: false,
      },
      {
        source: "/api/posts/:path*",
        destination: `${MEDIA_APP_URL}/api/posts/:path*`,
        locale: false,
      },
      {
        source: "/api/reports/:path*",
        destination: `${MEDIA_APP_URL}/api/reports/:path*`,
        locale: false,
      },
      {
        source: "/api/links/:path*",
        destination: `${MEDIA_APP_URL}/api/links/:path*`,
        locale: false,
      },
      {
        source: "/api/upgrades/alpenglow/:path*",
        destination: `${MEDIA_APP_URL}/api/upgrades/alpenglow/:path*`,
        locale: false,
      },
      // Proxy /_next/image requests for /uploads/* to the media app's image
      // optimizer. The web app's /_next/image reads from its own filesystem,
      // but /uploads/ files live in the media app's deployment.
      {
        source: "/_next/image",
        has: [{ type: "query", key: "url", value: "/uploads/(.*)" }],
        destination: `${MEDIA_APP_URL}/media-assets/_next/image`,
        locale: false,
      },
      // Media app assets (required for static assets with assetPrefix: "/media-assets")
      {
        source: "/media-assets/uploads/:path+",
        destination: `${MEDIA_APP_URL}/media-assets/uploads/:path+`,
        locale: false,
      },
      {
        source: "/media-assets/:path+",
        destination: `${MEDIA_APP_URL}/media-assets/:path+`,
        locale: false,
      },
      {
        source: "/uploads/:path+",
        destination: `${MEDIA_APP_URL}/media-assets/uploads/:path+`,
        locale: false,
      },
      // Templates app assets (required for static assets with assetPrefix: "/templates-assets")
      {
        source: "/templates-assets/:path+",
        destination: `${templatesAppUrl}/templates-assets/:path+`,
        locale: false,
      },
      // Accelerate app rewrites
      {
        source: "/accelerate",
        destination: `${ACCELERATE_APP_URL}/accelerate`,
        locale: false,
      },
      {
        source: "/accelerate/:path*",
        destination: `${ACCELERATE_APP_URL}/accelerate/:path*`,
        locale: false,
      },
      {
        source: "/:locale/accelerate",
        destination: `${ACCELERATE_APP_URL}/:locale/accelerate`,
        locale: false,
      },
      {
        source: "/:locale/accelerate/:path*",
        destination: `${ACCELERATE_APP_URL}/:locale/accelerate/:path*`,
        locale: false,
      },
      // Accelerate app Next.js optimizer/static (_next/*) paths
      {
        source: "/accelerate-assets/_next/:path+",
        destination: `${ACCELERATE_APP_URL}/_next/:path+`,
        locale: false,
      },
      // Accelerate app assets (required for static assets with assetPrefix: "/accelerate-assets")
      {
        source: "/accelerate-assets/images/:path+",
        destination: `${ACCELERATE_APP_URL}/images/:path+`,
        locale: false,
      },
      {
        source: "/accelerate-assets/:path+",
        destination: `${ACCELERATE_APP_URL}/accelerate-assets/:path+`,
        locale: false,
      },
      // Templates app rewrites (must come before general /developers rewrites)
      {
        source: "/developers/templates",
        destination: `${templatesAppUrl}/developers/templates`,
        locale: false,
      },
      {
        source: "/developers/templates/:path*",
        destination: `${templatesAppUrl}/developers/templates/:path*`,
        locale: false,
      },
    ],
    afterFiles: [],
    fallback: [],
  },

  redirects: withLocaleRedirects([
    // Keep first: Greek docs URLs go to English before any other rule.
    ...greekDocsRedirects,
    {
      source:
        "/uploads/posts/bits-to-bricks-crypto-security-michael-coates/heroImage.png",
      destination:
        "/uploads/posts/bits-to-bricks-crypto-security-michael-coates/heroImage.webp",
      permanent: true,
    },
    {
      source: "/uploads/posts/solana-changelog-september-18-2026/heroImage.png",
      destination:
        "/uploads/posts/solana-changelog-september-18-2026/heroImage.webp",
      permanent: true,
    },
    ...dissolvedGuideRedirects,
    ...movedDocsRedirects,
    ...anchoredMdTwinRedirects,
    ...installRedirects,
    ...bootcampRedirects,
    ...docsTagRedirects,
    ...chainMigrationRedirects,
    {
      source: "/universities",
      destination: "/university",
      permanent: true,
    },
    {
      source: "/universities/:path*",
      destination: "/university",
      permanent: true,
    },
    { source: "/brand", destination: "/branding" },
    { source: "/press", destination: "/branding" },
    { source: "/wallet", destination: "/wallets" },
    { source: "/case-studies", destination: "/news" },
    { source: "/news/tags/case-studies", destination: "/news" },
    {
      source: "/developers/moving-to-svm",
      destination: "/developers/evm-to-svm",
    },
    {
      source: "/developers/moving-to-svm/cosmwasm",
      destination:
        "https://rustopian.dev/article/from-cosmwasm-to-solana-rust-blockchain-development",
    },
    {
      source: "/solana-wallets",
      destination: "/wallets",
      permanent: true,
    },
    // /upgrades is served by the media app
    { source: "/upgrade", destination: "/upgrades" },
    {
      source: "/upgrades/larger-transaction-size",
      destination: "/upgrades/larger-transaction-sizes",
    },

    // /scholars applications moved from the built-in form to Typeform
    {
      source: "/scholars/apply",
      destination: "https://solanafoundation.typeform.com/scholars",
    },

    { source: "/reddit", destination: "https://reddit.com/r/solana" },
    { source: "/telegram", destination: "https://t.me/solana" },
    {
      source: "/github",
      destination: "https://github.com/solana-foundation/solana-com",
    },
    { source: "/twitter", destination: "https://twitter.com/solana" },
    {
      source: "/youtube",
      destination: "https://www.youtube.com/SolanaFndn",
    },
    {
      source: "/discord",
      destination: "https://discord.gg/kBbATFA7PW",
    },
    {
      source: "/skyline",
      destination: "https://lu.ma/solana-nyc",
    },
    {
      source: "/solana_token_extensions_paper",
      destination:
        "https://drive.google.com/file/d/13u20-ItOcNXQpqlO3JHrC1eYhtz1PilE/view?usp=sharing",
    },
    {
      source: "/tokenized-equities",
      destination: "/reports/tokenized-equities",
    },
    { source: "/blog", destination: "/news" },
    { source: "/rss.xml", destination: "/news/rss.xml" },
    { source: "/rss", destination: "/news/rss.xml" },
    { source: "/feed.xml", destination: "/news/rss.xml" },
    {
      source: "/sitemap-0.xml",
      destination: "/sitemap.xml",
      localeDestination: "/sitemap.xml",
    },
    {
      source: "/sitemap-index.xml",
      destination: "/sitemap.xml",
      localeDestination: "/sitemap.xml",
    },
    {
      source: "/sitemap_index.xml",
      destination: "/sitemap.xml",
      localeDestination: "/sitemap.xml",
    },
    { source: "/news/tag/:path*", destination: "/news" },
    {
      source: "/news/solana-changelog-agave-v4-1-0-rpc-2-0-and-alpenglow",
      destination: "/news/solana-changelog-july-2-2026",
      permanent: true,
    },
    // /upgrades is now the source of truth for network upgrade status;
    // this hub post is retired.
    {
      source: "/news/solana-network-upgrades",
      destination: "/upgrades",
    },
    {
      source: "/news/solana-scaffold-part-1-wallet-adapter",
      destination:
        "/developers/guides/getstarted/full-stack-solana-development",
    },
    {
      source: "/news/solana-scaffold-part-2-wallet-balance",
      destination:
        "/developers/guides/getstarted/full-stack-solana-development",
    },
    {
      source: "/news/getting-started-with-solana-development",
      destination: "/developers/docs",
    },
    {
      source: "/install",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/cli",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/setup",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/simd",
      destination:
        "https://github.com/solana-foundation/solana-improvement-documents",
    },
    { source: "/disclaimer", destination: "/tos" },
    { source: "/ecosystem/:path+", destination: "/ecosystem" },
    { source: "/lolla", destination: "/" },
    { source: "/solana-pay", destination: "https://solanapay.com/" },
    { source: "/solanapay", destination: "https://solanapay.com/" },
    { source: "/pay", destination: "https://solanapay.com/" },
    { source: "/mobile", destination: "https://solanamobile.com/" },
    {
      source: "/podcast",
      destination: "/podcasts",
    },
    {
      source: "/validated",
      destination: "/podcasts/validated-with-austin-federa",
    },
    {
      source: "/validated/:path*",
      destination: "/podcasts/validated-with-austin-federa",
    },
    { source: "/careers", destination: "https://jobs.solana.com" },
    { source: "/jobs", destination: "https://jobs.solana.com" },
    {
      source: "/austin",
      destination: "https://calendly.com/solana-austin",
    },
    {
      source: "/dev-update",
      destination:
        "https://solana.us17.list-manage.com/subscribe?u=dc5b8a6eb6dc3d737579c03c9&id=4a4784c804",
    },
    { source: "/hackathon", destination: "/hackathons" },
    { source: "/ignition", destination: "/hackathons" },
    { source: "/solanaszn", destination: "/hackathons" },
    { source: "/wormhole-hackathon", destination: "/hackathons" },
    { source: "/defi", destination: "/hackathons" },
    { source: "/riptide(.*)", destination: "/hackathons" },
    { source: "/summercamp(.*)", destination: "/hackathons" },
    { source: "/grizzlython(.*)", destination: "/hackathons" },
    { source: "/hyperdrive(.*)", destination: "/hackathons" },
    { source: "/developers/ai", destination: "/solutions/ai" },
    { source: "/ai", destination: "/solutions/ai" },
    { source: "/developer", destination: "/developers" },
    { source: "/token22", destination: "/solutions/token-extensions" },
    {
      source: "/solutions/token22",
      destination: "/solutions/token-extensions",
    },
    {
      source: "/tokenextensions",
      destination: "/solutions/token-extensions",
    },
    {
      source: "/solutions/tokenextensions",
      destination: "/solutions/token-extensions",
    },
    {
      source: "/token-extensions",
      destination: "/solutions/token-extensions",
    },
    {
      source: "/solutions/commerce-and-payments",
      destination: "/solutions/institutional-payments",
    },
    {
      source: "/solutions/games-tooling",
      destination:
        "/developers/cookbook/games/getting-started-with-game-development",
    },
    {
      source: "/solutions/solana-permissioned-environments",
      destination: "https://launch.solana.com/products/contra",
    },
    {
      source: "/2024-outlook",
      destination: "/2024outlook",
    },
    {
      source: "/community/report-2024-newsletter-sign-up",
      destination: "/news/state-of-solana-breakpoint-2024",
      permanent: true,
    },
    {
      source: "/nftshowdown",
      destination: "/news/solana-nft-showdown-winners",
      permanent: true,
    },
    {
      source: "/playgg",
      destination: "/news/solana-solstice-2023-community-review",
      permanent: true,
    },
    {
      source: "/collective",
      destination: "https://www.solanacollective.com/",
    },
    {
      source: "/meta",
      destination: "/",
    },
    {
      source: "/developers/guides/getstarted/setup-local-development",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/environment",
      destination: "https://climate.solana.com/",
    },
    ...breakpointSubrouteRedirects,
    { source: "/breakpoint/side-events", destination: "/breakpoint" },
    {
      source: "/verifiable-builds",
      destination:
        "/developers/docs/programs/verified-builds#install-the-solana-verify-cli",
    },
    // content redirects:
    {
      source: "/docs/actions",
      destination: "/developers/docs/tools/actions",
    },
    {
      source: "/docs/blinks",
      destination: "/developers/docs/tools/actions",
    },
    {
      source: "/docs/advanced/blinks",
      destination: "/developers/docs/tools/actions",
    },
    {
      source: "/docs/advanced",
      destination: "/developers/docs/core/transactions/confirmation",
    },
    {
      source: "/docs/core/transactions/retry",
      destination: "/developers/cookbook/transactions/retry",
    },
    {
      source: "/docs/core/transactions/versions",
      destination: "/developers/docs/core/transactions/versioned-transactions",
    },
    // /docs/core/rent and /docs/core/transactions/confirmation are pages
    // again (new concept pages, spec §6.1), so their old redirects are gone.
    {
      source: "/docs/intro/rent",
      destination: "/developers/docs/core/rent",
    },
    {
      source: "/docs/intro/transaction_fees",
      destination: "/developers/docs/core/fees",
    },
    {
      source: "/docs/intro/transaction-fees",
      destination: "/developers/docs/core/fees",
    },
    {
      source: "/docs/core/runtime",
      destination: "/developers/docs/core/fees",
    },
    {
      source: "/docs/intro/economics",
      destination: "/staking",
    },
    {
      source: "/docs/economics/inflation/inflation_schedule",
      destination: "/staking",
    },
    {
      source: "/docs/intro/history",
      destination: "/learn/what-is-solana",
    },
    {
      source: "/docs/intro",
      destination: "/developers/docs",
    },
    {
      source: "/docs/intro/overview",
      destination: "/developers/docs",
    },
    {
      source: "/developers/guides/getstarted/setup-local-development",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/docs/install",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/install",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/setup",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/docs/programs/debugging",
      // Legacy chain ended on anchor-lang.com via /docs/programs/anchor/:path*.
      destination: "https://www.anchor-lang.com/docs",
    },
    {
      source: "/docs/programs/lang-c",
      // Legacy chain ended on anchor-lang.com via /docs/programs/anchor/:path*.
      destination: "https://www.anchor-lang.com/docs",
    },
    {
      source: "/docs/programs/overview",
      // Legacy chain ended on anchor-lang.com via /docs/programs/anchor/:path*.
      destination: "https://www.anchor-lang.com/docs",
    },
    {
      source: "/docs/programs/lang-rust",
      destination: "/developers/docs/programs/rust",
    },
    {
      source: "/docs/rpc/getConfirmedBlock",
      destination: "/developers/docs/rpc/deprecated/getconfirmedblock",
    },
    {
      source: "/docs/rpc/http/getConfirmedBlock",
      destination: "/developers/docs/rpc/deprecated/getconfirmedblock",
    },
    {
      source: "/docs/rpc/getConfirmedBlocks",
      destination: "/developers/docs/rpc/deprecated/getconfirmedblocks",
    },
    {
      source: "/docs/rpc/http/getConfirmedBlocks",
      destination: "/developers/docs/rpc/deprecated/getconfirmedblocks",
    },
    {
      source: "/docs/rpc/getConfirmedBlocksWithLimit",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedblockswithlimit",
    },
    {
      source: "/docs/rpc/http/getConfirmedBlocksWithLimit",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedblockswithlimit",
    },
    {
      source: "/docs/rpc/getConfirmedSignaturesForAddress2",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/http/getConfirmedSignaturesForAddress2",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/getSignaturesForAddress2",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/http/getSignaturesForAddress2",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/deprecated/getSignaturesForAddress2",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/http/getconfirmedsignaturesforaddress",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/deprecated/getconfirmedsignaturesforaddress",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/getconfirmedsignaturesforaddress",
      destination:
        "/developers/docs/rpc/deprecated/getconfirmedsignaturesforaddress2",
    },
    {
      source: "/docs/rpc/getConfirmedTransaction",
      destination: "/developers/docs/rpc/deprecated/getconfirmedtransaction",
    },
    {
      source: "/docs/rpc/http/getConfirmedTransaction",
      destination: "/developers/docs/rpc/deprecated/getconfirmedtransaction",
    },
    {
      source: "/docs/rpc/getFeeCalculatorForBlockhash",
      destination:
        "/developers/docs/rpc/deprecated/getfeecalculatorforblockhash",
    },
    {
      source: "/docs/rpc/http/getFeeCalculatorForBlockhash",
      destination:
        "/developers/docs/rpc/deprecated/getfeecalculatorforblockhash",
    },
    {
      source: "/docs/rpc/getFeeRateGovernor",
      destination: "/developers/docs/rpc/deprecated/getfeerategovernor",
    },
    {
      source: "/docs/rpc/http/getFeeRateGovernor",
      destination: "/developers/docs/rpc/deprecated/getfeerategovernor",
    },
    {
      source: "/docs/rpc/getFees",
      destination: "/developers/docs/rpc/deprecated/getfees",
    },
    {
      source: "/docs/rpc/http/getFees",
      destination: "/developers/docs/rpc/deprecated/getfees",
    },
    {
      source: "/docs/rpc/http/getRecentBlockhash",
      destination: "/developers/docs/rpc/deprecated/getrecentblockhash",
    },
    {
      source: "/docs/rpc/getRecentBlockhash",
      destination: "/developers/docs/rpc/deprecated/getrecentblockhash",
    },
    {
      source: "/docs/rpc/http/getSnapshotSlot",
      destination: "/developers/docs/rpc/deprecated/getsnapshotslot",
    },
    {
      source: "/docs/rpc/getSnapshotSlot",
      destination: "/developers/docs/rpc/deprecated/getsnapshotslot",
    },
    {
      source: "/docs/rpc/http/getStakeActivation",
      destination: "/developers/docs/rpc/deprecated/getstakeactivation",
    },
    {
      source: "/docs/rpc/getAccountInfo",
      destination: "/developers/docs/rpc/http/getaccountinfo",
    },
    {
      source: "/docs/rpc/getBalance",
      destination: "/developers/docs/rpc/http/getbalance",
    },
    {
      source: "/docs/rpc/getBlock",
      destination: "/developers/docs/rpc/http/getblock",
    },
    {
      source: "/docs/rpc/getBlockCommitment",
      destination: "/developers/docs/rpc/http/getblockcommitment",
    },
    {
      source: "/docs/rpc/getBlockHeight",
      destination: "/developers/docs/rpc/http/getblockheight",
    },
    {
      source: "/docs/rpc/getBlockProduction",
      destination: "/developers/docs/rpc/http/getblockproduction",
    },
    {
      source: "/docs/rpc/getBlocks",
      destination: "/developers/docs/rpc/http/getblocks",
    },
    {
      source: "/docs/rpc/getBlocksWithLimit",
      destination: "/developers/docs/rpc/http/getblockswithlimit",
    },
    {
      source: "/docs/rpc/getBlockTime",
      destination: "/developers/docs/rpc/http/getblocktime",
    },
    {
      source: "/docs/rpc/getClusterNodes",
      destination: "/developers/docs/rpc/http/getclusternodes",
    },
    {
      source: "/docs/rpc/getEpochInfo",
      destination: "/developers/docs/rpc/http/getepochinfo",
    },
    {
      source: "/docs/rpc/getEpochSchedule",
      destination: "/developers/docs/rpc/http/getepochschedule",
    },
    {
      source: "/docs/rpc/getFeeForMessage",
      destination: "/developers/docs/rpc/http/getfeeformessage",
    },
    {
      source: "/docs/rpc/getFirstAvailableBlock",
      destination: "/developers/docs/rpc/http/getfirstavailableblock",
    },
    {
      source: "/docs/rpc/getGenesisHash",
      destination: "/developers/docs/rpc/http/getgenesishash",
    },
    {
      source: "/docs/rpc/getHealth",
      destination: "/developers/docs/rpc/http/gethealth",
    },
    {
      source: "/docs/rpc/getHighestSnapshotSlot",
      destination: "/developers/docs/rpc/http/gethighestsnapshotslot",
    },
    {
      source: "/docs/rpc/getIdentity",
      destination: "/developers/docs/rpc/http/getidentity",
    },
    {
      source: "/docs/rpc/getInflationGovernor",
      destination: "/developers/docs/rpc/http/getinflationgovernor",
    },
    {
      source: "/docs/rpc/getInflationRate",
      destination: "/developers/docs/rpc/http/getinflationrate",
    },
    {
      source: "/docs/rpc/getInflationReward",
      destination: "/developers/docs/rpc/http/getinflationreward",
    },
    {
      source: "/docs/rpc/getLargestAccounts",
      destination: "/developers/docs/rpc/http/getlargestaccounts",
    },
    {
      source: "/docs/rpc/getLatestBlockhash",
      destination: "/developers/docs/rpc/http/getlatestblockhash",
    },
    {
      source: "/docs/rpc/getLeaderSchedule",
      destination: "/developers/docs/rpc/http/getleaderschedule",
    },
    {
      source: "/docs/rpc/getMaxRetransmitSlot",
      destination: "/developers/docs/rpc/http/getmaxretransmitslot",
    },
    {
      source: "/docs/rpc/getMaxShredInsertSlot",
      destination: "/developers/docs/rpc/http/getmaxshredinsertslot",
    },
    {
      source: "/docs/rpc/getMinimumBalanceForRentExemption",
      destination:
        "/developers/docs/rpc/http/getminimumbalanceforrentexemption",
    },
    {
      source: "/docs/rpc/getMultipleAccounts",
      destination: "/developers/docs/rpc/http/getmultipleaccounts",
    },
    {
      source: "/docs/rpc/getProgramAccounts",
      destination: "/developers/docs/rpc/http/getprogramaccounts",
    },
    {
      source: "/docs/rpc/getRecentPerformanceSamples",
      destination: "/developers/docs/rpc/http/getrecentperformancesamples",
    },
    {
      source: "/docs/rpc/getRecentPrioritizationFees",
      destination: "/developers/docs/rpc/http/getrecentprioritizationfees",
    },
    {
      source: "/docs/rpc/getSignaturesForAddress",
      destination: "/developers/docs/rpc/http/getsignaturesforaddress",
    },
    {
      source: "/docs/rpc/getSignatureStatuses",
      destination: "/developers/docs/rpc/http/getsignaturestatuses",
    },
    {
      source: "/docs/rpc/getSlot",
      destination: "/developers/docs/rpc/http/getslot",
    },
    {
      source: "/docs/rpc/getSlotLeader",
      destination: "/developers/docs/rpc/http/getslotleader",
    },
    {
      source: "/docs/rpc/getSlotLeaders",
      destination: "/developers/docs/rpc/http/getslotleaders",
    },
    {
      source: "/docs/rpc/getStakeMinimumDelegation",
      destination: "/developers/docs/rpc/http/getstakeminimumdelegation",
    },
    {
      source: "/docs/rpc/getSupply",
      destination: "/developers/docs/rpc/http/getsupply",
    },
    {
      source: "/docs/rpc/getTokenAccountBalance",
      destination: "/developers/docs/rpc/http/gettokenaccountbalance",
    },
    {
      source: "/docs/rpc/getTokenAccountsByDelegate",
      destination: "/developers/docs/rpc/http/gettokenaccountsbydelegate",
    },
    {
      source: "/docs/rpc/getTokenAccountsByOwner",
      destination: "/developers/docs/rpc/http/gettokenaccountsbyowner",
    },
    {
      source: "/docs/rpc/getTokenLargestAccounts",
      destination: "/developers/docs/rpc/http/gettokenlargestaccounts",
    },
    {
      source: "/docs/rpc/getTokenSupply",
      destination: "/developers/docs/rpc/http/gettokensupply",
    },
    {
      source: "/docs/rpc/getTransaction",
      destination: "/developers/docs/rpc/http/gettransaction",
    },
    {
      source: "/docs/rpc/getTransactionCount",
      destination: "/developers/docs/rpc/http/gettransactioncount",
    },
    {
      source: "/docs/rpc/getVersion",
      destination: "/developers/docs/rpc/http/getversion",
    },
    {
      source: "/docs/rpc/getVoteAccounts",
      destination: "/developers/docs/rpc/http/getvoteaccounts",
    },
    {
      source: "/docs/rpc/isBlockhashValid",
      destination: "/developers/docs/rpc/http/isblockhashvalid",
    },
    {
      source: "/docs/rpc/minimumLedgerSlot",
      destination: "/developers/docs/rpc/http/minimumledgerslot",
    },
    {
      source: "/docs/rpc/requestAirdrop",
      destination: "/developers/docs/rpc/http/requestairdrop",
    },
    {
      source: "/docs/rpc/sendTransaction",
      destination: "/developers/docs/rpc/http/sendtransaction",
    },
    {
      source: "/docs/rpc/simulateTransaction",
      destination: "/developers/docs/rpc/http/simulatetransaction",
    },
    {
      source: "/docs/rpc/accountSubscribe",
      destination: "/developers/docs/rpc/websocket/accountsubscribe",
    },
    {
      source: "/docs/rpc/accountUnsubscribe",
      destination: "/developers/docs/rpc/websocket/accountunsubscribe",
    },
    {
      source: "/docs/rpc/blockSubscribe",
      destination: "/developers/docs/rpc/websocket/blocksubscribe",
    },
    {
      source: "/docs/rpc/blockUnsubscribe",
      destination: "/developers/docs/rpc/websocket/blockunsubscribe",
    },
    {
      source: "/docs/rpc/logsSubscribe",
      destination: "/developers/docs/rpc/websocket/logssubscribe",
    },
    {
      source: "/docs/rpc/logsUnsubscribe",
      destination: "/developers/docs/rpc/websocket/logsunsubscribe",
    },
    {
      source: "/docs/rpc/programSubscribe",
      destination: "/developers/docs/rpc/websocket/programsubscribe",
    },
    {
      source: "/docs/rpc/programUnsubscribe",
      destination: "/developers/docs/rpc/websocket/programunsubscribe",
    },
    {
      source: "/docs/rpc/rootSubscribe",
      destination: "/developers/docs/rpc/websocket/rootsubscribe",
    },
    {
      source: "/docs/rpc/rootUnsubscribe",
      destination: "/developers/docs/rpc/websocket/rootunsubscribe",
    },
    {
      source: "/docs/rpc/signatureSubscribe",
      destination: "/developers/docs/rpc/websocket/signaturesubscribe",
    },
    {
      source: "/docs/rpc/signatureUnsubscribe",
      destination: "/developers/docs/rpc/websocket/signatureunsubscribe",
    },
    {
      source: "/docs/rpc/slotSubscribe",
      destination: "/developers/docs/rpc/websocket/slotsubscribe",
    },
    {
      source: "/docs/rpc/slotsUpdatesSubscribe",
      destination: "/developers/docs/rpc/websocket/slotsupdatessubscribe",
    },
    {
      source: "/docs/rpc/slotsUpdatesUnsubscribe",
      destination: "/developers/docs/rpc/websocket/slotsupdatesunsubscribe",
    },
    {
      source: "/docs/rpc/slotUnsubscribe",
      destination: "/developers/docs/rpc/websocket/slotunsubscribe",
    },
    {
      source: "/docs/rpc/voteSubscribe",
      destination: "/developers/docs/rpc/websocket/votesubscribe",
    },
    {
      source: "/docs/rpc/voteUnsubscribe",
      destination: "/developers/docs/rpc/websocket/voteunsubscribe",
    },
    {
      source: "/developers/cookbook/tokens",
      destination: "/developers/docs/tokens/basics",
    },
    {
      source: "/developers/cookbook/transactions/send-tokens",
      destination: "/developers/docs/tokens/basics/transfer-tokens",
    },
    {
      source: "/developers/guides/introduction-to-durable-nonces",
      destination: "/developers/cookbook/transactions/durable-nonces",
    },
    {
      source: "/developers/guides/advanced/stake-weighted-qos-guide",
      destination: "/developers/docs/defi/stake-weighted-qos",
    },
    {
      source: "/developers/guides/hello-world-in-your-browser",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/guides/solana-playground",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/guides/solang/solang-getting-started",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/guides/solang-getting-started",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/guides/getstarted/hello-world-in-your-browser",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/guides/local-rust-hello-world",
      destination: "/developers/docs/programs/rust",
    },
    {
      source: "/developers/guides/wallets-explained",
      destination: "/wallets",
    },
    {
      source: "/developers/guides/compressed-nfts",
      destination: "https://www.zkcompression.com",
    },
    {
      source: "/developers/guides/get-program-accounts",
      destination: "/developers/docs/rpc/http/getprogramaccounts",
    },
    {
      source: "/docs/more/exchange",
      destination: "/developers/docs/defi/exchange",
    },
    {
      source: "/developers/guides/getstarted/intro-to-native-rust",
      destination: "/developers/docs/programs/rust",
    },
    {
      source: "/docs/clients/javascript-reference",
      destination: "/developers/cookbook",
    },
    {
      // `:path+`, not `:path*`: /docs/programs/anchor itself is the new
      // "Anchor framework" overview page (spec §6.1); only old subpages leave.
      source: "/docs/programs/anchor/:path+",
      destination: "https://www.anchor-lang.com/docs",
    },
    {
      source: "/docs/intro/dev",
      destination: "/developers/docs",
    },
    {
      source: "/docs/intro/wallets",
      destination: "/wallets",
    },
    {
      source: "/developers/resources",
      destination: "/developers/docs",
    },
    {
      source: "/docs/core/clusters",
      destination: "/developers/docs/references/clusters",
    },
    {
      source: "/docs/economics/:path*",
      destination: "/staking",
    },
    {
      source: "/docs/advanced/:path*",
      destination: "/developers/guides/advanced/:path*",
    },
    {
      source: "/developers/guides/games/game-sdks",
      destination: "/developers/docs/clients/community/game-sdks",
    },
    {
      source: "/accelerate/scale-or-die",
      destination: "/accelerate",
    },
    {
      source: "/accelerate/ship-or-die",
      destination: "/accelerate",
    },
    {
      source: "/accelerate/tickets",
      destination: "/accelerate",
    },
    {
      source: "/docs/terminology",
      destination: "/developers/docs/references/terminology",
    },
    {
      source: "/docs/core/tokens",
      destination: "/developers/docs/tokens",
    },
    {
      source: "/developers/guides/getstarted/how-to-cpi",
      destination: "/developers/docs/core/cpi",
    },
    {
      source: "/developers/guides/getstarted/how-to-cpi-with-signer",
      destination: "/developers/docs/core/cpi",
    },
    {
      source: "/developers/cookbook/programs/:path*",
      destination: "/developers/docs/programs/examples",
    },
    {
      source: "/developers/cookbook/accounts/create-pda-account",
      destination: "/developers/docs/core/pda",
    },
    {
      source: "/developers/cookbook/accounts/sign-with-pda",
      destination: "/developers/docs/core/cpi",
    },
    {
      source: "/developers/cookbook/accounts/close-account",
      destination: "/developers/docs/core/accounts",
    },
    {
      source: "/developers/guides/intro/wallets-explained",
      destination: "/wallets",
    },
    {
      source: "/developers/guides/javascript/get-program-accounts",
      destination: "/developers/docs/rpc/http/getprogramaccounts",
    },
    {
      source: "/developers/guides/javascript/compressed-nfts",
      destination: "https://www.zkcompression.com",
    },
    {
      source: "/developers/guides/getstarted/evm-to-svm",
      destination: "/developers/evm-to-svm",
    },
    {
      source: "/developers/guides/getstarted/how-to-create-a-token",
      destination: "/developers/docs/tokens",
    },
    {
      source: "/developers/guides/getstarted/local-rust-hello-world",
      destination: "/developers/docs/programs/rust",
    },
    {
      source: "/developers/guides/getstarted/rust-to-solana",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/guides/getstarted/scaffold-nextjs-anchor",
      destination: "/developers/docs#deploy-your-first-solana-application",
    },
    {
      source: "/developers/guides/wallets/add-solana-wallet-adapter-to-nextjs",
      destination: "/developers/cookbook/wallets/connect-wallet-react",
    },
    {
      source: "/developers/guides/advanced/state-compression",
      destination: "https://www.zkcompression.com",
    },
    {
      source: "/developers/guides/advanced/testing-with-jest-and-bankrun",
      destination: "https://www.anchor-lang.com/docs/testing/litesvm",
    },
    {
      source: "/developers/guides/dapps/cash-app",
      destination: "https://docs.solanamobile.com/developers/overview",
    },
    {
      source: "/developers/guides/getstarted/full-stack-solana-development",
      destination: "/developers/docs#deploy-your-first-solana-application",
    },
    {
      source: "/docs/toolkit/:path*",
      destination: "/developers/docs/quickstart",
    },
    {
      source: "/developers/cookbook/tokens/create-nft",
      destination:
        "https://www.metaplex.com/docs/smart-contracts/core/create-asset",
    },
    {
      source: "/developers/cookbook/tokens/fetch-nft-metadata",
      destination: "https://developers.metaplex.com/core",
    },
    {
      source: "/developers/cookbook/tokens/get-nft-owner",
      destination: "https://developers.metaplex.com/core",
    },
    {
      source: "/developers/cookbook/tokens/fetch-all-nfts",
      destination: "https://developers.metaplex.com/core",
    },
    {
      source: "/docs/programs/faq",
      destination: "https://solana.stackexchange.com",
    },
    // The locale-only faq.mdx files were removed (R8); their `.md` twins
    // would otherwise 404.
    {
      source: "/docs/programs/faq.md",
      destination: "https://solana.stackexchange.com",
    },
    {
      source: "/news/blog-solana-bench",
      destination: "/news/solana-bench",
    },
    {
      source: "/docs/references/feature-gates/consume-cus-on-sbpf-failure",
      destination:
        "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0182-conditional-cu-metering.md",
      permanent: true,
    },
    {
      source: "/docs/references/feature-gates/direct-mapping",
      destination:
        "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0219-stricter-abi-and-runtime-constraints.md",
      permanent: true,
    },
    {
      source: "/docs/references/feature-gates/reserve-minimal-cus-for-builtins",
      destination:
        "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0170-builtin-instruction-cost-and-budget.md",
      permanent: true,
    },
    {
      source:
        "/docs/references/feature-gates/tsynmcspg4xficj1v3tdb4c7crmr5tsbhlz4sf7rrna",
      destination:
        "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0138-deprecate-legacy-vote-instructions.md",
      permanent: true,
    },
    {
      source: "/docs/references/feature-gates/:path*",
      destination:
        "https://github.com/anza-xyz/agave/wiki/Feature-Gate-Tracker-Schedule",
      permanent: true,
    },
    {
      source: "/developers/cookbook/tokens/approve-token-delegate",
      destination: "/developers/docs/tokens/basics/approve-delegate",
    },
    {
      source: "/developers/cookbook/tokens/burn-tokens",
      destination: "/developers/docs/tokens/basics/burn-tokens",
    },
    {
      source: "/developers/cookbook/tokens/close-token-accounts",
      destination: "/developers/docs/tokens/basics/close-account",
    },
    {
      source: "/developers/cookbook/tokens/create-mint-account",
      destination: "/developers/docs/tokens/basics/create-mint",
    },
    {
      source: "/developers/cookbook/tokens/create-token-account",
      destination: "/developers/docs/tokens/basics/create-token-account",
    },
    {
      source: "/developers/cookbook/tokens/mint-tokens",
      destination: "/developers/docs/tokens/basics/mint-tokens",
    },
    {
      source: "/developers/cookbook/tokens/revoke-token-delegate",
      destination: "/developers/docs/tokens/basics/revoke-delegate",
    },
    {
      source: "/developers/cookbook/tokens/set-update-token-authority",
      destination: "/developers/docs/tokens/basics/set-authority",
    },
    {
      source: "/developers/cookbook/tokens/transfer-tokens",
      destination: "/developers/docs/tokens/basics/transfer-tokens",
    },
    {
      source: "/developers/cookbook/tokens/manage-wrapped-sol",
      destination: "/developers/docs/tokens/basics/sync-native",
    },
    {
      source: "/developers/guides/advanced/verified-builds",
      destination: "/developers/docs/programs/verified-builds",
    },
    {
      source: "/developers/courses",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses",
    },
    {
      source: "/developers/courses/intro-to-solana/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/intro-to-solana",
    },
    {
      source: "/developers/courses/program-optimization/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/program-optimization",
    },
    {
      source: "/developers/courses/token-extensions/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/token-extensions",
    },
    {
      source: "/developers/courses/solana-pay/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/solana-pay",
    },
    {
      source: "/developers/courses/tokens-and-nfts/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/tokens-and-nfts",
    },
    {
      source: "/developers/courses/mobile/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/mobile",
    },
    {
      source: "/developers/courses/program-security/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/program-security",
    },
    {
      source: "/developers/courses/native-onchain-development/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/native-onchain-development",
    },
    {
      source: "/developers/courses/offline-transactions/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/offline-transactions",
    },
    {
      source: "/developers/courses/onchain-development/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/onchain-development",
    },
    {
      source: "/developers/courses/state-compression/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/state-compression",
    },
    {
      source: "/developers/courses/connecting-to-offchain-data/:path*",
      destination:
        "https://github.com/solana-foundation/developer-content/tree/main/content/courses/connecting-to-offchain-data",
    },
    {
      source: "/developers/guides/immutable-owner",
      destination: "/developers/docs/tokens/extensions/immutable-owner",
    },
    {
      source: "/developers/guides/token-extensions/default-account-state",
      destination: "/developers/docs/tokens/extensions/default-state",
    },
    {
      source: "/developers/guides/token-extensions/immutable-owner",
      destination: "/developers/docs/tokens/extensions/immutable-owner",
    },
    {
      source: "/developers/guides/token-extensions/interest-bearing-tokens",
      destination: "/developers/docs/tokens/extensions/interest-bearing-tokens",
    },
    {
      source: "/developers/guides/token-extensions/required-memo",
      destination: "/developers/docs/tokens/extensions/memo-transfer",
    },
    {
      source: "/developers/guides/token-extensions/mint-close-authority",
      destination: "/developers/docs/tokens/extensions/close-mint",
    },
    {
      source: "/developers/guides/token-extensions/non-transferable",
      destination:
        "/developers/docs/tokens/extensions/non-transferrable-tokens",
    },
    {
      source: "/developers/guides/token-extensions/permanent-delegate",
      destination: "/developers/docs/tokens/extensions/permanent-delegate",
    },
    {
      source: "/developers/guides/token-extensions/transfer-fee",
      destination: "/developers/docs/tokens/extensions/transfer-fees",
    },
    {
      source: "/developers/guides/token-extensions/metadata-pointer",
      destination: "/developers/docs/tokens/extensions/metadata",
    },
    {
      source: "/developers/guides/token-extensions/reallocate",
      destination: "/developers/docs/tokens/extensions",
    },
    {
      source: "/developers/guides/token-extensions/getting-started",
      destination: "/developers/docs/tokens/extensions",
    },
    {
      source: "/developers/guides/advanced/how-to-use-priority-fees",
      destination: "/developers/docs/core/fees",
    },
    {
      source: "/developers/guides/advanced/how-to-request-optimal-compute",
      destination: "/developers/cookbook/transactions/optimize-compute",
    },
    {
      source: "/developers/guides/getstarted/full-stack-solana-development",
      destination: "/developers/cookbook/development/crud-dapp",
    },
    {
      source: "/developers/guides/getstarted/solana-test-validator",
      destination: "/developers/docs/intro/installation/surfpool-cli-basics",
    },
    {
      source: "/developers/cookbook/development/start-local-validator",
      destination: "/developers/docs/intro/installation/surfpool-cli-basics",
    },
    {
      source:
        "/developers/cookbook/development/using-mainnet-accounts-programs",
      destination: "/developers/docs/intro/installation/surfpool-cli-basics",
    },
    // Keep last: every other /docs URL moves to /developers/docs.
    ...docsPrefixMoveRedirects,
  ]),
};
