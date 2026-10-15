/**
 * Generated JSON is committed and CI runs `oxfmt --check .`, so files are
 * formatted with the repo's oxfmt after writing. Freshness checks compare
 * JSON semantically, so formatting never makes a file look stale.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/paths.ts";

export function formatFiles(files: string[]): boolean {
  const bin = path.join(repoRoot, "node_modules", ".bin", "oxfmt");
  if (!files.length || !existsSync(bin)) return false;
  try {
    execFileSync(bin, files, { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    // oxfmt exits non-zero when every file is matched by .oxfmtrc.json
    // ignorePatterns (apps/docs/navigation/** and generated/** are). Those
    // files are not format-checked in CI, so unformatted output is fine.
    return false;
  }
}

/** True when `file` holds `expected` (JSON compared semantically). */
export function sameContent(file: string, expected: string): boolean {
  if (!existsSync(file)) return false;
  const cur = readFileSync(file, "utf8");
  if (cur === expected) return true;
  if (!file.endsWith(".json")) return false;
  try {
    return (
      JSON.stringify(JSON.parse(cur)) === JSON.stringify(JSON.parse(expected))
    );
  } catch {
    return false;
  }
}
