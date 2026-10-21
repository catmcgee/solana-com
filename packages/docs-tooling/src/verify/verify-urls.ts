/**
 * Legacy URL parity (spec §4.4 item 3, last bullet; WP1 acceptance).
 *
 * Every legacy URL must resolve to exactly one of:
 * - `exact`             one MDX file in the new layout serves the same path
 * - `redirect`          an apps/web redirect (live on this branch) covers it
 * - `redirect-pending`  a redirect is recorded (move-map.csv, Greek rule,
 *                       migration/docs-app-redirects.json) but apps/web does
 *                       not have it yet; WP9 must add it
 *                       (migration/pending-web-work.json). Reported, not a
 *                       failure
 * - `cookbook-rewrite`  /<loc>/developers/cookbook/X -> English file (by design)
 * - `fallback-en`       translation missing; English file exists. Reported as
 *                       a list (decisions.md), not a failure
 * - `route-pending`     React route moving to apps/web (/learn, /developers)
 * Anything else (`unmapped`, `ambiguous`) fails.
 *
 * Redirects are followed: the chain must end, within MAX_REDIRECT_HOPS (2),
 * on a file, a translation fallback, an apps/web landing or an external
 * URL. A longer chain is `redirect-chain`, a dead end `redirect-dead`; both
 * fail. Since 2026-10-16 every legacy /docs URL redirects (the docs moved to
 * /developers/docs), so the docs pages class as `redirect`.
 *
 * Precedence follows Next.js: redirects run before rewrites, so a URL that a
 * redirect matches is a redirect even when a file in the new layout has the
 * same path. The legacy docs app's own redirects (docs-app-redirects.json)
 * count the same way: a kept file at a redirected path (the 17 locale
 * payment-button pages) is `redirect-pending`, not `exact`.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { LegacyUrl, MoveRow } from "../types.ts";
import {
  DEFAULT_LOCALE,
  DROPPED_LOCALES,
  LEGACY_LOCALES,
} from "../lib/locales.ts";
import { migrationDir, repoRoot } from "../lib/paths.ts";
import {
  candidateFilesForUrl,
  COLLECTION_BASE,
  LAYOUT_BASE,
} from "../move/rules.ts";
import {
  DEVELOPERS_BASE,
  enumerateLegacyUrls,
  loadLegacyTree,
} from "./legacy-urls.ts";
import {
  buildRedirectIndex,
  type NextRedirect,
  type RedirectIndex,
} from "./redirects.ts";

export const DOCS_APP_REDIRECTS_FILE = "docs-app-redirects.json";

export type UrlClass =
  | "exact"
  | "redirect"
  | "redirect-pending"
  | "cookbook-rewrite"
  | "fallback-en"
  | "route-pending"
  | "unmapped"
  | "ambiguous"
  | "redirect-chain"
  | "redirect-dead";

export interface UrlResolution {
  url: string;
  collection: LegacyUrl["collection"];
  locale: string;
  legacyKind: LegacyUrl["kind"];
  cls: UrlClass;
  target: string;
  /** For redirects: what answers the final URL (`exact`, `fallback-en`, ...). */
  landing?: string;
}

export function parseMoveMap(text: string): MoveRow[] {
  const lines = text.split("\n").filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? "");
  return lines.map((line) => {
    const cells = parseCsvLine(line);
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = cells[i] ?? ""));
    return o as unknown as MoveRow;
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Every .mdx/.md under apps/docs except snippets/ and node_modules/. */
export function listLayoutPages(
  root = path.join(repoRoot, "apps/docs"),
): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = path.join(dir, name);
      const rel = path.relative(repoRoot, p).split(path.sep).join("/");
      if (rel === "apps/docs/snippets") continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.mdx?$/.test(name)) out.add(rel);
    }
  };
  walk(root);
  return out;
}

export interface ResolveOptions {
  /** apps/web redirects (live). Without it no URL classes as `redirect`. */
  web?: RedirectIndex;
  /** Recorded redirects not yet in apps/web (legacy docs-app redirects). */
  pending?: RedirectIndex;
}

/** Most redirects a legacy URL may take before it must answer 200. */
export const MAX_REDIRECT_HOPS = 2;

