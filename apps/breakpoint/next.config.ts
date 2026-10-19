import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withBotId } from "botid/next/config";
import { locales } from "@workspace/i18n/config";
import { createNextIntlPlugin } from "@workspace/i18n/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const assetPrefix = "/breakpoint-assets";
const localeRoutePattern = `:locale(${locales.join("|")})`;

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
  assetPrefix,
  env: {
    NEXT_PUBLIC_APP_NAME: "breakpoint",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.lumacdn.com",
      },
      {
        protocol: "https",
        hostname: "**.lu.ma",
      },
    ],
  },
  experimental: {
    externalDir: true,
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
  async redirects() {
    return [
      {
        source: "/agenda",
        destination: "/schedule",
        permanent: true,
      },
      {
        source: `/${localeRoutePattern}/agenda`,
        destination: "/:locale/schedule",
        permanent: true,
      },
      {
        source: "/breakpoint/agenda",
        destination: "/breakpoint/schedule",
        permanent: true,
      },
      {
        source: `/${localeRoutePattern}/breakpoint/agenda`,
        destination: "/:locale/breakpoint/schedule",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/breakpoint-assets/_next/:path+",
          destination: "/_next/:path+",
        },
        {
          source: "/breakpoint-assets/assets/:path+",
          destination: "/assets/:path+",
        },
        {
          source: "/breakpoint-assets/img/:path+",
          destination: "/img/:path+",
        },
        {
          source: "/breakpoint-assets/live/:path+",
          destination: "/live/:path+",
        },
        {
          source: "/breakpoint",
          destination: "/",
        },
        {
          source: "/breakpoint/:path*",
          destination: "/:path*",
        },
        {
          source: "/:locale/breakpoint",
          destination: "/:locale",
        },
        {
          source: "/:locale/breakpoint/:path*",
          destination: "/:locale/:path*",
        },
      ],
    };
  },
};

export default withSentryConfig(withBotId(withNextIntl(nextConfig)), {
  org: "solana-fndn",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  sourcemaps: {
    disable:
      process.env.VERCEL_ENV !== "production" || !process.env.SENTRY_AUTH_TOKEN,
  },
});
