import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Vercel preview deployments (staging) block every crawler and list no
  // sitemaps. The web app already sends X-Robots-Tag: noindex on previews
  // (next.config.ts). See migration/PRE_PRODUCTION.md.
  if (process.env.VERCEL_ENV === "preview") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: [
      "https://solana.com/sitemap.xml",
      "https://solana.com/news/sitemap-news.xml",
      "https://solana.com/podcasts/sitemap.xml",
    ],
  };
}
