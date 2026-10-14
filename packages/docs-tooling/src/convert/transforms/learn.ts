/**
 * WP7: learn articles (`/learn/<slug>`, every locale).
 *
 * The legacy learn route rendered the frontmatter title as the page H1 *and*
 * every article also starts with its own `# Title` heading; that route hid
 * the duplication with its own layout. Mintlify always renders `title` as
 * the page H1, so the leading body H1 is removed:
 *
 * - same text as `title` -> removed;
 * - different text -> it becomes `title` (it is what readers saw as the
 *   article heading) and the old `title` is kept as `sidebarTitle` unless
 *   one is already set.
 *
 * Chapter order and prev/next come from navigation (see
 * `LEARN_ORDER`, handed to WP6 for `navigation/en.json`), which Mintlify
 * renders as server-side pagination links, also in a hidden tab.
 */
import type { Transform } from "../../types.ts";
import { tutorialOrder } from "../../../data/learn/learn-tutorials.ts";
import { contentStart, toText } from "./_collections.ts";

/**
 * Learn tab page order: the unnumbered "Getting started" overview first, then
 * the legacy chapter order (`tutorialOrder`, chapters 1-10).
 */
export const LEARN_ORDER: readonly string[] = [
  "learn/getting-started",
  ...tutorialOrder.map((s) => `learn/${s}`),
];

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export const transform: Transform = {
  name: "learn",
  order: 630,
  owner: "WP7",
  appliesTo: (src, file) => file.collection === "learn" && /^# /m.test(src),
  run(tree, file) {
    const kids = tree.children!;
    const i = contentStart(tree);
    const first = kids[i];
    if (!first || first.type !== "heading" || first.depth !== 1) return;
    const h1 = norm(toText(first));
    const fm = file.frontmatter;
    const title = typeof fm.title === "string" ? norm(fm.title) : "";
    if (h1 && h1 !== title) {
      if (title && fm.sidebarTitle === undefined) fm.sidebarTitle = fm.title;
      fm.title = h1;
    }
    kids.splice(i, 1);
  },
};
