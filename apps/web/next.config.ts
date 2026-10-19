// trigger preview build
import createNextIntlPlugin from "next-intl/plugin";
import { withBotId } from "botid/next/config";
import rewritesAndRedirectsJson, {
  mintlifyRewrites,
} from "./rewrites-redirects";
import type { NextConfig } from "next";
import type { Redirect, Rewrite } from "next/dist/lib/load-custom-routes";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { getSecurityHeaders } from "./src/lib/security-headers";

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
  productionBrowserSourceMaps: false,
  trailingSlash: false,
  transpilePackages: ["gsap"],
  // The Mintlify rewrite table, for the docs head injection in
  // src/proxy.ts: it fetches a docs page from the same upstream URL the
  // beforeFiles rewrite would use. Inlined at build time, like the rewrites.
  env: {
    DOCS_MINTLIFY_REWRITES: JSON.stringify(
      mintlifyRewrites.map(({ source, destination }) => ({
        source,
        destination,
      })),
    ),
  },
  // The epoch1000 OG card reads font files from disk at request time
  outputFileTracingIncludes: {
    "/api/epoch1000/og": ["./assets/fonts/epoch1000/*.woff"],
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
      // The docs head stylesheet (src/lib/docs-edge/head-inject.ts) is
      // requested as /docs-head.css?v=<content hash>, so it can be cached
      // for a year.
      {
        source: "/docs-head.css",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Applies to every path, including the docs that rewrites-redirects.ts
      // proxies to Mintlify (/docs, /:locale/docs, /learn/*,
      // /developers/{cookbook,bootcamp}, /_mintlify, /mintlify-assets,
      // /docs-assets): X-Frame-Options, nosniff, X-XSS-Protection and
      // frame-ancestors, plus X-Robots-Tag: noindex on previews (spec §5.12).
      // No cache headers are added for docs paths; Mintlify's own
      // Cache-Control passes through.
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
  const plugins = [
    withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" }),
    withNextIntl,
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
  disableLogger: true,
  automaticVercelMonitors: true,
  sourcemaps: {
    disable:
      process.env.VERCEL_ENV !== "production" || !process.env.SENTRY_AUTH_TOKEN,
  },
});
