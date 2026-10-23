/**
 * Navigation. `docs-tooling nav <sub> [flags]`:
 *
 *   nav compile-legacy [--force]   IA template + legacy meta.json ->
 *                                  navigation/en.json + labels/<loc>.json seeds
 *                                  (one-time; refuses to overwrite en.json
 *                                  without --force)
 *   nav stubs                      create missing NEW-page stubs (never
 *                                  overwrites)
 *   nav build [--check]            locale navs, labels/en.json,
 *                                  generated/untranslated.json,
 *                                  generated/locale-fallbacks.json, docs.json
 *                                  navigation
 *   nav swap [--check]             after Lingo: point locale navs at newly
 *                                  translated files and report the swaps
 *   nav verify                     exact coverage (verify-nav.ts)
 *
 * `nav` with no subcommand (or `nav --check`) = `nav build`.
 *
 * Greek is dropped (decisions.md), so there is no `--el-mode`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compileLegacyNav } from "./compile-legacy-nav.ts";
import { json, navPaths, runBuild } from "./build-locale-nav.ts";
import { englishLabels as englishLabelsOf } from "./labels.ts";
import { writeStubs } from "./new-pages.ts";
import { formatFiles } from "./format.ts";
import { runSwap } from "./swap-translations.ts";
import { verifyNav } from "./verify-nav.ts";

export interface NavOptions {
  check?: boolean;
  force?: boolean;
  docsRoot?: string;
}

export interface NavRunResult {
  code: number;
  message: string;
}

const rel = (root: string, f: string) => path.relative(root, f);

export function runNav(
  sub: string | undefined,
  opts: NavOptions = {},
): NavRunResult {
  const paths = navPaths(opts.docsRoot);
  const lines: string[] = [];
  switch (sub ?? "build") {
    case "compile-legacy": {
      const enFile = path.join(paths.navDir, "en.json");
      if (existsSync(enFile) && !opts.force && !opts.check)
        return {
          code: 1,
          message: `${rel(paths.docsRoot, enFile)} exists and is hand-maintained; pass --force to recompile from the legacy meta.json`,
        };
      const r = compileLegacyNav({ docsRoot: paths.docsRoot });
      const rep = r.report;
      lines.push(
        `compile-legacy: ${r.nav.tabs.length} tabs; unplaced ${rep.unplaced.length}, duplicates ${rep.duplicates.length}, missing explicit ${rep.missingExplicit.length}`,
        `  orphans appended: ${rep.orphans.map((o) => o.page).join(", ") || "none"}`,
        `  meta entries with no file: ${rep.missing.map((m) => `${m.folder}/${m.entry}`).join(", ") || "none"}`,
        `  link entries dropped: ${rep.droppedLinks.length}`,
        `  expanded entries placed elsewhere by the IA: ${rep.placedElsewhere.length}`,
      );
      for (const p of rep.unplaced) lines.push(`  UNPLACED ${p}`);
      for (const p of rep.duplicates) lines.push(`  DUPLICATE ${p}`);
      for (const p of rep.missingExplicit) lines.push(`  MISSING ${p}`);
      const bad =
        rep.unplaced.length +
        rep.duplicates.length +
        rep.missingExplicit.length;
      if (!opts.check) {
        mkdirSync(paths.labelsDir, { recursive: true });
        const written = [enFile];
        writeFileSync(enFile, json(r.nav));
        for (const [loc, m] of r.seeds) {
          const f = path.join(paths.labelsDir, `${loc}.json`);
          writeFileSync(f, json(m));
          written.push(f);
        }
        mkdirSync(paths.generatedDir, { recursive: true });
        writeFileSync(
          path.join(paths.generatedDir, "nav-compile-report.json"),
          json({
            generatedBy:
              "packages/docs-tooling nav compile-legacy (src/nav/compile-legacy-nav.ts)",
            ...rep,
          }),
        );
        written.push(path.join(paths.generatedDir, "nav-compile-report.json"));
        formatFiles(written);
        const total = Object.keys(englishLabelsOf(r.nav)).length;
        lines.push(
          `  wrote navigation/en.json, labels/<loc>.json seeds (${[...r.seeds].map(([l, m]) => `${l} ${Object.keys(m).length}`).join(", ")} of ${total} labels), generated/nav-compile-report.json`,
        );
      }
      return { code: bad ? 1 : 0, message: lines.join("\n") };
    }
    case "stubs": {
      const created = writeStubs(paths.docsRoot);
      return {
        code: 0,
        message: `stubs: created ${created.length}${created.length ? `:\n  ${created.join("\n  ")}` : ""}`,
      };
    }
    case "build": {
      const r = runBuild({ docsRoot: paths.docsRoot, check: opts.check });
      const s = r.untranslated.summary;
      lines.push(
        `nav build: ${r.builds.length} locale navs; ${r.stale.length} file(s) ${opts.check ? "stale" : "written"}`,
        `  untranslated per locale (pages / english-only / labels): ${Object.entries(
          s,
        )
          .map(([l, v]) => `${l} ${v.pages}/${v.englishOnly}/${v.labels}`)
          .join(", ")}`,
      );
      for (const f of r.stale)
        lines.push(
          `  ${opts.check ? "STALE" : "wrote"} ${rel(paths.docsRoot, f)}`,
        );
      return {
        code: opts.check && r.stale.length ? 1 : 0,
        message: lines.join("\n"),
      };
    }
    case "swap": {
      const r = runSwap({ docsRoot: paths.docsRoot, check: opts.check });
      lines.push(
        `nav swap: ${r.swapped.length} entr${r.swapped.length === 1 ? "y" : "ies"} now point at translations; ${r.remaining} still untranslated; ${r.regressed.length} fell back to English`,
      );
      for (const s of r.swapped.slice(0, 50))
        lines.push(`  ${s.loc}: ${s.page} -> ${s.target}`);
      for (const s of r.regressed.slice(0, 50))
        lines.push(`  REGRESSED ${s.loc}: ${s.page}`);
      return { code: 0, message: lines.join("\n") };
    }
    case "verify": {
      const r = verifyNav({ docsRoot: paths.docsRoot });
      lines.push(
        `verify-nav: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`,
        `  per language (files / nav entries / English fallbacks): ${Object.entries(
          r.counts,
        )
          .map(([l, c]) => `${l} ${c.files}/${c.navEntries}/${c.english}`)
          .join(", ")}`,
        ...r.info.map((i) => `  ${i}`),
        ...r.warnings.map((w) => `  WARN ${w}`),
        ...r.errors.slice(0, 200).map((e) => `  ERROR ${e}`),
      );
      return { code: r.errors.length ? 1 : 0, message: lines.join("\n") };
    }
    default:
      return {
        code: 1,
        message: `nav: unknown subcommand "${sub}" (compile-legacy | stubs | build | swap | verify)`,
      };
  }
}
