/**
 * WP1 move: R1-R9 `git mv` / `git rm`, Greek removal, data relocation and
 * public assets -> docs-assets. Writes migration/move-map.csv,
 * migration/assets-diff.txt, migration/asset-refs.csv and
 * migration/docs-app-redirects.json.
 *
 * Idempotent: rows whose source is gone and whose destination exists are
 * skipped, so a second run only rewrites the reports.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MoveRow } from "../types.ts";
import {
  gitAdd,
  gitMv,
  gitRm,
  listFilesAtRef,
  listTrackedFiles,
  showFileAtRef,
} from "../lib/git.ts";
import {
  LEGACY_LOCALES,
  DEFAULT_LOCALE,
  DROPPED_LOCALES,
} from "../lib/locales.ts";
import { LEGACY_REF, migrationDir, repoRoot } from "../lib/paths.ts";
import {
  CONTENT_PREFIX,
  COLLECTION_BASE,
  classify,
  localePrefix,
  newPath,
  parseLegacyPath,
} from "./rules.ts";
import {
  CONTENT_ASSET_DIRS,
  DOCS_ASSETS,
  DOCS_PUBLIC,
  WEB_PUBLIC,
  planAssets,
} from "./assets.ts";
import {
  DEVELOPERS_BASE,
  DEVELOPERS_LANDING_ROUTE,
  LEARN_LANDING_ROUTE,
} from "../verify/legacy-urls.ts";
import type { RedirectIndex } from "../verify/redirects.ts";

const abs = (p: string) => path.join(repoRoot, p);

/**
 * Non-content files relocated into packages/docs-tooling before the Next
 * app is deleted (spec §1.2, §3.1, WP1 "Surfpool data copy, curriculum data
 * copy"). git mv keeps their history.
 */
export const DATA_MOVES: ReadonlyArray<[string, string, string]> = [
  [
    "apps/docs/content/resources.json",
    "packages/docs-tooling/data/legacy/resources.json",
    "unreferenced legacy data (no importer at LEGACY_REF)",
  ],
  [
    "apps/docs/src/data/rpc-schema.json",
    "packages/docs-tooling/data/surfpool/rpc-schema.json",
    "WP4 gen:surfpool input",
  ],
  [
    "apps/docs/src/data/response_schema.json",
    "packages/docs-tooling/data/surfpool/response_schema.json",
    "WP4 gen:surfpool input",
  ],
  [
    "apps/docs/src/data/websocket_schema.json",
    "packages/docs-tooling/data/surfpool/websocket_schema.json",
    "WP4 gen:surfpool input",
  ],
  [
    "apps/docs/src/lib/rpc-endpoint-categories.ts",
    "packages/docs-tooling/legacy/surfpool/rpc-endpoint-categories.ts",
    "WP4 reference (endpoint categories); not compiled",
  ],
  [
    "apps/docs/src/lib/rpc-endpoints.ts",
    "packages/docs-tooling/legacy/surfpool/rpc-endpoints.ts",
    "WP4 reference; not compiled",
  ],
  [
    "apps/docs/src/lib/websocket-endpoints.ts",
    "packages/docs-tooling/legacy/surfpool/websocket-endpoints.ts",
    "WP4 reference; not compiled",
  ],
  [
    "apps/docs/src/lib/schema-parser.ts",
    "packages/docs-tooling/legacy/surfpool/schema-parser.ts",
    "WP4 reference; not compiled",
  ],
  [
    "apps/docs/src/utils/developers-learn-curriculum.ts",
    "packages/docs-tooling/data/bootcamp/developers-learn-curriculum.ts",
    "WP7 bootcamp video/resources; also read by apps/web/scripts/validate-content.mjs",
  ],
  [
    "apps/docs/src/utils/learn-tutorials.ts",
    "packages/docs-tooling/data/learn/learn-tutorials.ts",
    "WP7 learn order; WP10 /learn landing port",
  ],
  [
    "apps/docs/scripts/sync-diagram-themes.mjs",
    "packages/docs-tooling/scripts/sync-diagram-themes.mjs",
    "spec §1.2",
  ],
];

/** Collection roots that can be moved as whole directories. */
function rootMappings(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const loc of LEGACY_LOCALES) {
    if (DROPPED_LOCALES.includes(loc)) continue;
    const lp = loc === DEFAULT_LOCALE ? "" : `${loc}/`;
    out.push([`${CONTENT_PREFIX}docs/${loc}`, `apps/docs/${lp}docs`]);
    out.push([
      `${CONTENT_PREFIX}developers-learn/${loc}`,
      `apps/docs/${lp}developers/bootcamp`,
    ]);
    out.push([`${CONTENT_PREFIX}learn/${loc}`, `apps/docs/${lp}learn`]);
  }
  out.push([`${CONTENT_PREFIX}cookbook`, "apps/docs/developers/cookbook"]);
  for (const dir of CONTENT_ASSET_DIRS) {
    out.push([`${DOCS_PUBLIC}${dir}`, `${DOCS_ASSETS}${dir}`]);
  }
  return out;
}

