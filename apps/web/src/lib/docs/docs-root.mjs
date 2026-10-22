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
  const fromWeb = path.join(/* turbopackIgnore: true */ process.cwd(), "../docs");
  const fromRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "apps/docs");
  cached = existsSync(path.join(fromWeb, "docs.json")) ? fromWeb : fromRoot;
  return cached;
}
