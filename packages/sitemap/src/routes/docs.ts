import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../constants";
import type { RouteGenerator } from "../types";
import { locales } from "@workspace/i18n/config";
import {
  createEntry,
  createLocalizedEntries,
  dedupeEntries,
  getFileLastModified,
  normalizePath,
  walkFiles,
} from "../utils";

// apps/docs is a Mintlify project whose folder layout mirrors public URLs:
// English at apps/docs/<collection>/..., other locales at
// apps/docs/<locale>/<collection>/... (packages/docs-tooling move rules).
// WP9 replaces this walk with packages/docs-tooling/generated/pages.json.
const docsRoot = path.join(repoRoot, "apps", "docs");

function toRoutePath(baseRoute: string, relativePath: string) {
  const withoutExtension = relativePath.replace(/\.mdx$/, "");
  const routeSuffix =
    withoutExtension === "index"
      ? ""
      : withoutExtension.replace(/\/index$/, "").replace(/\\/g, "/");

  return normalizePath(
    routeSuffix ? `${normalizePath(baseRoute)}/${routeSuffix}` : baseRoute,
  );
}

function getLocalizedContentEntries(collectionPath: string, baseRoute: string) {
  const entries = [];

  for (const locale of locales) {
    const localeDir =
      locale === "en"
        ? path.join(docsRoot, collectionPath)
        : path.join(docsRoot, locale, collectionPath);

    if (!fs.existsSync(localeDir) || !fs.statSync(localeDir).isDirectory()) {
      continue;
    }

    for (const filePath of walkFiles(localeDir)) {
      if (!filePath.endsWith(".mdx")) {
        continue;
      }

      const relativePath = path.relative(localeDir, filePath);
      const routePath = toRoutePath(baseRoute, relativePath);
      const localizedPath =
        locale === "en" ? routePath : `/${locale}${routePath}`;

      entries.push(
        createEntry(localizedPath, {
          lastModified: getFileLastModified(filePath),
          changeFrequency: "weekly",
          priority: routePath === baseRoute ? 0.8 : 0.7,
        }),
      );
    }
  }

  return entries;
}

function getDefaultLocaleContentEntries(contentDir: string, baseRoute: string) {
  if (!fs.existsSync(contentDir)) {
    return [];
  }

  return walkFiles(contentDir)
    .filter((filePath) => filePath.endsWith(".mdx"))
    .map((filePath) => {
      const relativePath = path.relative(contentDir, filePath);
      const routePath = toRoutePath(baseRoute, relativePath);

      return createEntry(routePath, {
        lastModified: getFileLastModified(filePath),
        changeFrequency: "weekly",
        priority: routePath === baseRoute ? 0.8 : 0.7,
      });
    });
}

export const docsRoutes: RouteGenerator = () => {
  try {
    const rootEntries = [
      ...createLocalizedEntries("/developers", {
        changeFrequency: "weekly",
        priority: 0.8,
      }),
      ...createLocalizedEntries("/learn", {
        changeFrequency: "weekly",
        priority: 0.8,
      }),
      ...createLocalizedEntries("/developers/cookbook", {
        changeFrequency: "weekly",
        priority: 0.8,
      }),
      ...createLocalizedEntries("/developers/bootcamp", {
        changeFrequency: "weekly",
        priority: 0.8,
      }),
      ...createLocalizedEntries("/data", {
        changeFrequency: "daily",
        priority: 0.8,
      }),
    ];

    return dedupeEntries([
      ...rootEntries,
      ...getLocalizedContentEntries("docs", "/docs"),
      ...getLocalizedContentEntries("learn", "/learn"),
      ...getDefaultLocaleContentEntries(
        path.join(docsRoot, "developers", "cookbook"),
        "/developers/cookbook",
      ),
      ...getLocalizedContentEntries(
        path.join("developers", "bootcamp"),
        "/developers/bootcamp",
      ),
    ]);
  } catch (error) {
    console.error("Failed to build docs sitemap routes", error);
    return [];
  }
};
