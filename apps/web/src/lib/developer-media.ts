import "server-only";

import { MEDIA_APP_URL } from "@@/apps-urls";

export type DeveloperUpdate = {
  kind: "News" | "Changelog" | "Upgrade" | "Release";
  title: string;
  description: string;
  href: string;
  publishedAt?: string;
};

const REVALIDATE_SECONDS = 300;

// Ported from apps/docs/src/lib/developer-media.ts. MEDIA_APP_URL already
// resolves NEXT_PUBLIC_MEDIA_APP_URL, the Vercel related project and localhost.
export function getDeveloperUpdatesUrl(): string {
  return new URL("/api/developer-updates/latest", MEDIA_APP_URL).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDeveloperUpdate(value: unknown): value is DeveloperUpdate {
  if (!isRecord(value)) return false;

  return (
    (value.kind === "News" ||
      value.kind === "Changelog" ||
      value.kind === "Upgrade" ||
      value.kind === "Release") &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.href === "string" &&
    (value.publishedAt === undefined || typeof value.publishedAt === "string")
  );
}

/**
 * Fetches the Media-owned developer feed on the server (revalidated every
 * five minutes). A failed or malformed response returns an empty list, and
 * the /developers landing then hides its updates section; there is no client
 * re-fetch.
 */
export async function getLatestDeveloperUpdates(): Promise<DeveloperUpdate[]> {
  try {
    const response = await fetch(getDeveloperUpdatesUrl(), {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data.updates)) {
      throw new Error("Invalid developer updates response");
    }

    return data.updates.filter(isDeveloperUpdate);
  } catch (error) {
    console.error("Failed to fetch latest developer updates:", error);
    return [];
  }
}
