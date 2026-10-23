/**
 * Enumerate every public URL the legacy Fumadocs app served for the docs,
 * cookbook, learn and bootcamp collections, in every locale. verify-urls.ts
 * checks each one still resolves; migration/legacy-urls.{txt,tsv} hold the
 * list.
 *
 * The content tree is read from git at LEGACY_REF. Route rules reproduced
 * from the legacy app (apps/docs/src/app at LEGACY_REF):
 *
 * - All loaders use `hideLocale: "default-locale"`: English has no prefix.
 * - docs/learn/bootcamp use `parser: "dir"`. The Fumadocs loader
 *   (15.6.12 `indexPages`) builds pages from default-language files only and
 *   looks up each locale's translation of those, falling back to English. So
 *   `/<loc>/docs/X` is served for every English X and for nothing else: a
 *   locale-only file (no English twin) never got a URL. Those URLs are still
 *   listed, as kind `locale-only`, so verify-urls can flag any that the new
 *   layout would newly serve (the old app redirected or 404'd them).
 * - cookbook has no locale folders; `/<loc>/developers/cookbook/X` serves the
 *   English page for every locale.
 * - bootcamp course pages 404 unless the course is in
 *   src/utils/developers-learn-curriculum.ts; lesson pages 404 unless the
 *   lesson is in that course's curriculum.
 * - `/learn` and `/developers` (and their `/<loc>/` forms) are React
 *   landings (no MDX).
 * - `index.mdx` maps to the folder URL.
 * - `.md` twins (`/docs/x.md`) exist for every docs/cookbook/bootcamp/learn
 *   page URL; they are derived 1:1 and not listed separately.
 * - `/docs/tags/<tag>` pages: none exist (no content sets documentationTags).
 */
import type { Collection, LegacyUrl } from "../types.ts";
import { listFilesAtRef, showFileAtRef } from "../lib/git.ts";
import { LEGACY_LOCALES, DEFAULT_LOCALE } from "../lib/locales.ts";
import { LEGACY_REF } from "../lib/paths.ts";
import {
  CONTENT_PREFIX,
  COLLECTION_BASE,
  isMdx,
  legacyPath,
  legacyUrl,
  localePrefix,
  parseLegacyPath,
  type LegacyEntry,
} from "../move/rules.ts";

export const CURRICULUM_PATH =
  "apps/docs/src/utils/developers-learn-curriculum.ts";
export const LEARN_LANDING_ROUTE = "apps/docs/src/app/[locale]/learn/page.tsx";
export const DEVELOPERS_LANDING_ROUTE =
  "apps/docs/src/app/[locale]/developers/page.tsx";
/** URL of the /developers landing (not a content collection). */
export const DEVELOPERS_BASE = "/developers";

export interface Curriculum {
  /** course slug -> lesson slugs */
  courses: Map<string, Set<string>>;
}

/**
 * Extract course and lesson slugs from the `developersLearnCourses` literal.
 * Courses are the `slug:` keys at object depth 1, lessons at depth 2 (inside
 * `lessons: [...]`). Uses bracket depth, not indentation.
 */
export function parseCurriculum(source: string): Curriculum {
  const start = source.indexOf("export const developersLearnCourses");
  if (start < 0) throw new Error("developersLearnCourses not found");
  const open = source.indexOf("[", source.indexOf("=", start));
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(open, end + 1);
  const courses = new Map<string, Set<string>>();
  let current: Set<string> | null = null;
  depth = 0;
  const re = /[[\]{}]|\bslug:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tok = m[0];
    if (tok === "[" || tok === "{") depth++;
    else if (tok === "]" || tok === "}") depth--;
    else if (m[1]) {
      // depth 2: course object inside the array; depth 4: lesson object
      // inside `lessons: [ { ... } ]`.
      if (depth === 2) {
        current = new Set();
        courses.set(m[1], current);
      } else if (depth === 4 && current) {
        current.add(m[1]);
      }
    }
  }
  return { courses };
}

export interface LegacyUrlResult {
  urls: LegacyUrl[];
  /** Files under bootcamp that no route serves (not in the curriculum). */
  unroutedBootcampFiles: string[];
}

