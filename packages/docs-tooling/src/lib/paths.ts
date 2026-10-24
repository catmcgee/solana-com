import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (packages/docs-tooling/src/lib -> ../../../..). */
export const repoRoot = path.resolve(here, "..", "..", "..", "..");

/** The docs content root. */
export const docsRoot = path.join(repoRoot, "apps", "docs");

/** Review artifacts (move map, legacy URL list, ...). Not published. */
export const migrationDir = path.join(repoRoot, "migration");

/** This package's root. */
export const toolingRoot = path.resolve(here, "..", "..");

/**
 * The commit the migration started from. The legacy URL parity check reads
 * the content tree from this commit with `git ls-tree`.
 */
export const LEGACY_REF = process.env.DOCS_LEGACY_REF ?? "023c6d918";

export function toPosix(p: string) {
  return p.split(path.sep).join("/");
}
