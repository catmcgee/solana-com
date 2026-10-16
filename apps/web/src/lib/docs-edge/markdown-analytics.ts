/**
 * PostHog capture for markdown requests to the docs (spec §5.5). Ported from
 * the deleted apps/docs/src/lib/posthog/server.ts so the event name, the
 * distinct id and the property shape stay continuous across the migration.
 */
import type { MarkdownRequestSource } from "./paths";

export const DOCS_MARKDOWN_EVENT = "docs_markdown_requested";
export const DOCS_MARKDOWN_DISTINCT_ID = "docs-markdown-api";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const SOLANA_SITE_ORIGIN = "https://solana.com";

export interface TrackMarkdownRequestInput {
  /** Path without the locale prefix and without `.md`, e.g. `/developers/docs/core`. */
  route: string;
  source: MarkdownRequestSource;
  /** Locale prefix of the request, or null for English. */
  locale?: string | null;
}

export async function trackMarkdownRequest(
  { route, source, locale }: TrackMarkdownRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return;
  }

  await fetchImpl(`${DEFAULT_POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event: DOCS_MARKDOWN_EVENT,
      properties: {
        distinct_id: DOCS_MARKDOWN_DISTINCT_ID,
        route,
        source,
        ...(locale ? { locale } : {}),
        $current_url: `${SOLANA_SITE_ORIGIN}${route}`,
        $process_person_profile: false,
      },
    }),
  }).catch(() => {
    // Tracking must never block or fail the request.
  });
}