export interface MoveOptions {
  dryRun?: boolean;
  redirects: RedirectIndex;
  ref?: string;
  log?: (msg: string) => void;
}

export interface MoveReport {
  rows: MoveRow[];
  unexpectedLocaleOnly: string[];
  keptUncovered: MoveRow[];
  elRedirectsMissingInWeb: number;
  executed: {
    dirMoves: number;
    fileMoves: number;
    removed: number;
    copied: number;
  };
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function writeMoveMap(
  rows: MoveRow[],
  file = path.join(migrationDir, "move-map.csv"),
) {
  const header = "src,dest,url,status,rule,redirect,note";
  const lines = rows.map((r) =>
    [r.src, r.dest, r.url, r.status, r.rule, r.redirect, r.note]
      .map(csvCell)
      .join(","),
  );
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [header, ...lines].join("\n") + "\n");
}

/** Parse the 4 x 4 movedRoutes redirects out of the legacy next.config.ts. */
export function legacyDocsAppRedirects(ref = LEGACY_REF) {
  const src = showFileAtRef(ref, "apps/docs/next.config.ts");
  const block = src.slice(
    src.indexOf("const movedRoutes"),
    src.indexOf("return movedRoutes"),
  );
  const pairs = [
    ...block.matchAll(/source:\s*"([^"]+)",\s*destination:\s*"([^"]+)"/g),
  ];
  return pairs.flatMap(([, s, d]) =>
    [
      [s!, d!],
      [`${s}.md`, `${d}.md`],
      [`/:locale${s}`, `/:locale${d}`],
      [`/:locale${s}.md`, `/:locale${d}.md`],
    ].map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    })),
  );
}

export function planMove(opts: Pick<MoveOptions, "redirects" | "ref">) {
  const ref = opts.ref ?? LEGACY_REF;
  const files = listFilesAtRef(ref, CONTENT_PREFIX);
  const { rows, unexpectedLocaleOnly } = classify(files);
  const idx = opts.redirects;
  let elMissing = 0;

  for (const row of rows) {
    if (row.rule === "R8") {
      const hit = row.url ? idx.match(row.url) : null;
      if (row.status === "removed-collision") {
        row.note += hit
          ? `; apps/web redirect ${hit.source}`
          : "; no apps/web redirect needed (URL still served)";
        continue;
      }
      if (hit) {
        row.redirect = hit.resolved;
        // Locale `.md` twins of locale-only pages already 404 today (the
        // legacy markdown route strips the locale and English has no such
        // page), so only the page URL has to be covered.
        const md = idx.match(`${row.url}.md`);
        row.note = `covered by apps/web redirect ${hit.source}${md ? "" : " (no .md twin; legacy .md already 404s)"}`;
      } else {
        const e = parseLegacyPath(row.src)!;
        row.status = "kept-uncovered";
        row.dest = newPath(e);
        row.note =
          "stale locale-only file kept: no apps/web redirect covers its URL";
      }
    }
    if (row.rule === "EL" && row.url) {
      const hit = idx.match(row.url);
      if (hit) row.note += `; apps/web redirect today: ${hit.source}`;
      else {
        elMissing++;
        row.note += "; apps/web redirect PENDING (WP9)";
      }
    }
  }

  // Data relocations.
  for (const [src, dest, note] of DATA_MOVES) {
    rows.push({
      src,
      dest,
      url: "",
      status: "moved-data",
      rule: "DATA",
      redirect: "",
      note,
    });
  }

  // Public assets.
  const assets = planAssets(ref);
  for (const rel of assets.move) {
    rows.push({
      src: `${DOCS_PUBLIC}${rel}`,
      dest: `${DOCS_ASSETS}${rel}`,
      url: `/docs-assets/${rel}`,
      status: "moved-asset",
      rule: "ASSET",
      redirect: "",
      note: "",
    });
  }
  for (const rel of assets.copyFromWeb) {
    rows.push({
      src: `${WEB_PUBLIC}${rel}`,
      dest: `${DOCS_ASSETS}${rel}`,
      url: `/docs-assets/${rel}`,
      status: "copied-asset",
      rule: "ASSET",
      redirect: "",
      note: "referenced by content, only in apps/web/public; web keeps its copy",
    });
  }

  // React routes inside the migrated namespaces.
  for (const loc of LEGACY_LOCALES) {
    const url = localePrefix(loc) + COLLECTION_BASE.learn;
    const dropped = DROPPED_LOCALES.includes(loc);
    rows.push({
      src: LEARN_LANDING_ROUTE,
      dest: dropped ? "" : "apps/web/src/app/[locale]/learn/page.tsx",
      url,
      status: dropped ? "removed-redirect" : "route-pending",
      rule: "ROUTE",
      redirect: dropped ? COLLECTION_BASE.learn : "",
      note: dropped
        ? "Greek dropped; apps/web redirect PENDING (WP9)"
        : "React landing; ported to apps/web by WP10 (spec §7.8)",
    });
  }
  for (const loc of LEGACY_LOCALES) {
    const url = localePrefix(loc) + DEVELOPERS_BASE;
    const dropped = DROPPED_LOCALES.includes(loc);
    rows.push({
      src: DEVELOPERS_LANDING_ROUTE,
      dest: dropped ? "" : "apps/web/src/app/[locale]/developers/page.tsx",
      url,
      status: dropped ? "removed-redirect" : "route-pending",
      rule: "ROUTE",
      redirect: dropped ? DEVELOPERS_BASE : "",
      note: dropped
        ? "Greek dropped; apps/web redirect PENDING (WP9)"
        : "React landing; rebuilt in apps/web by WP10 (spec §7)",
    });
  }

  return { rows, unexpectedLocaleOnly, assets, elMissing };
}

