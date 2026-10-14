/**
 * Fixture harness for convert transforms (WP0 interface, spec §4.3).
 *
 * Layout: __fixtures__/convert/<transform>/<case>/{in.mdx,out.mdx,meta.json?}
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Collection, Transform } from "../src/types.ts";
import { toolingRoot } from "../src/lib/paths.ts";
import { TransformRegistry } from "../src/convert/registry.ts";
import { convertSource, mdxCodec, type Codec } from "../src/convert/run.ts";

export const FIXTURE_ROOT = path.join(toolingRoot, "__fixtures__", "convert");

export interface FixtureCase {
  transform: string;
  name: string;
  input: string;
  expected: string;
  file: { path: string; locale: string; collection: Collection };
}

export function loadFixtureCases(
  transform: string,
  root = FIXTURE_ROOT,
): FixtureCase[] {
  const dir = path.join(root, transform);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => statSync(path.join(dir, n)).isDirectory())
    .sort()
    .map((name) => {
      const c = path.join(dir, name);
      const meta = existsSync(path.join(c, "meta.json"))
        ? (JSON.parse(
            readFileSync(path.join(c, "meta.json"), "utf8"),
          ) as Partial<FixtureCase["file"]>)
        : {};
      return {
        transform,
        name,
        input: readFileSync(path.join(c, "in.mdx"), "utf8"),
        expected: readFileSync(path.join(c, "out.mdx"), "utf8"),
        file: {
          path: meta.path ?? `apps/docs/docs/__fixture__/${name}.mdx`,
          locale: meta.locale ?? "en",
          collection: meta.collection ?? "docs",
        },
      };
    });
}

/** Register vitest cases for a transform's fixtures (golden + idempotency). */
export function describeTransformFixtures(
  t: Transform,
  codec: Codec = mdxCodec,
  root = FIXTURE_ROOT,
) {
  const registry = new TransformRegistry().register(t);
  const cases = loadFixtureCases(t.name, root);
  describe(`transform ${t.name}`, () => {
    it("has an en fixture and a locale fixture", () => {
      expect(cases.some((c) => c.file.locale === "en")).toBe(true);
      expect(cases.some((c) => c.file.locale !== "en")).toBe(true);
    });
    for (const c of cases) {
      it(`${c.name}: matches out.mdx`, () => {
        const { output, diagnostics } = convertSource(
          c.input,
          c.file,
          registry,
          codec,
        );
        expect(diagnostics.filter((d) => d.level === "error")).toEqual([]);
        expect(output).toBe(c.expected);
      });
      it(`${c.name}: is idempotent`, () => {
        const { output } = convertSource(c.expected, c.file, registry, codec);
        expect(output).toBe(c.expected);
      });
    }
  });
}
