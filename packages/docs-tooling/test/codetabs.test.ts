/**
 * codetabs (WP12): error paths and the full-registry result that the
 * fixture goldens (single transform) cannot show.
 */
import { describe, expect, it } from "vitest";
import {
  TransformRegistry,
  defaultTransforms,
} from "../src/convert/registry.ts";
import { convertSource } from "../src/convert/run.ts";
import { transform as codetabs } from "../src/convert/transforms/codetabs.ts";

const FILE = {
  path: "apps/docs/docs/x/page.mdx",
  locale: "en",
  collection: "docs" as const,
};
const only = new TransformRegistry().register(codetabs);

describe("codetabs", () => {
  it("refuses a block that still includes an example file", () => {
    const src = [
      '<CodeTabs flags="r">',
      "",
      '```ts !! title="Kit" file=packages/docs-examples/a/kit.ts#region=x',
      "```",
      "",
      '```ts !! title="Legacy"',
      "x",
      "```",
      "",
      "</CodeTabs>",
      "",
    ].join("\n");
    const r = convertSource(src, FILE, only);
    expect(r.diagnostics.map((d) => d.level)).toEqual(["error"]);
    expect(r.output).toContain("<CodeTabs");
  });

  it("warns about unknown attributes", () => {
    const src =
      '<CodeTabs foo="1">\n\n```ts !! title="A"\na\n```\n\n```ts !! title="B"\nb\n```\n\n</CodeTabs>\n';
    const r = convertSource(src, FILE, only);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]!.message).toContain("foo");
    expect(r.output).toContain("<CodeGroup>");
  });

  it("full registry: CodeGroup with Mintlify titles, no Code Hike left, idempotent", async () => {
    const registry = await defaultTransforms();
    const src = [
      "---",
      "title: T",
      "---",
      "",
      '<CodeTabs storage="cookbook" flags="r">',
      "",
      '```ts !! title="Kit"',
      "// !mark",
      "const a = 1;",
      "```",
      "",
      '```terminal !! title="CLI"',
      "$ solana balance",
      "1 SOL",
      "```",
      "",
      "</CodeTabs>",
      "",
    ].join("\n");
    const once = convertSource(src, FILE, registry);
    expect(once.diagnostics.filter((d) => d.level === "error")).toEqual([]);
    expect(once.output).toContain("<CodeGroup>");
    expect(once.output).toContain("```ts Kit highlight={1}");
    expect(once.output).not.toMatch(/CodeTabs|!!|!mark/);
    // A terminal tab stays one block, so the group gains no extra tab.
    expect(once.output.match(/^```/gm)).toHaveLength(4);
    const twice = convertSource(once.output, FILE, registry);
    expect(twice.output).toBe(once.output);
  });

  it("every discovered transform has a distinct order (no name tie-breaks)", async () => {
    const orders = (await defaultTransforms()).list().map((t) => t.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
