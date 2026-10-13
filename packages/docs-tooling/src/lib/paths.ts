import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (packages/docs-tooling/src/lib -> ../../../..). */
export const repoRoot = path.resolve(here, "..", "..", "..", "..");

/** The Mintlify project root. */
export const docsRoot = path.join(repoRoot, "apps", "docs");

/** Legacy Fumadocs content root, relative to the repo root. */
export const legacyContentRel = "apps/docs/content";

/** Review artifacts (move map, legacy URL list, ...). Not published. */
export const migrationDir = path.join(repoRoot, "migration");

/** This package's root. */
export const toolingRoot = path.resolve(here, "..", "..");

/**
 * The commit the migration started from. `legacy-urls` reads the content tree
 * from this commit with `git ls-tree`, so it gives the same answer before and
 * after the move.
 */
export const LEGACY_REF = process.env.DOCS_LEGACY_REF ?? "023c6d918";

export function toPosix(p: string) {
  return p.split(path.sep).join("/");
}
