/**
 * Runnable examples (WP5). Stub published by WP0 so the CLI surface is stable.
 *
 * WP5 implements:
 * - `extract-blocks.ts`: legacy `<CodeTabs flags="r" file=...>` -> blocks.json
 *   plus snippet imports in every locale;
 * - `build-examples.ts [--check]`: blocks.json + recorded `.output.txt`
 *   (packages/docs-examples) -> apps/docs/snippets/examples/**.mdx.
 * Blocks without recorded output get no Run button (decisions.md).
 */
export interface ExamplesOptions {
  check?: boolean;
}

export function runExamples(_opts: ExamplesOptions = {}): {
  implemented: false;
  message: string;
} {
  return {
    implemented: false,
    message:
      "examples: not implemented yet (WP5). See src/examples/index.ts for the contract.",
  };
}
