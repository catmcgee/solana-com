/**
 * anchors: in-content `#fragment` links rewritten to the heading ids
 * the docs generate.
 *
 * Fumadocs gave headings github-slugger ids; the docs use
 * @sindresorhus/slugify (src/lib/slugs.ts). Authors (and Lingo, which
 * translates headings but not link fragments) wrote anchors against the old
 * ids. For every link (`[x](#a)`, `[x](/docs/p#a)`, `<Card href="…#a">`,
 * definitions) whose page the docs serve:
 *
 * 1. The fragment already is a docs id of the target page: kept.
 * 2. It is the legacy (github-slugger) id of a heading on the target page,
 *    or its docs id before render-time cleanup (`#need-help?`, written
 *    by earlier runs of this transform; see `cleanHeadingId`):
 *    replaced by that heading's docs id. This keeps every link that
 *    worked on the legacy site working (e.g. `#actionsjson` ->
 *    `#actions-json`, `#rules---pathpattern` -> `#rules-pathpattern`).
 * 3. The target is a locale page and the fragment is a (legacy or
 *    docs) id of the ENGLISH twin's heading n, and the locale page has
 *    the same heading outline (count and levels): replaced by the locale
 *    heading n's id. These links were already broken on the legacy site
 *    (translated heading, English fragment); the outline check keeps the
 *    mapping exact.
 * 4. Anything else is left as is and reported as a warning (a dead anchor
 *    that was dead before the migration too).
 *
 * Headings: markdown headings, `<Step title>` (the docs give Steps ids;
 * steps lifted from an H3 by steps.ts carry `titleSize="h3"` and were legacy
 * headings, scrolly steps were not). Other pages are read from the working
 * tree (cached; unconverted pages are understood too: `## !!steps T` counts
 * as a Step). A second convert run is therefore needed only when a target
 * page's headings change; `convert --check` catches that.
 *
 * Order 920: after fences (900) and web3js-specifier (910), when every
 * heading and Step title is final.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { AstNode, ConvertFile, Transform } from "../../types.ts";
import { mdxCodec } from "../codec.ts";
import { LEGACY_LOCALES } from "../../lib/locales.ts";
import {
  legacySlugger,
  docsSlugger,
  docsSluggerWithRaw,
} from "../../lib/slugs.ts";
import { isJsx, strAttr, walk } from "./_mdx.ts";
import { docsServes, pageUrl } from "./site-links.ts";

interface Entry {
  depth: number;
  legacy?: string;
  docs: string;
  /** Docs id before render-time punctuation cleanup (`need-help?`). */
  raw?: string;
}

const LOCALES = LEGACY_LOCALES.filter((l) => l !== "en");

function text(n: AstNode): string {
  if (n.type === "text" || n.type === "inlineCode")
    return String(n.value ?? "");
  return (n.children ?? []).map(text).join("");
}

