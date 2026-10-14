import fs from "node:fs";
import path from "node:path";
import { WALLET_DIRECTORY_LAST_VERIFIED } from "@workspace/ecosystem-data/wallets/metadata";
import { repoRoot } from "../constants";
import type { RouteGenerator } from "../types";
import {
  createLocalizedEntries,
  dedupeEntries,
  getFileLastModified,
  toAbsoluteUrl,
  walkFiles,
} from "../utils";

const appLocaleRoot = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "app",
  "[locale]",
);

// Historical landing pages remain available to existing links, but are not
// promoted as current content through the sitemap.
const archivedRoutes = new Set([
  "/2023outlook",
  "/2024outlook",
  "/epoch1000",
  "/epoch1000/card",
  "/community/report-2024-newsletter-sign-up",
  "/art-basel",
  "/privacyhack",
  "/graveyard-hack",
  "/prediction-markets-hack",
  "/wsop",
  "/nftshowdown",
  "/playgg",
]);

/**
 * Developer landings served by apps/web (spec §5.11: moved here from
 * docs.ts). WP10 builds them under src/app/[locale]/{developers,learn}; they
 * are listed even before their page files exist, as they were before.
 */
const developerLandingRoutes = ["/developers", "/learn"];

/**
 * Greek developer URLs redirect to English (decisions.md drops Greek docs),
 * so they are not listed even though apps/web still serves other /el pages.
 */
const greekRedirectedUrls = new Set(
  developerLandingRoutes.map((route) => toAbsoluteUrl(`/el${route}`)),
);

function toRoutePath(filePath: string) {
  const relativeDir = path.relative(appLocaleRoot, path.dirname(filePath));
  const segments = relativeDir === "" ? [] : relativeDir.split(path.sep);

  if (
    segments.some((segment) => segment.startsWith("[") && segment.endsWith("]"))
  ) {
    return null;
  }

  const routeSegments = segments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")")),
  );

  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

function getPriority(routePath: string) {
  if (routePath === "/") {
    return 1;
  }

  const depth = routePath.split("/").filter(Boolean).length;

  if (depth === 1) {
    return 0.9;
  }

  return 0.8;
}

function getRouteLastModified(routePath: string, filePath: string) {
  if (routePath === "/wallets") {
    return `${WALLET_DIRECTORY_LAST_VERIFIED}T00:00:00.000Z`;
  }

  return getFileLastModified(filePath);
}

export const marketingRoutes: RouteGenerator = () => {
  try {
    if (!fs.existsSync(appLocaleRoot)) {
      return [];
    }

    const pageFiles = walkFiles(appLocaleRoot).filter((filePath) =>
      /\/page\.(tsx|jsx|js|mdx)$/.test(filePath),
    );

    const entries = pageFiles.flatMap((filePath) => {
      const routePath = toRoutePath(filePath);

      if (!routePath || archivedRoutes.has(routePath)) {
        return [];
      }

      const options = {
        lastModified: getRouteLastModified(routePath, filePath),
        changeFrequency: "weekly",
        priority: getPriority(routePath),
      } as const;

      return createLocalizedEntries(routePath, options);
    });

    const landingEntries = developerLandingRoutes.flatMap((routePath) =>
      createLocalizedEntries(routePath, {
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    );

    return dedupeEntries([...entries, ...landingEntries]).filter(
      (entry) => !greekRedirectedUrls.has(entry.url),
    );
  } catch (error) {
    console.error("Failed to build marketing sitemap routes", error);
    return [];
  }
};
