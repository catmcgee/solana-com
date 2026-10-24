// trigger preview build
import createNextIntlPlugin from "next-intl/plugin";
import { withBotId } from "botid/next/config";
import rewritesAndRedirectsJson from "./rewrites-redirects";
import type { NextConfig } from "next";
import type { Redirect, Rewrite } from "next/dist/lib/load-custom-routes";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { createMDX } from "fumadocs-mdx/next";
import { getSecurityHeaders } from "./src/lib/security-headers";
import {
  DOCS_SOURCE_GLOBS,
  DOCS_SOURCE_ROUTES,
} from "./docs-trace-includes.mjs";

// X-Frame-Options, nosniff, X-XSS-Protection, frame-ancestors, plus
// X-Robots-Tag: noindex on previews. Shared with the docs head injection in
// src/proxy.ts, which builds its own docs HTML responses.
const securityHeaders = getSecurityHeaders();

const svgrOptions = {
  svgoConfig: {
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
            removeUselessStrokeAndFill: false,
            cleanupIds: false,
          },
        },
      },
    ],
  },
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // apps/web keeps its own AGENTS.md; `next dev` must not rewrite it.
  agentRules: false,
  productionBrowserSourceMaps: false,
  trailingSlash: false,
  // Pages are TypeScript only; MDX is compiled by Fumadocs for the docs.
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  transpilePackages: ["gsap"],
  // The epoch1000 OG card reads font files from disk at request time
  outputFileTracingIncludes: {
    "/api/epoch1000/og": ["./assets/fonts/epoch1000/*.woff"],
    // The developer social images read their backgrounds and fonts.
    "/opengraph/developers/[[...slug]]": [
      "./public/img/og-backgrounds/*.jpg",
      "./public/img/logomark-color.svg",
      "./src/fonts/diatype/ABCDiatype-Medium.woff",
      "./src/fonts/diatype/ABCDiatype-Bold.woff",
    ],
    // Translated docs pages read their sources at request time
    // (docs-trace-includes.mjs; prerendered routes are covered by
    // scripts/trace-docs-sources.mjs after the build).
    ...Object.fromEntries(
      DOCS_SOURCE_ROUTES.map((route) => [route, DOCS_SOURCE_GLOBS]),
    ),
    // /llms.txt is the index generated in apps/docs.
    "/llms.txt": ["../docs/llms.txt"],
  },

  async rewrites() {
    const baseRewrites = rewritesAndRedirectsJson.rewrites as {
      beforeFiles: Array<Omit<Rewrite, "locale"> & { locale: false }>;
      afterFiles: Rewrite[];
      fallback: Rewrite[];
    };

    return baseRewrites;
  },

  async redirects() {
    const existingRedirects: Redirect[] = [
      {
        source: "/ai",
        destination: "/solutions/ai",
        permanent: true,
      },
      {
        source: "/news/tag/:tag*/page/:page*",
        destination: `/news/tag/:tag*`,
        permanent: true,
      },
      {
        source: "/news/tag",
        destination: `/news`,
        permanent: true,
      },
      {
        source: "/news/page",
        destination: `/news`,
        permanent: true,
      },
      ...rewritesAndRedirectsJson.redirects.map((redirect): Redirect => ({
        ...redirect,
        permanent: redirect.permanent ?? true,
      })),
    ];

    return existingRedirects;
  },

  // Turbopack (the Next.js 16 default bundler): `*.inline.svg` imports are
  // React components through SVGR, and every other `.svg` import is a URL
  // string, as the webpack config below gives `next build --webpack`.
  turbopack: {
    rules: {
      "*.svg": [
        {
          condition: { path: /\.inline\.svg$/ },
          loaders: [{ loader: "@svgr/webpack", options: svgrOptions }],
          as: "*.js",
        },
        {
          condition: { not: { path: /\.inline\.svg$/ } },
          type: "asset",
        },
      ],
    },
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.inline\.svg$/,
      use: {
        loader: "@svgr/webpack",
        options: svgrOptions,
      },
    });

    config.module.rules.push({
      test: /(?<!inline)\.svg$/,
      type: "asset",
    });

    return config;
  },

  images: {
    // Next.js 16 allows only quality 75 by default; these are the `quality`
    // props the app's next/image components use.
    qualities: [75, 90, 100],
    // Next.js 16 rejects local image URLs with a query string unless a
    // pattern allows it. The first entry is the Next.js 16 default (any local
    // path, no query); the second keeps the /api/media/image proxy
    // (src/lib/media/solution-news.ts), whose `path` query varies per image.
    localPatterns: [
      { pathname: "**", search: "" },
      { pathname: "/api/media/image" },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "**.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.lumacdn.com",
      },
      {
        protocol: "https",
        hostname: "**.lu.ma",
      },
      {
        protocol: "https",
        hostname: "solana-developer-content.vercel.app",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/solana-foundation/templates/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudfront.net",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "*.vercel.app",
        port: "",
      },
    ],
  },

  compiler: {
    styledComponents: true,
  },

  async headers() {
    return [
      {
        source: "/:path*.md",
        headers: [
          {
            key: "Content-Type",
            value: "text/markdown; charset=utf-8",
          },
        ],
      },
      // Applies to every path, docs included: X-Frame-Options, nosniff,
      // X-XSS-Protection and frame-ancestors, plus X-Robots-Tag: noindex on
      // previews.
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // `/:path*` does not cover the bare root, so repeat the rules for "/".
      {
        source: "/",
        headers: securityHeaders,
      },
    ];
  },

  experimental: {
    scrollRestoration: true,
    // Allow importing/transpiling code from the workspace package
    externalDir: true,
  },

  // Ignore deprecation warnings and mixed declaration warnings
  // https://github.com/vercel/next.js/issues/71638
  sassOptions: {
    logger: {
      warn: function (message: string) {
        if (
          message.includes("deprecat") ||
          message.includes("declarations that appear after nested")
        )
          return;
        console.warn(message);
      },
    },
  },
};

const moduleExports = (): NextConfig => {
  const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
  // Fumadocs MDX compiles the developer docs (source.config.ts).
  const withMDX = createMDX();
  const plugins = [
    withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" }),
    withNextIntl,
    withMDX,
  ];
  return plugins.reduce<NextConfig>((acc, next) => next(acc), nextConfig);
};

export default withSentryConfig(withBotId(moduleExports), {
  org: "solana-fndn",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  _experimental: {
    thirdPartyOriginStackFrames: true,
  },
  // Webpack builds only (`next build --webpack`); Turbopack has neither.
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
  sourcemaps: {
    disable:
      process.env.VERCEL_ENV !== "production" || !process.env.SENTRY_AUTH_TOKEN,
  },
});
