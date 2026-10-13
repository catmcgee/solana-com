/**
 * Navigation (WP6). Stub published by WP0 so the CLI surface is stable.
 *
 * WP6 implements:
 * - `compile-legacy-nav.ts`: legacy meta.json (moved beside the content by
 *   WP1, status `moved-meta` in migration/move-map.csv) -> navigation/en.json
 *   + navigation/labels/*.json seeds;
 * - `build-locale-nav.ts [--check]`: navigation/<loc>.json from en.json,
 *   omitting missing pages and writing generated/locale-fallbacks.json
 *   (schema: `LocaleFallbacksFile` in src/types.ts).
 *
 * Greek is dropped (decisions.md), so there is no `--el-mode`.
 */
export interface NavOptions {
  check?: boolean;
}

export function runNav(_opts: NavOptions = {}): {
  implemented: false;
  message: string;
} {
  return {
    implemented: false,
    message:
      "nav: not implemented yet (WP6). See src/nav/index.ts for the contract.",
  };
}
