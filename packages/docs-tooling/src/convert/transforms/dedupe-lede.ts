/**
 * WP13 (integration review): drop a first body paragraph that repeats the
 * frontmatter `description`.
 *
 * The docs always render `description` as the page lede under the H1. Many
 * pages (the RPC method pages above all) also open their body with the same
 * sentence, which the Fumadocs layout tolerated, so in the docs readers saw
 * it twice. Only an exact repeat is removed: the first content block must be
 * a paragraph whose plain text equals the description once inline Markdown
 * markers and whitespace are ignored. Anything else is left alone.
 */
import type { Transform } from "../../types.ts";
import { contentStart, toText } from "./_collections.ts";

/** Plain text for comparison: no inline Markdown markers, single spaces. */
export function ledeText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const transform: Transform = {
  name: "dedupe-lede",
  order: 930,
  owner: "WP13",
  run(tree, file) {
    const description = file.frontmatter.description;
    if (typeof description !== "string" || !description.trim()) return;
    const kids = tree.children ?? [];
    const i = contentStart(tree);
    const first = kids[i];
    if (!first || first.type !== "paragraph") return;
    if (ledeText(toText(first)) !== ledeText(description)) return;
    kids.splice(i, 1);
  },
};
