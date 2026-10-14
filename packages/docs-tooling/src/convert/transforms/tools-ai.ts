/**
 * WP7: retire `docs/tools/ai`.
 *
 * `/docs/tools/ai` has been unreachable since apps/web redirected it to
 * `/docs/intro/coding-with-agents` (apps/web/rewrites-redirects.ts). Every
 * remaining link to it (the "AI tools" card on each locale's
 * `tools/index.mdx`) is pointed straight at the redirect target, so
 * `mint broken-links` passes once the page files are removed with
 * `collections remove-tools-ai` (src/collections/tools-ai.ts). Anchors into
 * the old page are dropped because the target has different headings.
 */
import type { AstNode, Transform } from "../../types.ts";
import { isJsx, walk } from "./_collections.ts";

export const OLD = "docs/tools/ai";
export const NEW = "docs/intro/coding-with-agents";

/** `/docs/tools/ai`, `/<loc>/docs/tools/ai`, optional `.md`, `#x`, `?q`. */
const LINK_RE =
  /^((?:https:\/\/solana\.com)?\/(?:[a-z]{2}\/)?)docs\/tools\/ai(\.md)?\/?(?:[?#].*)?$/;

export function retarget(url: string): string | null {
  const m = url.match(LINK_RE);
  return m ? `${m[1]}${NEW}${m[2] ?? ""}` : null;
}

const isOwnFile = (p: string) => /(?:^|\/)docs\/tools\/ai\.mdx?$/.test(p);

export const transform: Transform = {
  name: "tools-ai",
  order: 640,
  owner: "WP7",
  appliesTo: (src, file) => src.includes("tools/ai") && !isOwnFile(file.path),
  run(tree) {
    walk(tree, (n: AstNode) => {
      if (
        (n.type === "link" || n.type === "definition") &&
        typeof n.url === "string"
      ) {
        const next = retarget(n.url);
        if (next) n.url = next;
        return;
      }
      if (!isJsx(n)) return;
      for (const a of (n.attributes ?? []) as {
        type: string;
        name: string;
        value: unknown;
      }[]) {
        if (a.type !== "mdxJsxAttribute" || a.name !== "href") continue;
        if (typeof a.value !== "string") continue;
        const next = retarget(a.value);
        if (next) a.value = next;
      }
    });
  },
};
