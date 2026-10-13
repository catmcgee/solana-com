/**
 * docs-tooling CLI. Run with `pnpm --filter @workspace/docs-tooling cli <cmd>`
 * or `pnpm exec docs-tooling <cmd>`.
 */
import { runLegacyUrls } from "./verify/legacy-urls.ts";
import { executeMove } from "./move/move.ts";
import { removeNextApp } from "./move/remove-next-app.ts";
import { loadRedirectIndex } from "./verify/redirects.ts";
import { runVerifyUrls } from "./verify/verify-urls.ts";
import { runConvert } from "./convert/run.ts";
import { runNav } from "./nav/index.ts";
import { runExamples } from "./examples/index.ts";

const USAGE = `docs-tooling <command> [options]

Commands:
  legacy-urls                 Write migration/legacy-urls.{txt,tsv} from the legacy tree (git ref)
  move [--dry-run]            R1-R9 git mv/rm, Greek removal, assets; writes migration/move-map.csv
  remove-next-app [--dry-run] git rm the Fumadocs Next.js app files from apps/docs (spec §1.2)
  verify-redirects            Show apps/web redirect coverage for R8 and Greek removals
  verify-urls                 Legacy URL parity against the new layout + move map
  convert [--files p] [--locale l] [--check]   Run the transform registry (WP2+)
  nav [--check]               Build locale navigation (WP6, stub)
  examples [--check]          Build runnable example snippets (WP5, stub)
`;

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
  switch (cmd) {
    case "legacy-urls": {
      const r = runLegacyUrls({
        ref: typeof flags.ref === "string" ? flags.ref : undefined,
      });
      const counts = new Map<string, number>();
      for (const u of r.urls)
        counts.set(
          `${u.collection}\t${u.kind}`,
          (counts.get(`${u.collection}\t${u.kind}`) ?? 0) + 1,
        );
      console.log(
        `legacy-urls @ ${r.ref}: ${r.urls.length} URLs from ${r.fileCount} legacy files`,
      );
      for (const [k, v] of [...counts].sort())
        console.log(`  ${k.replace("\t", " / ")}: ${v}`);
      if (r.unroutedBootcampFiles.length)
        console.log(
          `  bootcamp files with no route: ${r.unroutedBootcampFiles.join(", ")}`,
        );
      return 0;
    }
    case "move": {
      const redirects = await loadRedirectIndex();
      const r = executeMove({
        dryRun: Boolean(flags["dry-run"]),
        redirects,
        log: (m) => console.log(m),
      });
      const counts = new Map<string, number>();
      for (const row of r.rows)
        counts.set(
          `${row.rule}\t${row.status}`,
          (counts.get(`${row.rule}\t${row.status}`) ?? 0) + 1,
        );
      console.log(
        table([
          ["rule", "status", "count"],
          ...[...counts].sort().map(([k, v]) => [...k.split("\t"), String(v)]),
        ]),
      );
      console.log(`executed: ${JSON.stringify(r.executed)}`);
      console.log(
        `Greek URLs with no apps/web redirect yet: ${r.elRedirectsMissingInWeb}`,
      );
      if (r.keptUncovered.length) {
        console.log(
          `R8 files KEPT (no apps/web redirect): ${r.keptUncovered.length}`,
        );
        for (const k of r.keptUncovered) console.log(`  ${k.src}`);
      }
      return 0;
    }
    case "remove-next-app": {
      const r = removeNextApp({
        dryRun: Boolean(flags["dry-run"]),
        force: Boolean(flags.force),
      });
      const did = !flags["dry-run"] && (!r.blockers.length || flags.force);
      console.log(
        `${did ? "removed" : "would remove"} ${r.removed.length} tracked files`,
      );
      for (const b of r.blockers) console.log(`BLOCKER: ${b}`);
      if (r.staleContentRefs.length) {
        console.log(
          `stale apps/docs/content references outside apps/docs (owned by later WPs): ${r.staleContentRefs.length}`,
        );
        for (const s of r.staleContentRefs) console.log(`  ${s}`);
      }
      return r.blockers.length ? 1 : 0;
    }
    case "verify-redirects": {
      const { planMove } = await import("./move/move.ts");
      const plan = planMove({ redirects: await loadRedirectIndex() });
      for (const row of plan.rows.filter((x) => x.rule === "R8")) {
        console.log(
          `${row.status}\t${row.url}\t${row.redirect || row.dest}\t${row.note}`,
        );
      }
      console.log(
        `Greek URLs with no apps/web redirect yet: ${plan.elMissing}`,
      );
      return 0;
    }
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
      const r = runConvert({
        files: typeof flags.files === "string" ? flags.files : undefined,
        locale: typeof flags.locale === "string" ? flags.locale : undefined,
        check: Boolean(flags.check),
      });
      console.log(
        `convert: ${r.transforms.length} transforms, ${r.files} files, ${r.changed.length} ${flags.check ? "would change" : "changed"}`,
      );
      for (const d of r.diagnostics)
        console.log(`  ${d.level} ${d.transform} ${d.file}: ${d.message}`);
      if (flags.check)
        for (const c of r.changed.slice(0, 50)) console.log(`  stale: ${c}`);
      return r.ok ? 0 : 1;
    }
    case "nav": {
      console.log(runNav({ check: Boolean(flags.check) }).message);
      return 0;
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
