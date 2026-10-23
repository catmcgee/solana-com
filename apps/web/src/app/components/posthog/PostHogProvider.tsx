"use client";

import type { PostHog } from "posthog-js";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  COOKIE_CONSENT_EVENT,
  readCookieConsent,
  type CookieConsentValue,
} from "@solana-com/ui-chrome/cookie-consent";
import { getBrowserStorage } from "@solana-com/ui-chrome/browser-storage";

let client: PostHog | undefined;

/**
 * PostHog analytics after cookie consent. posthog-js is only downloaded
 * once the visitor has consented.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const [posthog, setPostHog] = useState<PostHog | null>(null);

  useEffect(() => {
    if (!apiKey) {
      console.debug("PostHog analytics disabled");
      return;
    }

    let consented = false;
    const syncPostHogConsent = (consent: CookieConsentValue) => {
      consented = consent === true;
      if (consented) {
        void import("posthog-js").then(({ default: posthog }) => {
          if (!consented) return;
          if (!client) {
            posthog.init(apiKey, {
              api_host: "https://us.i.posthog.com",
              capture_pageview: false,
              capture_pageleave: true,
            });
            client = posthog;
          }
          posthog.opt_in_capturing();
          setPostHog(posthog);
        });
        return;
      }

      client?.opt_out_capturing();
      setPostHog(null);
    };

    const readConsent = () =>
      readCookieConsent({
        storage: getBrowserStorage("localStorage"),
      });

    syncPostHogConsent(readConsent());

    const handleConsentChange = (
      event: Event | CustomEvent<{ value?: boolean }>,
    ) => {
      const consent = "detail" in event ? event.detail?.value : undefined;
      syncPostHogConsent(
        typeof consent === "boolean" ? consent : readConsent(),
      );
    };

    window.addEventListener(
      COOKIE_CONSENT_EVENT,
      handleConsentChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        COOKIE_CONSENT_EVENT,
        handleConsentChange as EventListener,
      );
    };
  }, [apiKey]);

  return (
    <>
      {posthog ? (
        <Suspense fallback={null}>
          <PostHogPageView posthog={posthog} />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}

function PostHogPageView({ posthog }: { posthog: PostHog }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) {
        url += "?" + search;
      }
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}
