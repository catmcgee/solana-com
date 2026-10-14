import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AstNode, Transform } from "../src/types.ts";
import {
  defaultTransforms,
  discoverTransforms,
  transformFiles,
  TransformRegistry,
} from "../src/convert/registry.ts";
import { convertSource } from "../src/convert/run.ts";
import { describeTransformFixtures } from "./fixtures.ts";

/** Test-only transform that proves the harness end to end (mdx codec). */
const exampleCalloutRename: Transform = {
  name: "example-callout-rename",
  order: 200,
  owner: "WP0 (test only)",
  appliesTo: (src) => src.includes("<Callout"),
  run(tree) {
    const visit = (n: AstNode) => {
      if (
        (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") &&
        n.name === "Callout"
      )
        n.name = "Note";
      n.children?.forEach(visit);
    };
    visit(tree);
  },
};

describeTransformFixtures(exampleCalloutRename);

// Every discovered production transform must ship fixtures.
const production = await defaultTransforms();
for (const t of production.list()) describeTransformFixtures(t);

describe("TransformRegistry", () => {
  const noop = (name: string, order: number): Transform => ({
    name,
    order,
    owner: "t",
    run: () => {},
  });

  it("orders by `order`, then name", () => {
    const r = new TransformRegistry()
      .register(noop("b", 2))
      .register(noop("a", 2))
      .register(noop("z", 1));
    expect(r.list().map((t) => t.name)).toEqual(["z", "a", "b"]);
  });

  it("rejects duplicates, bad names and bad orders", () => {
    const t = noop("dup", 0);
    const r = new TransformRegistry().register(t);
    expect(() => r.register(t)).toThrow(/already registered/);
    expect(() => r.register({ ...t, name: "Bad Name" })).toThrow(/kebab-case/);
    expect(() => r.register({ ...t, name: "nan", order: Number.NaN })).toThrow(
      /order/,
    );
  });

  it("empty registry is a byte-identical no-op (convert --check)", () => {
    const src = "---\ntitle: x\n---\n\n<CodeTabs>\n</CodeTabs>\n";
    const out = convertSource(
      src,
      { path: "apps/docs/docs/x.mdx", locale: "en", collection: "docs" },
      new TransformRegistry(),
    );
    expect(out.output).toBe(src);
  });

  it("production transforms all come from src/convert/transforms/", () => {
    expect(production.size).toBe(transformFiles().length);
  });
});

describe("transform auto-discovery", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "docs-tooling-transforms-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const typesUrl = new URL("../src/types.ts", import.meta.url).href;
  const mod = (name: string, order: number | string) =>
    `import type { Transform } from ${JSON.stringify(typesUrl)};\n` +
    `export const transform: Transform = { name: ${JSON.stringify(name)}, order: ${order}, owner: "test", run() {} };\n`;

  it("registers every transforms/*.ts in order, skipping helpers and tests", async () => {
    writeFileSync(path.join(dir, "zeta.ts"), mod("zeta", 10));
    writeFileSync(path.join(dir, "alpha.ts"), mod("alpha", 20));
    writeFileSync(path.join(dir, "beta.ts"), mod("beta", 10));
    writeFileSync(path.join(dir, "_shared.ts"), "export const x = 1;\n");
    writeFileSync(path.join(dir, "alpha.test.ts"), "export {};\n");
    const r = await discoverTransforms(dir);
    expect(r.list().map((t) => t.name)).toEqual(["beta", "zeta", "alpha"]);
  });

  it("fails loudly on a name/file mismatch or missing export", async () => {
    const bad = mkdtempSync(path.join(dir, "bad-"));
    writeFileSync(path.join(bad, "callout.ts"), mod("cards", 1));
    await expect(discoverTransforms(bad)).rejects.toThrow(/must equal/);
    const missing = mkdtempSync(path.join(dir, "missing-"));
    writeFileSync(path.join(missing, "tabs.ts"), "export const t = 1;\n");
    await expect(discoverTransforms(missing)).rejects.toThrow(
      /missing `export const transform/,
    );
  });
});
