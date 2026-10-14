/**
 * Fumadocs `<Steps>` -> Mintlify `<Steps>` / `<Step title>` (spec §3.1).
 *
 *   <Steps>
 *   <Step>
 *   ### Install the CLI
 *   Body
 *   </Step>
 *   </Steps>
 *
 * becomes
 *
 *   <Steps titleSize="h3">
 *   <Step title="Install the CLI">
 *   Body
 *   </Step>
 *   </Steps>
 *
 * Rules:
 * - A `<Step>` without `title` whose first block is a heading gets that
 *   heading lifted into `title` (inline code/bold/italic kept as Markdown,
 *   which Mintlify renders in step titles; links keep their text). Steps
 *   whose titles all come from H3s get `titleSize="h3"` on `<Steps>` so they
 *   keep the H3 look and their table-of-contents entries.
 * - A first paragraph that is only `**bold**` is lifted the same way, with
 *   the default title size.
 * - Fumadocs also styles bare headings inside `<Steps>` as steps (no
 *   `<Step>` children). Those are split into one `<Step>` per heading of the
 *   shallowest depth; content before the first heading stays before
 *   `<Steps>`.
 * - Steps that already have a `title` (Mintlify, or scrolly.ts output) are
 *   left alone.
 *
 * Steps render fully on the server; nothing needs JavaScript.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  type Jsx,
  attr,
  flow,
  hasAttr,
  isBlankText,
  isJsx,
  replaceNodes,
  textOf,
} from "./_wp2.ts";

/** Markdown-ish inline text for a Mintlify title attribute. */
export function inlineTitle(nodes: readonly AstNode[]): string {
  const esc = (s: string) => s.replace(/([\\`*_[\]<>{}])/g, "\\$1");
  const out = (n: AstNode): string => {
    switch (n.type) {
      case "text":
        return esc(String(n.value ?? ""));
      case "inlineCode":
        return "`" + String(n.value ?? "") + "`";
      case "strong":
        return `**${(n.children ?? []).map(out).join("")}**`;
      case "emphasis":
        return `*${(n.children ?? []).map(out).join("")}*`;
      case "break":
        return " ";
      default:
        return n.children ? n.children.map(out).join("") : esc(textOf(n));
    }
  };
  return nodes.map(out).join("").replace(/\s+/g, " ").trim();
}

function firstBlock(step: Jsx): { node: AstNode; index: number } | undefined {
  for (let i = 0; i < step.children.length; i++) {
    const c = step.children[i]!;
    if (c.type === "text" && isBlankText(c)) continue;
    return { node: c, index: i };
  }
  return undefined;
}

function isBoldOnly(p: AstNode): boolean {
  if (p.type !== "paragraph") return false;
  const kids = (p.children ?? []).filter((c) => !isBlankText(c));
  return kids.length === 1 && kids[0]!.type === "strong";
}

/** Lift a title into `step`; returns the heading depth used (0 = bold). */
function liftTitle(step: Jsx): number | undefined {
  if (hasAttr(step, "title")) return undefined;
  const first = firstBlock(step);
  if (!first) return undefined;
  const { node, index } = first;
  let title: string;
  let depth: number;
  if (node.type === "heading") {
    title = inlineTitle(node.children ?? []);
    depth = Number(node.depth);
  } else if (isBoldOnly(node)) {
    const s = (node.children ?? []).find((c) => c.type === "strong")!;
    title = inlineTitle(s.children ?? []);
    depth = 0;
  } else return undefined;
  if (!title) return undefined;
  step.children.splice(index, 1);
  step.attributes = [attr("title", title), ...step.attributes];
  return depth;
}

export const transform: Transform = {
  name: "steps",
  order: 240,
  owner: "WP2",
  appliesTo: (source) => source.includes("<Steps"),
  run(tree, _file, ctx) {
    replaceNodes(tree, (node) => {
      if (!isJsx(node, "Steps")) return undefined;
      const before: AstNode[] = [];
      const hasStep = node.children.some((c) => isJsx(c, "Step"));
      if (!hasStep) {
        // Bare headings styled as steps -> explicit <Step> elements.
        const depths = node.children
          .filter((c) => c.type === "heading")
          .map((c) => Number(c.depth));
        if (depths.length === 0) return undefined;
        const depth = Math.min(...depths);
        const steps: AstNode[] = [];
        let current: Jsx | undefined;
        for (const c of node.children) {
          if (c.type === "heading" && Number(c.depth) === depth) {
            current = flow("Step", [], [c]);
            steps.push(current);
          } else if (current) current.children.push(c);
          else before.push(c);
        }
        if (before.length)
          ctx.warn("<Steps> content before the first step heading moved out");
        node.children = steps;
      }
      const lifted: Array<number | undefined> = [];
      for (const c of node.children) {
        if (isJsx(c, "Step")) lifted.push(liftTitle(c));
      }
      const used = lifted.filter((d): d is number => d !== undefined);
      if (
        used.length &&
        used.every((d) => d === 3) &&
        !hasAttr(node, "titleSize")
      ) {
        node.attributes = [...node.attributes, attr("titleSize", "h3")];
      } else if (used.some((d) => d >= 2 && d <= 4)) {
        // Mixed: size each heading-lifted step individually.
        let k = 0;
        for (const c of node.children) {
          if (!isJsx(c, "Step")) continue;
          const d = lifted[k++];
          if (d !== undefined && d >= 2 && d <= 4 && !hasAttr(c, "titleSize"))
            c.attributes = [...c.attributes, attr("titleSize", `h${d}`)];
        }
      }
      return before.length ? [...before, node] : undefined;
    });
  },
};
