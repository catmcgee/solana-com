/**
 * Navigation. `docs-tooling nav <sub> [flags]`:
 *
 *   nav build [--check]            locale navs, labels/en.json,
 *                                  generated/untranslated.json,
 *                                  generated/locale-fallbacks.json, docs.json
 *                                  navigation
 *   nav swap [--check]             after Lingo: point locale navs at newly
 *                                  translated files and report the swaps
 *   nav verify                     exact coverage (verify-nav.ts)
 *
 * `nav` with no subcommand (or `nav --check`) = `nav build`.
 */
import path from "node:path";
import { navPaths, runBuild } from "./build-locale-nav.ts";
import { runSwap } from "./swap-translations.ts";
import { verifyNav } from "./verify-nav.ts";

export interface NavOptions {
  check?: boolean;
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
        message: `nav: unknown subcommand "${sub}" (build | swap | verify)`,
      };
  }
}