/** Markdown in a Step title string (steps.ts keeps inline code) -> text. */
function plainTitle(s: string): string {
  return s.replace(/\\([\\`*_[\]<>{}])/g, "$1").replace(/[`*]/g, "");
}

export function headingEntries(tree: AstNode): Entry[] {
  const legacy = legacySlugger();
  const mintPair = docsSluggerWithRaw();
  const ids = (t: string) => {
    const { id, raw } = mintPair(t);
    return raw === id ? { docs: id } : { docs: id, raw };
  };
  // Accordion/Tab/View ids (remarkComponentIds): own counter, not part of
  // the heading outline (depth 0 entries are skipped by sameOutline).
  const component = docsSlugger();
  const out: Entry[] = [];
  walk(tree, (n) => {
    if (n.type === "code" || n.type === "yaml") return "skip";
    if (n.type === "heading") {
      const t = text(n).trim();
      const steps = /^!!steps\s+(.+)$/.exec(t);
      if (steps) {
        out.push({ depth: 3, ...ids(steps[1]!) });
        return "skip";
      }
      if (/^!/.test(t)) return "skip"; // Code Hike block marker
      out.push({ depth: Number(n.depth), legacy: legacy(t), ...ids(t) });
      return "skip";
    }
    if (isJsx(n, "Accordion") || isJsx(n, "Tab") || isJsx(n, "View")) {
      const id = strAttr(n, "id");
      const title = strAttr(n, "title");
      if (id || title)
        out.push({ depth: 0, docs: id ?? component(plainTitle(title!)) });
    }
    if (isJsx(n, "Step")) {
      const title = strAttr(n, "title");
      if (title) {
        const t = plainTitle(title);
        const size = strAttr(n, "titleSize");
        out.push({
          depth: size === "h2" ? 2 : size === "h4" ? 4 : 3,
          legacy: size ? legacy(t) : undefined,
          ...ids(t),
        });
      }
    }
    return;
  });
  return out;
}

const fileCache = new Map<string, { mtime: number; entries: Entry[] }>();
function entriesOf(abs: string): Entry[] | undefined {
  if (!existsSync(abs)) return undefined;
  const mtime = statSync(abs).mtimeMs;
  const hit = fileCache.get(abs);
  if (hit && hit.mtime === mtime) return hit.entries;
  let entries: Entry[];
  try {
    entries = headingEntries(
      mdxCodec.parse(readFileSync(abs, "utf8"), { path: abs }).tree,
    );
  } catch {
    return undefined;
  }
  fileCache.set(abs, { mtime, entries });
  return entries;
}

/** apps/docs file for a root-relative page URL, if any. */
function fileForUrl(repoRoot: string, url: string): string | undefined {
  const p = url.replace(/\/$/, "");
  for (const c of [`${p}.mdx`, `${p}.md`, `${p}/index.mdx`, `${p}/index.md`]) {
    const abs = path.join(repoRoot, "apps/docs", c);
    if (existsSync(abs)) return abs;
  }
  return undefined;
}

function localeOf(url: string): string | undefined {
  const first = url.split("/")[1];
  return first && LOCALES.includes(first) ? first : undefined;
}

/** Heading outline only (component ids, depth 0, are not positional). */
function outline(e: Entry[]) {
  return e.filter((x) => x.depth > 0);
}
function sameOutline(a: Entry[], b: Entry[]) {
  return a.length === b.length && a.every((e, i) => e.depth === b[i]!.depth);
}

function decode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const transform: Transform = {
  name: "anchors",
  order: 920,
  appliesTo: (source) => source.includes("#"),
  run(tree, file: ConvertFile, ctx) {
    const self = pageUrl(file.path);
    let selfEntries: Entry[] | undefined;
    const resolve = (href: string): string | undefined => {
      const m = /^([^#]*)#(.+)$/.exec(href);
      if (!m) return undefined;
      const [, base, rawFrag] = m as unknown as [string, string, string];
      if (base && (!base.startsWith("/") || !docsServes(base)))
        return undefined;
      const url = base || self;
      const frag = decode(rawFrag);
      const entries =
        url === self
          ? (selfEntries ??= headingEntries(tree))
          : (() => {
              const abs = fileForUrl(ctx.repoRoot, url.split("?")[0]!);
              return abs ? entriesOf(abs) : undefined;
            })();
      if (!entries) return undefined; // missing page: broken-links reports it
      if (entries.some((e) => e.docs === frag)) return undefined;
      const legacy = entries.find((e) => e.legacy === frag || e.raw === frag);
      if (legacy) return `${base}#${legacy.docs}`;
      const loc = localeOf(url);
      if (loc) {
        const enAbs = fileForUrl(ctx.repoRoot, url.slice(loc.length + 1));
        const en = enAbs ? entriesOf(enAbs) : undefined;
        const enH = en && outline(en);
        const locH = outline(entries);
        if (enH && sameOutline(enH, locH)) {
          const i = enH.findIndex(
            (e) => e.legacy === frag || e.docs === frag || e.raw === frag,
          );
          if (i >= 0) return `${base}#${locH[i]!.docs}`;
        }
      }
      ctx.warn(
        `anchor ${href} matches no heading on ${url} (dead before the migration too)`,
      );
      return undefined;
    };
    walk(tree, (n) => {
      if (n.type === "code" || n.type === "inlineCode") return "skip";
      if (
        (n.type === "link" || n.type === "definition") &&
        typeof n.url === "string"
      ) {
        const next = resolve(n.url);
        if (next) n.url = next;
        return;
      }
      if (isJsx(n)) {
        for (const a of n.attributes) {
          if (
            a.type === "mdxJsxAttribute" &&
            a.name === "href" &&
            typeof a.value === "string"
          ) {
            const next = resolve(a.value);
            if (next) a.value = next;
          }
        }
      }
      return;
    });
  },
};
