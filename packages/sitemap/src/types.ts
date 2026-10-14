export type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  /**
   * hreflang alternates, `{ languages: { en: url, fr: url, "x-default": url } }`
   * (same shape as Next.js MetadataRoute.Sitemap). Serialized as
   * `<xhtml:link rel="alternate">` by apps/web/scripts/generate-sitemap.ts.
   */
  alternates?: { languages: Record<string, string> };
};

export type RouteGenerator = () => Promise<SitemapEntry[]> | SitemapEntry[];
