import "@workspace/ui/scrollbar.css";
import "@/scss/index.scss";

import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import CookieConsent from "@/components/CookieConsent/CookieConsent";
import GTMTrackingSnippet from "@/components/GTMTrackingSnippet";
import { config } from "@@/src/config";
import { getLangDir } from "rtl-detect";
// Module imports, not the package index: through it, the docs pages also
// shipped the site Header, Footer, and their dialogs.
import { ThemeProvider } from "@solana-com/ui-chrome/theme-provider";
import { SitewideTopAlert } from "@solana-com/ui-chrome/sitewide-top-alert";
import { PodcastPlayer } from "@/components/podcast-player.client";
import { GoogleTagManagerNoScript } from "@solana-com/ui-chrome/google-tag-manager-noscript";
import Script from "next/script";

/**
 * The <html> and <body> of both root layouts: [locale]/layout.tsx (the
 * solana.com pages, with the site Header and Footer as `header`/`footer`)
 * and (docs)/[locale]/layout.tsx (the /developers landing and the docs,
 * which bring their own chrome and only the messages their client
 * components read). Each layout imports its Tailwind stylesheet first.
 */
export function SiteShell({
  locale,
  messages,
  header,
  footer,
  children,
}: {
  locale: string;
  messages: AbstractIntlMessages;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const googleTagManagerID = config.siteMetadata.googleTagManagerID;
  return (
    <html
      lang={locale}
      dir={getLangDir(locale)}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <GoogleTagManagerNoScript containerId={googleTagManagerID} />
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider>
            <GTMTrackingSnippet />
            <SitewideTopAlert />
            <CookieConsent />
            {header}
            {children}
            {footer}
            <PodcastPlayer />
            <Script
              id="signals-script"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    if (typeof window === 'undefined') return;
                    if (typeof window.signals !== 'undefined') return;
                    var script = document.createElement('script');
                    script.src = 'https://cdn.cr-relay.com/v1/site/d7901f15-da9a-4a7a-bf5e-679354ce2f55/signals.js';
                    script.async = true;
                    window.signals = Object.assign(
                      [],
                      ['page', 'identify', 'form'].reduce(function (acc, method){
                        acc[method] = function () {
                          signals.push([method, arguments]);
                          return signals;
                        };
                      return acc;
                      }, {})
                    );
                    document.head.appendChild(script);
                  })();
                `,
              }}
            />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
