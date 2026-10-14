/**
 * site-links (WP12): links that only worked because Fumadocs and apps/web
 * shared one origin, rewritten so they also resolve on Mintlify
 * (`mint broken-links`, direct *.mintlify.site traffic, Mintlify's client
 * router).
 *
 * 1. Root-relative links to pages apps/web serves (`/skills`, `/discord`,
 *    `/solutions/…`, `/developers/templates`, `/data`, `/rpc`, …) become
 *    absolute `https://solana.com/…` links. Mintlify serves only the docs
 *    collections: `/docs/**`, `/learn/<article>`, `/developers/cookbook/**`,
 *    `/developers/bootcamp/**` and `/docs-assets/**` (each optionally
 *    locale-prefixed); the exact `/learn` and `/developers` landings belong
 *    to apps/web (spec §7.6). On solana.com the absolute link is same-origin.
 * 2. Bare relative page links (`[x](quickstart)`) are resolved the way the
 *    browser resolved them on the legacy URL (no trailing slash), e.g. on
 *    /docs/tools/attestations/overview -> /docs/tools/attestations/quickstart.
 *    Mintlify resolves relative links against its own routes, so they are
 *    made root-relative.
 * 3. GFM autolink literals that swallowed trailing CJK/Arabic punctuation
 *    (`http://localhost:3000，连接…` is one autolink in GFM, because those
 *    characters are not whitespace) are cut at the first non-URL character;
 *    the rest stays as text. Same as the legacy rendering, minus the junk
 *    in the href.
 *
 * Idempotent: absolute URLs, Mintlify-served paths and clean autolinks are
 * left alone.
 */
import path from "node:path";
import type { AstNode, ConvertFile, Transform } from "../../types.ts";
import { LEGACY_LOCALES } from "../../lib/locales.ts";
import { walk } from "./_wp2.ts";

const LOCALES = LEGACY_LOCALES.filter((l) => l !== "en");
const LOCALE_RE = new RegExp(`^/(?:${LOCALES.join("|")})(?=/|$)`);

export const SITE_ORIGIN = "https://solana.com";

/** Is this root-relative path served by the Mintlify project? */
export function mintlifyServes(p: string): boolean {
  const bare = p.split(/[?#]/)[0]!.replace(LOCALE_RE, "") || "/";
  return (
    /^\/(?:docs|docs-assets|developers\/cookbook|developers\/bootcamp)(?:\/|$)/.test(
      bare,
    ) || /^\/learn\/.+/.test(bare)
  );
}

/** Legacy public URL of a page file (apps/docs/<loc>/docs/a/index.mdx -> /<loc>/docs/a). */
export function pageUrl(file: string): string {
  const rel = file.replace(/^apps\/docs\//, "").replace(/\.mdx?$/, "");
  const url = `/${rel}`.replace(/\/index$/, "");
  return url || "/";
}

const URL_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/;

/** Cut an autolink literal at the first non-URL character (see header). */
export function trimAutolink(url: string): string {
  let out = URL_CHARS.exec(url)?.[0] ?? url;
  for (;;) {
    const last = out[out.length - 1];
    if (last && ".,;:!?'".includes(last)) out = out.slice(0, -1);
    else if (
      last === ")" &&
      (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)
    )
      out = out.slice(0, -1);
    else break;
  }
  return out;
}

function rewriteUrl(url: string, file: ConvertFile): string | undefined {
  if (url.startsWith("/") && !url.startsWith("//")) {
    return mintlifyServes(url) ? undefined : `${SITE_ORIGIN}${url}`;
  }
  // Bare relative page link (no scheme, not an anchor, not ./asset.ext).
  if (
    /^[A-Za-z0-9][\w.-]*(?:\/[\w.-]+)*\/?(?:#[\w-]*)?$/.test(url) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(url) &&
    !/\.(png|jpe?g|gif|svg|webp|pdf|mp4|json|txt|zip)$/i.test(url)
  ) {
    const base = path.posix.dirname(pageUrl(file.path));
    const resolved = path.posix.normalize(`${base}/${url}`);
    return mintlifyServes(resolved) ? resolved : `${SITE_ORIGIN}${resolved}`;
  }
  return undefined;
}

export const transform: Transform = {
  name: "site-links",
  order: 650,
  owner: "WP12",
  appliesTo: (source) => /\]\(|href=|https?:\/\//.test(source),
  run(tree, file, ctx) {
    walk(tree, (n, parent) => {
      if (n.type === "code" || n.type === "inlineCode") return "skip";
      if (n.type === "link" || n.type === "definition") {
        const url = String(n.url ?? "");
        const kids = n.children ?? [];
        // 3. Autolink literal with junk at the end.
        if (
          n.type === "link" &&
          kids.length === 1 &&
          kids[0]!.type === "text" &&
          kids[0]!.value === url &&
          /^https?:\/\//.test(url)
        ) {
          const clean = trimAutolink(url);
          if (clean !== url && parent?.children) {
            const rest = url.slice(clean.length);
            const sib = parent.children;
            const i = sib.indexOf(n);
            const out: AstNode[] = [
              { type: "raw", value: `[${clean}](${clean})` },
              { type: "text", value: rest },
            ];
            sib.splice(i, 1, ...out);
            ctx.warn(`autolink ${JSON.stringify(url)} cut to ${clean}`);
          }
          return "skip";
        }
        const next = rewriteUrl(url, file);
        if (next && next !== url) n.url = next;
        return;
      }
      if (
        (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") &&
        Array.isArray(n.attributes)
      ) {
        for (const a of n.attributes as AstNode[]) {
          if (
            a.type === "mdxJsxAttribute" &&
            a.name === "href" &&
            typeof a.value === "string"
          ) {
            const next = rewriteUrl(a.value, file);
            if (next && next !== a.value) a.value = next;
          }
        }
      }
      return;
    });
  },
};
