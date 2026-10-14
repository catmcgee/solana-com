/**
 * Standalone entry for the examples tooling:
 *
 *   tsx src/examples/main.ts build [--check]
 *   tsx src/examples/main.ts extract [--dry-run]
 *
 * `build` is the same as `docs-tooling examples [--check]`.
 */
import { buildExamples } from "./build-examples.ts";
import { extractBlocks } from "./extract-blocks.ts";
import { summarize } from "./index.ts";

const [cmd = "build", ...rest] = process.argv.slice(2);
const has = (f: string) => rest.includes(f);

if (cmd === "build") {
  const check = has("--check");
  const r = buildExamples({ check, write: !check });
  console.log(summarize(r, check));
  process.exit(r.errors.length || (check && r.stale.length) ? 1 : 0);
} else if (cmd === "extract") {
  const r = extractBlocks({ dryRun: has("--dry-run") });
  console.log(
    `extract: ${r.pagesScanned} pages, ${r.blocks.size} blocks, ${r.written.length} blocks.json ${has("--dry-run") ? "would change" : "written"}`,
  );
  for (const w of r.written) console.log(`  ${w}`);
  for (const p of r.problems) console.log(`  PROBLEM ${p}`);
  for (const c of r.conflicts) console.log(`  CONFLICT ${c}`);
  process.exit(r.conflicts.length || r.problems.length ? 1 : 0);
} else {
  console.log("usage: main.ts build [--check] | extract [--dry-run]");
  process.exit(1);
}