export function executeMove(opts: MoveOptions): MoveReport {
  const log = opts.log ?? (() => {});
  const { rows, unexpectedLocaleOnly, assets, elMissing } = planMove(opts);
  const executed = { dirMoves: 0, fileMoves: 0, removed: 0, copied: 0 };

  if (unexpectedLocaleOnly.length) {
    throw new Error(
      `Refusing to move: ${unexpectedLocaleOnly.length} locale-only files are not in R8_STALE_PATHS:\n` +
        unexpectedLocaleOnly.join("\n"),
    );
  }

  if (!opts.dryRun) {
    // 1. Removals (Greek, covered R8, collisions, app-shell public files).
    const tracked = new Set(listTrackedFiles("apps/docs"));
    const toRemove = rows
      .filter((r) => r.status.startsWith("removed") && r.rule !== "ROUTE")
      .map((r) => r.src)
      .concat(assets.drop.map((rel) => `${DOCS_PUBLIC}${rel}`))
      .filter((f) => tracked.has(f));
    if (toRemove.length) gitRm(toRemove);
    executed.removed = toRemove.length;
    log(`removed ${toRemove.length} files`);

    // 2. Whole-directory moves where every remaining file follows the prefix.
    const moving = rows.filter(
      (r) =>
        r.dest &&
        (r.status.startsWith("moved") || r.status === "kept-uncovered"),
    );
    const done = new Set<string>();
    const nowTracked = new Set(listTrackedFiles("apps/docs"));
    for (const [srcDir, destDir] of rootMappings()) {
      const under = [...nowTracked].filter((f) => f.startsWith(srcDir + "/"));
      if (!under.length) continue;
      const planned = new Map(
        moving
          .filter((r) => r.src.startsWith(srcDir + "/"))
          .map((r) => [r.src, r.dest]),
      );
      const uniform = under.every(
        (f) => planned.get(f) === destDir + f.slice(srcDir.length),
      );
      if (uniform && !existsSync(abs(destDir))) {
        mkdirSync(path.dirname(abs(destDir)), { recursive: true });
        gitMv(srcDir, destDir);
        under.forEach((f) => done.add(f));
        executed.dirMoves++;
        log(`git mv ${srcDir} -> ${destDir} (${under.length} files)`);
      }
    }

    // 3. Remaining per-file moves (data files, partial trees).
    for (const r of moving) {
      if (done.has(r.src) || r.status === "copied-asset") continue;
      // Already moved on a previous run (or never existed): skip.
      if (!existsSync(abs(r.src))) continue;
      mkdirSync(path.dirname(abs(r.dest)), { recursive: true });
      gitMv(r.src, r.dest);
      executed.fileMoves++;
    }

    // 4. Copies from apps/web/public.
    const copied: string[] = [];
    for (const r of rows.filter((x) => x.status === "copied-asset")) {
      if (existsSync(abs(r.dest))) continue;
      mkdirSync(path.dirname(abs(r.dest)), { recursive: true });
      copyFileSync(abs(r.src), abs(r.dest));
      copied.push(r.dest);
    }
    if (copied.length) gitAdd(copied);
    executed.copied = copied.length;
  }

  // Reports.
  rows.sort((a, b) =>
    a.src < b.src ? -1 : a.src > b.src ? 1 : a.url < b.url ? -1 : 1,
  );
  writeMoveMap(rows);
  writeFileSync(
    path.join(migrationDir, "assets-diff.txt"),
    assets.diff.join("\n") + "\n",
  );
  writeFileSync(
    path.join(migrationDir, "asset-refs.csv"),
    ["ref,file,source,rewritten_url,light_variant"]
      .concat(
        assets.refs.map((r) =>
          [r.ref, r.file, r.source, r.rewrittenUrl, r.lightVariant]
            .map(csvCell)
            .join(","),
        ),
      )
      .join("\n") + "\n",
  );
  writeFileSync(
    path.join(migrationDir, "docs-app-redirects.json"),
    JSON.stringify(
      {
        note: "Redirects defined in the deleted apps/docs/next.config.ts. They are NOT in apps/web/rewrites-redirects.ts yet; WP9 must port them (spec §5.8).",
        redirects: legacyDocsAppRedirects(opts.ref),
      },
      null,
      2,
    ) + "\n",
  );

  return {
    rows,
    unexpectedLocaleOnly,
    keptUncovered: rows.filter((r) => r.status === "kept-uncovered"),
    elRedirectsMissingInWeb: elMissing,
    executed,
  };
}
