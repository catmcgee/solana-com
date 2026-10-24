import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const assetPrefix = "/templates-assets";

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
  trailingSlash: false,
  assetPrefix,

  env: {
    NEXT_PUBLIC_APP_NAME: "templates",
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
    path: `${assetPrefix}/_next/image`,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/solana-foundation/templates/**",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },

  experimental: {
    // Allow importing/transpiling code from workspace packages
    externalDir: true,
  },

  compiler: {
    styledComponents: true,
  },

  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/templates-assets/_next/:path+",
          destination: "/_next/:path+",
        },
      ],
    };
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withSentryConfig(withNextIntl(nextConfig), {
  org: "solana-fndn",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
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
