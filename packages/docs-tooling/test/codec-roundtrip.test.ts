/**
 * MDX codec stability on real content (spec §4.3).
 *
 * Samples 30 real pages across collections and locales (deterministic: a few
 * Code Hike-heavy anchors, then a hash-ordered round-robin over every
 * locale/collection bucket) and proves, for each file:
 *
 * 1. identity:   stringify(parse(src)) === src, byte for byte;
 * 2. lossless:   serializing from the AST alone (no source reuse) reparses
 *                to the same tree, so changed nodes are never corrupted;
 * 3. local edit: renaming one JSX element only rewrites that element's tags;
 *                everything before and after it is byte-identical;
 * 4. text edit:  changing one text node leaves the rest of the file intact;
 * 5. move:       wrapping a code fence (possibly indented inside JSX) in a
 *                new element reparses to exactly the intended tree;
 * 6. idempotent: re-running the same edit on the output is a no-op.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AstNode } from "../src/types.ts";
import {
  mdxCodec,
  stringifyFresh,
  treeFingerprint,
} from "../src/convert/codec.ts";
import { repoRoot } from "../src/lib/paths.ts";
import { layoutKey, listLayoutPages } from "../src/verify/verify-urls.ts";

const SAMPLE_SIZE = 30;
const ANCHORS = [
  "apps/docs/developers/docs/rpc/http/getbalance.mdx",
  "apps/docs/developers/docs/intro/quick-start/build-first-program.mdx",
  "apps/docs/developers/docs/core/accounts/account-structure.mdx",
  "apps/docs/developers/docs/payments/advanced-payments/deferred-execution.mdx",
  "apps/docs/ru/developers/docs/core/accounts/account-structure.mdx",
  "apps/docs/fr/developers/docs/intro/quick-start/build-first-program.mdx",
];

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

function sampleFiles(): string[] {
  const all = [...listLayoutPages()].sort();
  const buckets = new Map<string, string[]>();
  for (const f of all) {
    const k = layoutKey(f);
    if (!k) continue;
    const b = `${k.locale}/${k.collection}`;
    (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(f);
  }
  for (const files of buckets.values())
    files.sort((a, b) => hash(a).localeCompare(hash(b)));
  const order = [...buckets.keys()].sort((a, b) =>
    hash(a).localeCompare(hash(b)),
  );
  // English collections first so every collection is covered.
  order.sort(
    (a, b) => Number(!a.startsWith("en/")) - Number(!b.startsWith("en/")),
  );
  const picked = new Set(ANCHORS.filter((f) => all.includes(f)));
  for (let round = 0; picked.size < SAMPLE_SIZE; round++) {
    let added = false;
    for (const b of order) {
      const f = buckets.get(b)![round];
      if (!f) continue;
      added = true;
      if (picked.size < SAMPLE_SIZE) picked.add(f);
    }
    if (!added) break;
  }
  return [...picked];
}

function walk(
  node: AstNode,
  fn: (n: AstNode, parent?: AstNode) => void,
  parent?: AstNode,
) {
  fn(node, parent);
  for (const c of node.children ?? []) walk(c, fn, node);
}

function find(tree: AstNode, pred: (n: AstNode) => boolean) {
  let hit: { node: AstNode; parent: AstNode } | undefined;
  walk(tree, (n, p) => {
    if (!hit && p && pred(n)) hit = { node: n, parent: p };
  });
  return hit;
}

function offsets(n: AstNode) {
  const p = n.position as {
    start: { offset: number };
    end: { offset: number };
  };
  return [p.start.offset, p.end.offset] as const;
}

/**
 * Fingerprint with whitespace runs collapsed in values whose whitespace is
 * not significant (inline code, JS expressions/ESM). remark-mdx keeps the
 * surrounding JSX indentation inside those values, so re-indenting a moved
 * node shifts it; that is cosmetic and is the only allowed difference.
 */
const WS_INSENSITIVE = new Set([
  "inlineCode",
  "mdxFlowExpression",
  "mdxTextExpression",
  "mdxjsEsm",
  "mdxJsxAttributeValueExpression",
]);
function semanticFingerprint(tree: AstNode): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      if (k === "position" || k === "data") continue;
      out[k] =
        k === "value" &&
        typeof x === "string" &&
        WS_INSENSITIVE.has(String(o.type))
          ? x.replace(/\s+/g, " ")
          : norm(x);
    }
    return out;
  };
  return treeFingerprint(norm(tree) as AstNode);
}

const files = sampleFiles();