export function enumerateLegacyUrls(
  files: readonly string[],
  curriculum: Curriculum,
  locales: readonly string[] = LEGACY_LOCALES,
): LegacyUrlResult {
  const byCollectionLocale = new Map<string, Map<string, LegacyEntry>>();
  for (const f of files) {
    const e = parseLegacyPath(f);
    if (!e || !isMdx(e.rel)) continue;
    const key = `${e.collection}:${e.locale}`;
    if (!byCollectionLocale.has(key)) byCollectionLocale.set(key, new Map());
    byCollectionLocale.get(key)!.set(e.rel, e);
  }
  const get = (c: Collection, l: string) =>
    byCollectionLocale.get(`${c}:${l}`) ?? new Map<string, LegacyEntry>();

  const urls: LegacyUrl[] = [];
  const unrouted = new Set<string>();

  const bootcampRouted = (rel: string) => {
    const parts = rel.replace(/\.mdx$/, "").split("/");
    if (parts.length === 1) return parts[0] === "index";
    const [course, lesson] = parts;
    const lessons = curriculum.courses.get(course!);
    if (!lessons) return false;
    if (parts.length === 2 && lesson === "index") return true;
    return parts.length === 2 && lessons.has(lesson!);
  };

  for (const collection of ["docs", "cookbook", "bootcamp", "learn"] as const) {
    const en = get(collection, DEFAULT_LOCALE);
    for (const locale of locales) {
      // cookbook has no locale folders: every locale serves English.
      const own =
        collection === "cookbook" && locale !== DEFAULT_LOCALE
          ? new Map<string, LegacyEntry>()
          : get(collection, locale);
      const rels = new Set([...en.keys(), ...own.keys()]);
      // English twin by URL, not file name: x.mdx and x/index.mdx share one.
      const enUrls = new Set(
        [...en.keys()].map((rel) =>
          legacyUrl({ collection, locale: DEFAULT_LOCALE, rel }),
        ),
      );
      for (const rel of [...rels].sort()) {
        if (collection === "bootcamp" && !bootcampRouted(rel)) {
          unrouted.add(legacyPath(own.get(rel) ?? en.get(rel)!));
          continue;
        }
        const ownEntry = own.get(rel);
        const served = ownEntry ?? en.get(rel)!;
        const hasEn = enUrls.has(
          legacyUrl({ collection, locale: DEFAULT_LOCALE, rel }),
        );
        urls.push({
          url: legacyUrl({ collection, locale, rel }),
          collection,
          locale,
          kind: !hasEn ? "locale-only" : ownEntry ? "page" : "fallback",
          servedFrom: legacyPath(served),
        });
      }
      if (collection === "learn") {
        urls.push({
          url: localePrefix(locale) + COLLECTION_BASE.learn,
          collection,
          locale,
          kind: "route",
          servedFrom: LEARN_LANDING_ROUTE,
        });
      }
    }
  }
  for (const locale of locales) {
    urls.push({
      url: localePrefix(locale) + DEVELOPERS_BASE,
      collection: "developers",
      locale,
      kind: "route",
      servedFrom: DEVELOPERS_LANDING_ROUTE,
    });
  }

  // Two legacy files can map to one URL (x.mdx and x/index.mdx). Keep one
  // row per URL and list both sources.
  const byUrl = new Map<string, LegacyUrl>();
  for (const u of urls) {
    const prev = byUrl.get(u.url);
    if (!prev) byUrl.set(u.url, u);
    else if (!prev.servedFrom.split(" | ").includes(u.servedFrom))
      prev.servedFrom += ` | ${u.servedFrom}`;
  }
  const deduped = [...byUrl.values()].sort((a, b) =>
    a.url < b.url ? -1 : a.url > b.url ? 1 : 0,
  );
  return { urls: deduped, unroutedBootcampFiles: [...unrouted].sort() };
}

export function loadLegacyTree(ref = LEGACY_REF) {
  const files = listFilesAtRef(ref, CONTENT_PREFIX);
  const curriculum = parseCurriculum(showFileAtRef(ref, CURRICULUM_PATH));
  return { files, curriculum };
}