const LOCALE_SEGMENT = new RegExp(
  `^/(${LEGACY_LOCALES.filter((l) => l !== DEFAULT_LOCALE).join("|")})(?=/|$)`,
);

export function resolveUrls(
  legacy: readonly LegacyUrl[],
  pages: ReadonlySet<string>,
  moveMap: readonly MoveRow[],
  opts: ResolveOptions = {},
): UrlResolution[] {
  const byUrl = new Map<string, MoveRow[]>();
  for (const r of moveMap) {
    if (!r.url) continue;
    if (!byUrl.has(r.url)) byUrl.set(r.url, []);
    byUrl.get(r.url)!.push(r);
  }
  const fileFor = (url: string) =>
    candidateFilesForUrl(url).filter((f) => pages.has(f));
  const stripLocale = (url: string, loc: string) => url.slice(loc.length + 1);

  /**
   * What answers a URL with no redirect in front of it: a file (`exact`),
   * the English file for a missing translation (`fallback-en`, an apps/web
   * rewrite), the English cookbook (`cookbook-rewrite`), or an apps/web
   * landing (`route`). Null when nothing would answer 200.
   */
  const served = (
    url: string,
  ): { cls: UrlClass | "route"; target: string } | null => {
    const files = fileFor(url);
    if (files.length > 1)
      return { cls: "ambiguous", target: files.join(" | ") };
    if (files.length === 1) return { cls: "exact", target: files[0]! };
    const loc = LOCALE_SEGMENT.exec(url)?.[1];
    const bare = loc ? stripLocale(url, loc) || "/" : url;
    if (bare === COLLECTION_BASE.learn || bare === DEVELOPERS_BASE)
      return { cls: "route", target: url };
    if (loc && !DROPPED_LOCALES.includes(loc)) {
      const en = fileFor(bare);
      if (en.length === 1)
        return {
          cls: bare.startsWith(`${LAYOUT_BASE.cookbook}`)
            ? "cookbook-rewrite"
            : "fallback-en",
          target: en[0]!,
        };
    }
    return null;
  };

  /** Follow apps/web redirects from `url` (Next.js: redirects run first). */
  const follow = (url: string, index: RedirectIndex) => {
    let cur = url;
    let hops = 0;
    for (;;) {
      const m = index.match(cur);
      if (!m) return { final: cur, hops };
      hops += 1;
      cur = m.resolved.replace(/[#?].*$/, "") || "/";
      if (/^https?:\/\//.test(m.resolved)) return { final: m.resolved, hops };
      if (hops > MAX_REDIRECT_HOPS) return { final: cur, hops };
    }
  };

  return legacy.map((u) => {
    const base = {
      url: u.url,
      collection: u.collection,
      locale: u.locale,
      legacyKind: u.kind,
    };
    const rows = byUrl.get(u.url) ?? [];

    const route = rows.find((r) => r.status === "route-pending");
    if (route) return { ...base, cls: "route-pending", target: route.dest };

    // A redirect must land, within MAX_REDIRECT_HOPS, on something that
    // answers 200 (a page, a translation fallback, an apps/web landing or an
    // external site). The final URL is the target.
    for (const [index, cls] of [
      [opts.web, "redirect"],
      [opts.pending, "redirect-pending"],
    ] as const) {
      if (!index?.match(u.url)) continue;
      const { final, hops } = follow(u.url, index);
      if (hops > MAX_REDIRECT_HOPS)
        return {
          ...base,
          cls: "redirect-chain",
          target: `${final} (${hops} hops)`,
        };
      if (/^https?:\/\//.test(final)) return { ...base, cls, target: final };
      const end = served(final);
      if (!end || end.cls === "ambiguous")
        return { ...base, cls: "redirect-dead", target: final };
      return {
        ...base,
        cls,
        target: hops > 1 ? `${final} (${hops} hops)` : final,
        landing: end.cls,
      };
    }

    const direct = served(u.url);
    if (direct && direct.cls !== "route")
      return { ...base, cls: direct.cls as UrlClass, target: direct.target };

    // Recorded redirects that apps/web does not have yet (R8 removals not
    // covered by an apps/web rule, Greek pages and the Greek wildcard).
    const removed = rows.find(
      (r) => r.status === "removed-redirect" && r.redirect,
    );
    if (removed)
      return { ...base, cls: "redirect-pending", target: removed.redirect };
    if (DROPPED_LOCALES.includes(u.locale)) {
      // /el/<collection>/* -> /<collection>/* (decisions.md). Covers Greek
      // URLs that served English via fallback and so have no move-map row.
      const target = stripLocale(u.url, u.locale);
      if (served(target)) return { ...base, cls: "redirect-pending", target };
    }
    return { ...base, cls: "unmapped", target: "" };
  });
}

/** Every move-map row must resolve (spec §4.4 item 1, last sentence). */
export function checkMoveMap(
  rows: readonly MoveRow[],
  pages: ReadonlySet<string>,
) {
  const problems: string[] = [];
  const exists = (p: string) => existsSync(path.join(repoRoot, p));
  for (const r of rows) {
    switch (r.status) {
      case "moved":
      case "moved-meta":
      case "moved-asset":
      case "moved-data":
      case "kept-uncovered":
        if (!exists(r.dest))
          problems.push(`dest missing: ${r.dest} (from ${r.src})`);
        if (r.src.startsWith("apps/docs/") && exists(r.src))
          problems.push(`src still present: ${r.src}`);
        break;
      case "copied-asset":
        if (!exists(r.dest)) problems.push(`copy missing: ${r.dest}`);
        break;
      case "removed-redirect":
        if (exists(r.src) && r.rule !== "ROUTE")
          problems.push(`not removed: ${r.src}`);
        if (!r.redirect) problems.push(`removed without redirect: ${r.src}`);
        break;
      case "removed-collision":
        if (exists(r.src)) problems.push(`not removed: ${r.src}`);
        if (!pages.has(r.dest))
          problems.push(`collision partner missing: ${r.dest}`);
        break;
      case "removed":
        if (exists(r.src)) problems.push(`not removed: ${r.src}`);
        break;
      case "route-pending":
        break;
    }
  }
  return problems;
}

/** Collection + locale of a page in the new layout. */
export function layoutKey(
  file: string,
): { collection: string; locale: string } | null {
  const rel = file.replace(/^apps\/docs\//, "");
  const parts = rel.split("/");
  let locale = DEFAULT_LOCALE;
  if (LEGACY_LOCALES.includes(parts[0]!) && parts[0] !== DEFAULT_LOCALE)
    locale = parts.shift()!;
  if (parts[0] === "developers" && parts[1] === "docs")
    return { collection: "docs", locale };
  if (parts[0] === "learn") return { collection: "learn", locale };
  if (parts[0] === "developers" && parts[1] === "cookbook")
    return { collection: "cookbook", locale };
  if (parts[0] === "developers" && parts[1] === "bootcamp")
    return { collection: "bootcamp", locale };
  return null;
}

/** JS/CSS that Mintlify would inject on every page (WP1 acceptance). */
export function strayAssetsInDocsRoot(
  allow: readonly string[] = [
    "apps/docs/run-examples.js",
    // Floating "Ask AI" pill (redesign 2026-10-15; styles/ask-ai.css).
    "apps/docs/ask-ai.js",
    // "Open tutorial in Playground" block on tutorial intro pages (styles/playground.css).
    "apps/docs/playground.js",
    // One-click light/dark switch in the header (styles/theme.css).
    "apps/docs/theme-toggle.js",
    // Logo link to /developers as a full page load.
    "apps/docs/logo-link.js",
    // Prerenders /developers when the logo is hovered (Speculation Rules).
    "apps/docs/prerender-home.js",
    // Live "Try it" on RPC method pages (styles/rpc-try-it.css).
    "apps/docs/rpc-try-it.js",
    // Opens the docs search for /developers/docs?q= links from the /developers header.
    "apps/docs/search-handoff.js",
    // Video chapters seek the embedded player; video cards open a dialog
    // (styles/video.css; markup from the video-guides transform).
    "apps/docs/video-chapters.js",
    // Copy button and origin swap for the Start here agent banner
    // (styles/agent-banner.css).
    "apps/docs/agent-banner.js",
    // Puts the reader's OS first in .sol-os-tabs groups (Quickstart install).
    "apps/docs/os-tabs.js",
    "apps/docs/styles/",
  ],
) {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".source" || name === ".next")
        continue;
      const p = path.join(dir, name);
      const rel = path.relative(repoRoot, p).split(path.sep).join("/");
      if (statSync(p).isDirectory()) walk(p);
      else if (
        /\.(m?js|jsx|css)$/.test(name) &&
        !allow.some((a) => rel === a || rel.startsWith(a))
      )
        out.push(rel);
    }
  };
  walk(path.join(repoRoot, "apps/docs"));
  return out;
}

/** Redirects from the deleted apps/docs/next.config.ts, not yet in apps/web. */
export function loadDocsAppRedirects(): NextRedirect[] {
  const file = path.join(migrationDir, DOCS_APP_REDIRECTS_FILE);
  if (!existsSync(file)) return [];
  return (
    JSON.parse(readFileSync(file, "utf8")) as { redirects: NextRedirect[] }
  ).redirects;
}

export function runVerifyUrls(
  opts: { write?: boolean; web?: RedirectIndex } = {},
) {
  const { files, curriculum } = loadLegacyTree();
  const { urls } = enumerateLegacyUrls(files, curriculum);
  const mapFile = path.join(migrationDir, "move-map.csv");
  const moveMap = existsSync(mapFile)
    ? parseMoveMap(readFileSync(mapFile, "utf8"))
    : [];
  const pages = listLayoutPages();
  const docsAppRedirects = loadDocsAppRedirects();
  const pending = docsAppRedirects.length
    ? buildRedirectIndex(docsAppRedirects)
    : undefined;
  const resolutions = resolveUrls(urls, pages, moveMap, {
    web: opts.web,
    pending,
  });
  const moveMapProblems = checkMoveMap(moveMap, pages);
  const stray = strayAssetsInDocsRoot();

  // Counts.
  const before = new Map<string, number>();
  const after = new Map<string, Map<string, number>>();
  for (const r of resolutions) {
    const k = `${r.collection}\t${r.locale}`;
    before.set(k, (before.get(k) ?? 0) + 1);
    if (!after.has(k)) after.set(k, new Map());
    const m = after.get(k)!;
    m.set(r.cls, (m.get(r.cls) ?? 0) + 1);
  }
  const layout = new Map<string, number>();
  for (const f of pages) {
    const key = layoutKey(f);
    const k = key ? `${key.collection}\t${key.locale}` : `other\t-`;
    layout.set(k, (layout.get(k) ?? 0) + 1);
  }

  const failures = resolutions.filter(
    (r) =>
      r.cls === "unmapped" ||
      r.cls === "ambiguous" ||
      r.cls === "redirect-chain" ||
      r.cls === "redirect-dead",
  );
  const missingTranslations = resolutions.filter(
    (r) => r.cls === "fallback-en" || r.landing === "fallback-en",
  );
  const redirectPending = resolutions.filter(
    (r) => r.cls === "redirect-pending",
  );
  // Files still in the layout at a URL that a (pending) redirect claims:
  // Mintlify would serve them until the redirect lands in apps/web.
  const shadowedFiles = redirectPending
    .flatMap((r) => candidateFilesForUrl(r.url).filter((f) => pages.has(f)))
    .sort();

  if (opts.write !== false) {
    writeFileSync(
      path.join(migrationDir, "verify-urls.tsv"),
      ["url\tcollection\tlocale\tlegacy_kind\tclass\ttarget"]
        .concat(
          resolutions.map((r) =>
            [r.url, r.collection, r.locale, r.legacyKind, r.cls, r.target].join(
              "\t",
            ),
          ),
        )
        .join("\n") + "\n",
    );
    writeFileSync(
      path.join(migrationDir, "missing-translations.txt"),
      missingTranslations.map((r) => `${r.url}\t${r.target}`).join("\n") + "\n",
    );
  }

  return {
    total: urls.length,
    resolutions,
    failures,
    missingTranslations,
    redirectPending,
    shadowedFiles,
    moveMapProblems,
    stray,
    before,
    after,
    layout,
  };
}
