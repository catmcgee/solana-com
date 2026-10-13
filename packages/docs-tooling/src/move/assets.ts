/**
 * Public assets -> apps/docs/docs-assets (spec §1.4).
 *
 * - Canonical source is the union of apps/docs/public (at LEGACY_REF) and
 *   apps/web/public; apps/docs/public wins on conflict because it carries the
 *   `*-light.svg` diagram variants.
 * - apps/docs/public/{assets,images,img,docs}/** is git-mv'd to
 *   apps/docs/docs-assets/<same path>. App-shell files (icons, robots.txt,
 *   webmanifest, search-console token, whitepaper PDF, webpack-inlined
 *   src/img SVGs) are removed with the Next app; apps/web/public has its own.
 * - Files referenced by content that exist only in apps/web/public are
 *   copied in; apps/web keeps its copy so external hotlinks keep working.
 * - Content keeps its `/assets/X` URLs until convert rewrites them to
 *   `/docs-assets/assets/X` (WP2 images.ts / themed-image.ts / html.ts).
 */
import { execFileSync } from "node:child_process";
import { DOCS_PREFIX } from "./rules.ts";
import { LEGACY_REF, repoRoot } from "../lib/paths.ts";

export const DOCS_PUBLIC = "apps/docs/public/";
export const WEB_PUBLIC = "apps/web/public/";
export const DOCS_ASSETS = `${DOCS_PREFIX}docs-assets/`;

/** Top-level folders of apps/docs/public that hold content assets. */
export const CONTENT_ASSET_DIRS = ["assets", "images", "img", "docs"] as const;

/** URL prefixes content uses for public assets. */
const ASSET_URL_RE = String.raw`/(assets|images|img)/[A-Za-z0-9_@%+~./-]+\.(png|jpe?g|gif|svg|webp|avif|mp4|webm|pdf)`;

function git(args: string[]) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** path -> blob sha for every tracked file under `prefix` at `ref`. */
export function blobsAtRef(ref: string, prefix: string) {
  const out = new Map<string, string>();
  for (const line of git(["ls-tree", "-r", ref, "--", prefix]).split("\n")) {
    if (!line) continue;
    const [meta, file] = line.split("\t");
    const sha = meta!.split(" ")[2]!;
    out.set(file!.slice(prefix.length), sha);
  }
  return out;
}

/** Every asset URL referenced from legacy content (MDX), deduped, sorted. */
export function contentAssetRefs(ref = LEGACY_REF): string[] {
  let out = "";
  try {
    out = git([
      "grep",
      "-h",
      "-o",
      "-E",
      ASSET_URL_RE,
      ref,
      "--",
      "apps/docs/content",
    ]);
  } catch {
    return [];
  }
  return [...new Set(out.split("\n").filter(Boolean))].sort();
}

export interface AssetPlan {
  /** docs public rel path -> moved to docs-assets */
  move: string[];
  /** docs public rel paths removed with the app shell */
  drop: string[];
  /** web-only rel paths referenced by content -> copied into docs-assets */
  copyFromWeb: string[];
  refs: Array<{
    ref: string;
    file: string;
    source: "docs-public" | "web-public" | "missing";
    rewrittenUrl: string;
    lightVariant: "present" | "absent" | "n/a";
  }>;
  diff: string[];
}

export function planAssets(ref = LEGACY_REF, webRef = "HEAD"): AssetPlan {
  const docs = blobsAtRef(ref, DOCS_PUBLIC);
  const web = blobsAtRef(webRef, WEB_PUBLIC);
  const move: string[] = [];
  const drop: string[] = [];
  for (const rel of [...docs.keys()].sort()) {
    const top = rel.split("/")[0]!;
    if ((CONTENT_ASSET_DIRS as readonly string[]).includes(top)) move.push(rel);
    else drop.push(rel);
  }
  const moved = new Set(move);

  const refs: AssetPlan["refs"] = [];
  const copy = new Set<string>();
  for (const url of contentAssetRefs(ref)) {
    const rel = decodeURIComponent(url.slice(1));
    const inDocs = moved.has(rel);
    const inWeb = web.has(rel);
    const source = inDocs ? "docs-public" : inWeb ? "web-public" : "missing";
    if (!inDocs && inWeb) copy.add(rel);
    const lightRel = rel.replace(/\.svg$/, "-light.svg");
    const light = rel.endsWith(".svg")
      ? moved.has(lightRel) || web.has(lightRel)
        ? "present"
        : "absent"
      : "n/a";
    if (light === "present" && !moved.has(lightRel)) copy.add(lightRel);
    refs.push({
      ref: url,
      file: `${DOCS_ASSETS}${rel}`,
      source,
      rewrittenUrl: `/docs-assets${url}`,
      lightVariant: light,
    });
  }

  // diff -rq equivalent between the two public folders (by blob hash).
  const diff: string[] = [];
  const all = new Set([...docs.keys(), ...web.keys()]);
  for (const rel of [...all].sort()) {
    const a = docs.get(rel);
    const b = web.get(rel);
    if (a && !b) diff.push(`Only in apps/docs/public: ${rel}`);
    else if (!a && b) diff.push(`Only in apps/web/public: ${rel}`);
    else if (a !== b)
      diff.push(
        `Files apps/docs/public/${rel} and apps/web/public/${rel} differ`,
      );
  }

  return { move, drop, copyFromWeb: [...copy].sort(), refs, diff };
}
