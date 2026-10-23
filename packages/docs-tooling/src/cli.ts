/**
 * docs-tooling CLI. Run with `pnpm --filter @workspace/docs-tooling cli <cmd>`
 * or `pnpm exec docs-tooling <cmd>`.
 */
import { loadRedirectIndex } from "./verify/redirects.ts";
import { runVerifyUrls } from "./verify/verify-urls.ts";
import { runConvert } from "./convert/run.ts";
import { runNav } from "./nav/index.ts";
import { runExamples } from "./examples/index.ts";

const USAGE = `docs-tooling <command> [options]

Commands:
  verify-urls                 Legacy URL parity against the new layout + move map
  convert [--files p1,p2] [--exclude p1,p2] [--locale l] [--check|--dry-run]
                              Run the auto-discovered transforms (src/convert/transforms/*.ts).
                              --exclude: comma-separated path prefixes (relative to apps/docs) to skip
  verify [--skip-generators] [--skip-convert]   All spec §4.4 checks (src/verify/index.ts)
  residual                    Residual Fumadocs/Code Hike syntax scan (spec §4.4.2)
  nav [compile-legacy|stubs|build|swap|verify] [--check] [--force]   Navigation (WP6, src/nav/index.ts)
  examples [--check]          Build runnable example snippets (WP5)
`;

/**
 * Flags each command accepts. Anything else is rejected before the command
 * runs: an unknown flag (e.g. `convert --help`) used to be ignored, which
 * ran `convert` in WRITE mode over the whole corpus.
 */
const KNOWN_FLAGS: Record<string, string[]> = {
  "verify-urls": [],
  convert: ["files", "exclude", "locale", "check", "dry-run"],
  nav: ["check", "force"],
  examples: ["check"],
  verify: ["skip-generators", "skip-convert", "json"],
  residual: ["json"],
};

function parseArgs(argv: string[]) {
  const [cmd, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  }
  return { cmd, flags };
}

function table(rows: string[][]) {
  const widths = rows[0]!.map((_, i) =>
    Math.max(...rows.map((r) => (r[i] ?? "").length)),
  );
  return rows
    .map((r) => r.map((c, i) => c.padEnd(widths[i]!)).join("  "))
    .join("\n");
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (cmd && cmd in KNOWN_FLAGS) {
    const bad = Object.keys(flags).filter(
      (f) => !KNOWN_FLAGS[cmd]!.includes(f),
    );
    if (bad.length) {
      console.error(
        `docs-tooling ${cmd}: unknown option(s) ${bad.map((b) => `--${b}`).join(", ")}; nothing was run.\n\n${USAGE}`,
      );
      return 2;
    }
  }
  switch (cmd) {
    case "verify-urls": {
      const r = runVerifyUrls({ web: await loadRedirectIndex() });
      const classes = [
        "exact",
        "redirect",
        "redirect-pending",
        "cookbook-rewrite",
        "fallback-en",
        "route-pending",
        "unmapped",
        "ambiguous",
      ];
      const rows = [
        ["collection", "locale", "legacy", ...classes, "files-now"],
      ];
      for (const [k, n] of [...r.before].sort()) {
        const m = r.after.get(k)!;
        rows.push([
          ...k.split("\t"),
          String(n),
          ...classes.map((c) => String(m.get(c) ?? 0)),
          String(r.layout.get(k) ?? 0),
        ]);
      }
      console.log(table(rows));
      const other = r.layout.get("other\t-");
      if (other) console.log(`pages outside collections: ${other}`);
      console.log(
        `\nlegacy URLs: ${r.total}; failures: ${r.failures.length}; missing translations (reported, not failing): ${r.missingTranslations.length}`,
      );
      console.log(
        `redirects recorded but not yet in apps/web (WP9, migration/pending-web-work.json; reported, not failing): ${r.redirectPending.length}`,
      );
      if (r.shadowedFiles.length) {
        console.log(
          `  files kept at a redirected path (git rm once WP9 ports the redirect): ${r.shadowedFiles.length}`,
        );
        for (const f of r.shadowedFiles) console.log(`    ${f}`);
      }
      for (const f of r.failures.slice(0, 50))
        console.log(`  FAIL ${f.cls} ${f.url} ${f.target}`);
      console.log(`move-map problems: ${r.moveMapProblems.length}`);
      for (const p of r.moveMapProblems.slice(0, 50)) console.log(`  ${p}`);
      console.log(`stray .js/.css in apps/docs: ${r.stray.length}`);
      for (const s of r.stray.slice(0, 50)) console.log(`  ${s}`);
      return r.failures.length || r.moveMapProblems.length || r.stray.length
        ? 1
        : 0;
    }
    case "convert": {
      const r = await runConvert({
        files: typeof flags.files === "string" ? flags.files : undefined,
        exclude:
          typeof flags.exclude === "string"
            ? flags.exclude
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : undefined,
        locale: typeof flags.locale === "string" ? flags.locale : undefined,
        check: Boolean(flags.check),
        dryRun: Boolean(flags["dry-run"]),
      });
      const inMemory = flags.check || flags["dry-run"];
      console.log(
        `convert: ${r.transforms.length} transforms [${r.transforms.join(", ")}], ${r.files} files, ${r.changed.length} ${inMemory ? "would change" : "changed"}`,
      );
      for (const d of r.diagnostics)
        console.log(`  ${d.level} ${d.transform} ${d.file}: ${d.message}`);
      if (inMemory)
        for (const c of r.changed.slice(0, 50)) console.log(`  stale: ${c}`);
      return r.ok ? 0 : 1;
    }
    case "nav": {
      const sub = process.argv.slice(3).find((a) => !a.startsWith("--"));
      const r = runNav(sub, {
        check: Boolean(flags.check),
        force: Boolean(flags.force),
      });
      console.log(r.message);
      return r.code;
    }
    case "verify": {
      const { runVerify } = await import("./verify/index.ts");
      return runVerify({
        generators: !flags["skip-generators"],
        convert: !flags["skip-convert"],
        json: Boolean(flags.json),
      });
    }
    case "residual": {
      const { scanResidual, printResidual } =
        await import("./verify/residual.ts");
      const r = scanResidual();
      printResidual(r, Boolean(flags.json));
      return r.total ? 1 : 0;
    }
    case "examples": {
      console.log(runExamples({ check: Boolean(flags.check) }).message);
      return 0;
    }
    default:
      console.log(USAGE);
      return cmd ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  },
);
