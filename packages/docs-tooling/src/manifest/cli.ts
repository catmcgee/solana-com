/**
 * WP9 generators. Until they are wired into src/cli.ts, run them with
 *   pnpm --filter @workspace/docs-tooling exec tsx src/manifest/cli.ts <cmd> [--check]
 *
 * Commands (run in this order; each reads the previous output):
 *   gen:manifest   generated/pages.json from apps/docs (+ git lastmod)
 *   gen:llms       apps/docs/llms.txt + generated/llms-sections/*.txt
 *   all            both of the above
 * `--check` writes nothing and exits 1 when an output is stale (lastmod is
 * ignored by the check: it changes with every commit).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../lib/paths.ts";
import { renderAll, writeLlms } from "../llms/generate.ts";
import {
  buildPagesManifest,
  PAGES_MANIFEST_REL,
  readPagesManifest,
  serializeManifest,
  stableManifest,
  type ManifestFile,
} from "./pages.ts";

export async function runGenManifest(check: boolean) {
  const file = path.join(repoRoot, PAGES_MANIFEST_REL);
  if (check) {
    const committed = readPagesManifest(file);
    const fresh = buildPagesManifest({ lastmod: false });
    const ok =
      committed !== null &&
      serializeManifest(stableManifest(committed)) ===
        serializeManifest(stableManifest(fresh));
    console.log(
      `gen:manifest: ${fresh.pages.length} pages, ${ok ? "up to date" : `stale: ${PAGES_MANIFEST_REL}`}`,
    );
    return ok ? 0 : 1;
  }
  const manifest = buildPagesManifest();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serializeManifest(manifest));
  console.log(
    `gen:manifest: wrote ${manifest.pages.length} pages to ${PAGES_MANIFEST_REL}`,
  );
  return 0;
}

export function runGenLlms(check: boolean) {
  const manifest: ManifestFile | null = readPagesManifest();
  if (!manifest) {
    console.error(
      `gen:llms: ${PAGES_MANIFEST_REL} missing; run gen:manifest first`,
    );
    return 1;
  }
  const out = renderAll(manifest.pages);
  const stale = writeLlms(out, check);
  console.log(
    `gen:llms: llms.txt + ${out.sections.size} section indexes, ${stale.length} ${check ? "stale" : "written"}`,
  );
  for (const f of stale) console.log(`  ${path.relative(repoRoot, f)}`);
  return check && stale.length > 0 ? 1 : 0;
}

async function main(argv: string[]) {
  const [cmd = "all", ...rest] = argv;
  const check = rest.includes("--check");
  switch (cmd) {
    case "gen:manifest":
      return runGenManifest(check);
    case "gen:llms":
      return runGenLlms(check);
    case "all": {
      const a = await runGenManifest(check);
      const b = runGenLlms(check);
      return a || b;
    }
    default:
      console.error(`unknown command ${cmd}`);
      return 2;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
