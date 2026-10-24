/**
 * `@solana/web3.js-v3` / `@solana/web3.js-legacy` -> `@solana/web3.js` in
 * code (spec §3.2; port of the legacy `remark-web3js-specifier.mjs`).
 *
 * packages/docs-examples installs both web3.js majors side by side under
 * pnpm aliases. Readers install neither alias, so code shown in the docs
 * uses the published name. Applies to fences and inline code.
 *
 * Runs after every other transform (cleanup band) so code inlined or moved
 * by earlier transforms is covered. WP5's snippet generator should call
 * `restoreWeb3jsSpecifier` on the example source it writes to
 * apps/docs/snippets/examples, because generated snippets are not converted.
 */
import type { Transform } from "../../types.ts";
import { walk } from "./_mdx.ts";

const ALIAS_RE = /@solana\/web3\.js-(?:v3|legacy)(?![\w-])/g;

export function restoreWeb3jsSpecifier(code: string): string {
  return code.replace(ALIAS_RE, "@solana/web3.js");
}

export const transform: Transform = {
  name: "web3js-specifier",
  order: 910,
  appliesTo: (source) => /@solana\/web3\.js-(?:v3|legacy)/.test(source),
  run(tree) {
    walk(tree, (n) => {
      if (
        (n.type === "code" || n.type === "inlineCode") &&
        typeof n.value === "string"
      ) {
        const next = restoreWeb3jsSpecifier(n.value);
        if (next !== n.value) n.value = next;
        return "skip";
      }
    });
  },
};
