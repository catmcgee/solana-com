/**
 * Transform registry for `convert` (spec §3, §4.3, WP0 interface).
 *
 * Work packages register transforms from
 * src/convert/transforms/<name>.ts and add them to `defaultTransforms`
 * below. The registry is deliberately parser-agnostic: WP2 adds the
 * unified/remark-mdx parse + stringify step to `run.ts`; transforms only see
 * an mdast tree.
 *
 * Rules every transform must follow:
 * - pure function of (tree, file): no I/O, no clock, no randomness;
 * - idempotent: none of the constructs it consumes may appear in its output;
 * - one fixture folder per transform: __fixtures__/convert/<name>/<case>/
 *   {in.mdx,out.mdx[,meta.json]} (see test/fixtures.ts).
 */
import type { Transform } from "../types.ts";

export class TransformRegistry {
  #byName = new Map<string, Transform>();

  register(t: Transform): this {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(t.name)) {
      throw new Error(`Invalid transform name "${t.name}" (use kebab-case)`);
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

/**
 * Registered transforms. Empty in WP0; `convert --check` is therefore a
 * no-op (WP0 acceptance). Suggested `order` bands:
 *   0-99 frontmatter, 100-199 fences/annotations (WP2/WP3),
 *   200-399 components (WP2/WP3), 400-499 RPC (WP4), 500-599 examples (WP5),
 *   600-699 special collections (WP7), 900+ cleanup/verification.
 */
export function defaultTransforms(): TransformRegistry {
  const registry = new TransformRegistry();
  // registry.register(callout); // WP2
  return registry;
}
