/**
 * Find legacy example blocks in an MDX tree (pure; shared by the
 * `codetabs-examples` convert transform and `examples extract`).
 *
 * A block is either
 * - a `<CodeTabs>` element whose fences ALL include a docs-examples file, or
 * - a bare fence (not inside `<CodeTabs>`) that includes one.
 * A `<CodeTabs>` mixing include fences and inline fences keeps the inline
 * fences as inline tabs (`code` in blocks.json), so nothing is lost. Any
 * other child (prose inside the tabs) is reported and the block is skipped.
 */
import type { AstNode } from "../types.ts";
import {
  blockFromFences,
  includeFence,
  normalizeLang,
  type BlockRef,
  type IncludeFence,
} from "./blocks.ts";
import { parseLegacyFenceMeta } from "./include.ts";

export interface FoundBlock {
  node: AstNode;
  parent: AstNode;
  ref: BlockRef;
  kind: "codetabs" | "fence";
}

export interface ScanResult {
  blocks: FoundBlock[];
  problems: { node: AstNode; message: string }[];
}

function attr(node: AstNode, name: string): string | undefined {
  const attrs = (node.attributes ?? []) as {
    type: string;
    name?: string;
    value?: unknown;
  }[];
  const a = attrs.find((x) => x.type === "mdxJsxAttribute" && x.name === name);
  return typeof a?.value === "string" ? a.value : undefined;
}

const isCodeTabs = (n: AstNode) =>
  (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") &&
  n.name === "CodeTabs";

export function scanExampleBlocks(tree: AstNode): ScanResult {
  const res: ScanResult = { blocks: [], problems: [] };
  const walk = (node: AstNode) => {
    const children = node.children ?? [];
    for (const child of children) {
      if (isCodeTabs(child)) {
        const codes = (child.children ?? []).filter((c) => c.type === "code");
        const inc = codes.map((c) => includeFence(c as never));
        if (!inc.some((x) => x !== null)) continue;
        const others = (child.children ?? []).filter(
          (c) =>
            c.type !== "code" &&
            !(c.type === "text" && !String(c.value ?? "").trim()),
        );
        if (others.length) {
          res.problems.push({
            node: child,
            message: `<CodeTabs> with docs-examples fences also holds ${others.length} non-fence node(s) (${others.map((o) => o.type).join(", ")}); convert by hand`,
          });
          continue;
        }
        const found: IncludeFence[] = inc.map(
          (x, i) =>
            x ?? {
              lang: normalizeLang(codes[i]!.lang as string),
              meta: parseLegacyFenceMeta(codes[i]!.meta as string),
              file: "",
              code: String(codes[i]!.value ?? ""),
            },
        );
        const flags = attr(child, "flags") ?? "";
        res.blocks.push({
          node: child,
          parent: node,
          kind: "codetabs",
          ref: blockFromFences(found, {
            runnable: flags.includes("r"),
            runner: attr(child, "runner"),
          }),
        });
        continue;
      }
      if (child.type === "code") {
        const f = includeFence(child as never);
        if (f)
          res.blocks.push({
            node: child,
            parent: node,
            kind: "fence",
            ref: blockFromFences([f], { runnable: false }),
          });
        continue;
      }
      walk(child);
    }
  };
  walk(tree);
  return res;
}
