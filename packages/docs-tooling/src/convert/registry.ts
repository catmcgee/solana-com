/**
 * Transform registry for `convert`.
 *
 * Transforms are AUTO-DISCOVERED: every `src/convert/transforms/<name>.ts`
 * module that exports `transform` is registered. Work packages add a file;
 * nobody edits a shared list. Files starting with `_` (shared helpers) and
 * `*.test.ts` / `*.d.ts` files are ignored.
 *
 * Contract for a transform module (see AUTHORING.md, "Writing a convert
 * transform"):
 *
 *   export const transform: Transform = {
 *     name: "<file basename>",  // kebab-case, must equal the file name
 *     order: 230,               // number; lower runs first, ties by name
 *     owner: "WP2",
 *     appliesTo: (source, file) => source.includes("<Callout"), // optional
 *     run(tree, file, ctx) { ... },  // mutate the mdast tree in place
 *   };
 *
 * Rules every transform must follow:
 * - pure function of (tree, file): no I/O, no clock, no randomness;
 * - idempotent: none of the constructs it consumes may appear in its output;
 * - one fixture folder per transform: __fixtures__/convert/<name>/<case>/
 *   {in.mdx,out.mdx[,meta.json]} (see test/fixtures.ts).
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Transform } from "../types.ts";

export const TRANSFORMS_DIR = fileURLToPath(
  new URL("./transforms/", import.meta.url),
);

/**
 * `order` bands (documentation only, not enforced). These describe the
 * registry as integrated; every order is distinct so the run order
 * never depends on a name tie-break:
 *   0-79    frontmatter (frontmatter 10)
 *   80-99   Code Hike containers and RPC, which must see raw Code Hike
 *           fence syntax before fences.ts rewrites it: notes 80,
 *           mentions 81, side-by-side 82, scrolly 83, files 84,
 *           codetabs-examples 85, mermaid 86, return-type 87, terminal 88,
 *           api-method 89, code-reference 90
 *   100-199 inline syntax (inline-code 150)
 *   200-399 components: callout 210, cards 220, tabs 230, steps 240,
 *           accordion 250, embed 260, html 270, themed-image 280,
 *           images 290, codetabs 300
 *   600-699 special collections: bootcamp 610, video-guides 620,
 *           learn 630
 *   900+    fences 900 (meta + annotations, deliberately last so every
 *           container transform sees raw syntax), web3js-specifier 910,
 *           anchors 920, dedupe-lede 930, dollar-escape 950
 */
export const ORDER_BANDS = {
  frontmatter: [0, 79],
  codeHike: [80, 99],
  inline: [100, 199],
  components: [200, 399],
  rpc: [80, 99],
  examples: [80, 99],
  collections: [600, 699],
  cleanup: [900, Infinity],
} as const;

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export class TransformRegistry {
  #byName = new Map<string, Transform>();

  register(t: Transform): this {
    if (!NAME_RE.test(t.name)) {
      throw new Error(`Invalid transform name "${t.name}" (use kebab-case)`);
    }
    if (typeof t.order !== "number" || !Number.isFinite(t.order)) {
      throw new Error(`Transform "${t.name}" needs a finite numeric \`order\``);
    }
    if (typeof t.run !== "function") {
      throw new Error(`Transform "${t.name}" has no run() function`);
    }
    if (this.#byName.has(t.name)) {
      throw new Error(`Transform "${t.name}" is already registered`);
    }
    this.#byName.set(t.name, t);
    return this;
  }

  get(name: string): Transform | undefined {
    return this.#byName.get(name);
  }

  get size() {
    return this.#byName.size;
  }

  /** Transforms in execution order (order, then name). */
  list(filter?: (t: Transform) => boolean): Transform[] {
    return [...this.#byName.values()]
      .filter((t) => (filter ? filter(t) : true))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
}

/** Transform module files in `dir`, sorted (helpers/tests excluded). */
export function transformFiles(dir = TRANSFORMS_DIR): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter(
      (n) =>
        n.endsWith(".ts") &&
        !n.endsWith(".d.ts") &&
        !n.endsWith(".test.ts") &&
        !n.startsWith("_") &&
        !n.startsWith("."),
    )
    .sort()
    .map((n) => path.join(dir, n));
}

/**
 * Import every transform module in `dir` and register its `transform`
 * export. Throws (naming the file) on a missing export, a name that does not
 * match the file name, a bad `order`, or a duplicate.
 */
export async function discoverTransforms(
  dir = TRANSFORMS_DIR,
): Promise<TransformRegistry> {
  const registry = new TransformRegistry();
  for (const file of transformFiles(dir)) {
    const base = path.basename(file, ".ts");
    const mod = (await import(pathToFileURL(file).href)) as {
      transform?: Transform;
    };
    const t = mod.transform;
    if (!t || typeof t !== "object") {
      throw new Error(
        `${path.relative(process.cwd(), file)}: missing \`export const transform: Transform\``,
      );
    }
    if (t.name !== base) {
      throw new Error(
        `${path.relative(process.cwd(), file)}: transform.name "${t.name}" must equal the file name "${base}"`,
      );
    }
    registry.register(t);
  }
  return registry;
}

/** The production registry: everything in src/convert/transforms/. */
export function defaultTransforms(): Promise<TransformRegistry> {
  return discoverTransforms();
}
