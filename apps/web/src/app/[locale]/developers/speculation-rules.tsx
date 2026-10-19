import { localizedHref } from "@/data/developers/hub";

/**
 * Speculation Rules for /developers, so moving into the docs (Mintlify,
 * proxied on this origin) is close to instant:
 * - the docs home is prefetched as soon as the page loads (`immediate`);
 * - any link on the page to the docs or the cookbook (the header tabs, the
 *   hub's cards) is prerendered when the reader hovers it or presses on it
 *   (`moderate`). Links with a query (the search hand-off,
 *   /developers/docs?q=...) are skipped: search-handoff.js would open the
 *   search dialog inside a page the reader may never see.
 * Paired with the cross-document view transition in docs-chrome.css and
 * apps/docs/styles/theme.css (section 18), the header stays put. Browsers
 * without Speculation Rules ignore the script type and navigate normally.
 * apps/docs/prerender-home.js does the reverse (docs logo -> /developers).
 */
export function getDeveloperSpeculationRules(locale: string) {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return {
    prefetch: [
      {
        source: "list",
        urls: [localizedHref(locale, "/developers/docs")],
        eagerness: "immediate",
      },
    ],
    prerender: [
      {
        source: "document",
        where: {
          and: [
            {
              or: [
                { href_matches: `${prefix}/developers/docs{/*}?` },
                { href_matches: `${prefix}/developers/cookbook{/*}?` },
              ],
            },
            { not: { selector_matches: "a[href*='?']" } },
          ],
        },
        eagerness: "moderate",
      },
    ],
  };
}

export function DeveloperSpeculationRules({ locale }: { locale: string }) {
  return (
    <script
      type="speculationrules"
      // Static JSON built from the locale, no user input.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(getDeveloperSpeculationRules(locale)),
      }}
      suppressHydrationWarning
    />
  );
}