describe("mdx codec round-trip on real content", () => {
  it(`samples ${SAMPLE_SIZE} files across collections and locales`, () => {
    expect(files).toHaveLength(SAMPLE_SIZE);
    const keys = files.map((f) => layoutKey(f)!);
    expect(new Set(keys.map((k) => k.collection))).toEqual(
      new Set(["docs", "cookbook", "bootcamp", "learn"]),
    );
    expect(new Set(keys.map((k) => k.locale)).size).toBeGreaterThanOrEqual(8);
  });

  for (const file of files) {
    describe(file.replace(/^apps\/docs\//, ""), () => {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      const parse = () => mdxCodec.parse(source, { path: file });

      it("is byte-identical when unchanged", () => {
        const { tree, frontmatter } = parse();
        expect(mdxCodec.stringify(tree, frontmatter)).toBe(source);
      });

      it("fresh serialization is lossless", () => {
        const { tree } = parse();
        const fresh = stringifyFresh(tree, file);
        const again = mdxCodec.parse(fresh, { path: file }).tree;
        expect(semanticFingerprint(again)).toBe(semanticFingerprint(tree));
      });

      it("renaming one JSX element only touches its tags", () => {
        const { tree, frontmatter } = parse();
        const hit = find(
          tree,
          (n) => n.type === "mdxJsxFlowElement" && typeof n.name === "string",
        );
        if (!hit) return;
        const [start, end] = offsets(hit.node);
        const oldName = hit.node.name as string;
        hit.node.name = "ProbeRenamed";
        const out = mdxCodec.stringify(tree, frontmatter);
        expect(out.slice(0, start)).toBe(source.slice(0, start));
        expect(out.slice(out.length - (source.length - end))).toBe(
          source.slice(end),
        );
        const reparsed = mdxCodec.parse(out, { path: file }).tree;
        expect(treeFingerprint(reparsed)).toBe(treeFingerprint(tree));
        // With children, only the tag names differ inside the element.
        if (hit.node.children?.length) {
          const inner = out.slice(start, out.length - (source.length - end));
          expect(inner.replaceAll("ProbeRenamed", oldName)).toBe(
            source.slice(start, end),
          );
        }
      });

      it("editing one text node leaves the rest intact", () => {
        const { tree, frontmatter } = parse();
        // Paragraph text (a table cell edit legitimately re-aligns the table).
        let hit: { node: AstNode; parent: AstNode } | undefined;
        walk(tree, (n, p) => {
          if (
            !hit &&
            p?.type === "paragraph" &&
            n.type === "text" &&
            /^[\p{L} ]{8,}$/u.test(String(n.value))
          )
            hit = { node: n, parent: p };
        });
        if (!hit) return;
        const [start, end] = offsets(hit.node);
        hit.node.value = `${String(hit.node.value)} edited`;
        const out = mdxCodec.stringify(tree, frontmatter);
        expect(out).toBe(
          `${source.slice(0, start)}${source.slice(start, end)} edited${source.slice(end)}`,
        );
      });

      it("moving a code fence into a new element reparses exactly", () => {
        const { tree, frontmatter } = parse();
        const hit = find(tree, (n) => n.type === "code");
        if (!hit) return;
        const i = hit.parent.children!.indexOf(hit.node);
        const wrapper: AstNode = {
          type: "mdxJsxFlowElement",
          name: "ProbeGroup",
          attributes: [],
          children: [hit.node],
        };
        hit.parent.children!.splice(i, 1, wrapper);
        const out = mdxCodec.stringify(tree, frontmatter);
        const reparsed = mdxCodec.parse(out, { path: file });
        expect(semanticFingerprint(reparsed.tree)).toBe(
          semanticFingerprint(tree),
        );
        // Idempotent: the wrapped output is stable under another round-trip.
        expect(mdxCodec.stringify(reparsed.tree, reparsed.frontmatter)).toBe(
          out,
        );
      });

      it("frontmatter edits rewrite only the yaml block", () => {
        const { tree, frontmatter } = parse();
        if (!Object.keys(frontmatter).length) return;
        frontmatter.sidebarTitle = "Probe";
        const out = mdxCodec.stringify(tree, frontmatter);
        const yamlEnd = source.indexOf("\n---", 3) + 4;
        expect(out.slice(out.indexOf("\n---", 3) + 4)).toBe(
          source.slice(yamlEnd),
        );
        expect(mdxCodec.parse(out, { path: file }).frontmatter).toEqual({
          ...frontmatter,
        });
      });
    });
  }
});
