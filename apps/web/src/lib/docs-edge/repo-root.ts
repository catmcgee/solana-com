import fs from "node:fs";
import path from "node:path";

/**
 * Finds the monorepo root by walking up to pnpm-workspace.yaml. Works from
 * next.config (cwd apps/web), vitest, and tsx scripts run elsewhere in the
 * repo. Build-time only: deployed functions do not ship the repo.
 */
export function findRepoRoot(start = process.cwd()): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
