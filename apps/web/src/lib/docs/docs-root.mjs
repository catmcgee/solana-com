/**
 * Absolute path of apps/docs (the docs content), from apps/web or the repo
 * root. Build-time helpers only (they read the filesystem).
 */
import { existsSync } from "node:fs";
import path from "node:path";

let cached;

export function findDocsRoot() {
  if (cached) return cached;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    for (const candidate of [
      path.join(dir, "apps", "docs"),
      path.join(dir, "..", "docs"),
    ]) {
      if (existsSync(path.join(candidate, "docs.json"))) {
        cached = path.resolve(candidate);
        return cached;
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(`apps/docs not found from ${process.cwd()}`);
}
