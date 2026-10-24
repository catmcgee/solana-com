/**
 * Absolute path of apps/docs (the docs content), from apps/web (the cwd of
 * `next dev`, `next build` and the server functions, which trace the files
 * they read, see next.config.ts) or the repo root (scripts).
 */
import { existsSync } from "node:fs";
import path from "node:path";

let cached;

export function findDocsRoot() {
  if (cached) return cached;
  const fromWeb = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "../docs",
  );
  const fromRoot = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "apps/docs",
  );
  // Test the repo-root layout: the server functions ship only the traced
  // docs sources (no docs.json), so probing ../docs/docs.json sent
  // translated pages that inline snippets to apps/web/apps/docs (ENOENT).
  cached = existsSync(path.join(fromRoot, "docs.json")) ? fromRoot : fromWeb;
  return cached;
}
