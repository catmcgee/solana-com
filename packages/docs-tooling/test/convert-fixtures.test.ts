import { describe, expect, it } from "vitest";
import type { Transform } from "../src/types.ts";
import {
  defaultTransforms,
  TransformRegistry,
} from "../src/convert/registry.ts";
import { convertSource } from "../src/convert/run.ts";
import { describeTransformFixtures } from "./fixtures.ts";

/** Test-only transform that proves the harness end to end (raw codec). */
const exampleCalloutRename: Transform = {
  name: "example-callout-rename",
  order: 200,
  owner: "WP0 (test only)",
  appliesTo: (src) => src.includes("<Callout"),
  run(tree) {
    for (const node of tree.children ?? []) {
      if (node.type === "raw" && typeof node.value === "string") {
        node.value = node.value
          .replace(/<Callout>/g, "<Note>")
          .replace(/<\/Callout>/g, "</Note>");
      }
    }
  },
};

describeTransformFixtures(exampleCalloutRename);

// Every registered production transform must ship fixtures.
for (const t of defaultTransforms().list()) describeTransformFixtures(t);

describe("TransformRegistry", () => {
  it("orders by `order`, then name", () => {
    const noop = (name: string, order: number): Transform => ({
      name,
      order,
      owner: "t",
      run: () => {},
    });
    const r = new TransformRegistry()
      .register(noop("b", 2))
      .register(noop("a", 2))
      .register(noop("z", 1));
    expect(r.list().map((t) => t.name)).toEqual(["z", "a", "b"]);
  });

  it("rejects duplicates and bad names", () => {
    const t: Transform = { name: "dup", order: 0, owner: "t", run: () => {} };
    const r = new TransformRegistry().register(t);
    expect(() => r.register(t)).toThrow(/already registered/);
    expect(() => r.register({ ...t, name: "Bad Name" })).toThrow(/kebab-case/);
  });

  it("empty registry is a byte-identical no-op (convert --check)", () => {
    const src = "---\ntitle: x\n---\n\n<CodeTabs>\n</CodeTabs>\n";
    const out = convertSource(
      src,
      { path: "apps/docs/docs/x.mdx", locale: "en", collection: "docs" },
      new TransformRegistry(),
    );
    expect(out.output).toBe(src);
    expect(defaultTransforms().size).toBe(0);
  });
});
