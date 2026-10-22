/**
 * codetabs-examples (WP5, spec §3.1): replace legacy example blocks with an
 * import of the generated snippet.
 *
 *   <CodeTabs storage="cookbook" flags="r">
 *   ```ts !! title="Kit" file=packages/docs-examples/cookbook/transactions/send-sol/kit.ts#region=transfer
 *   ```
 *   ...
 *   </CodeTabs>
 *
 * becomes
 *
 *   import SendSolTransfer from "/snippets/examples/cookbook/transactions/send-sol/transfer.mdx";
 *   ...
 *   <SendSolTransfer />
 *
 * Bare include fences (outside `<CodeTabs>`) are converted the same way.
 * Imports go right after the frontmatter, one per block, deduplicated.
 * Block ids come from src/examples/blocks.ts, the same functions the
 * extractor uses to write blocks.json, so the transform needs no I/O. Every
 * locale copy converts to the same import.
 *
 * Runs before the generic fence/CodeTabs transforms (order 85) so they never
 * see `file=` fences. Its output contains no `<CodeTabs>` or `file=`.
 *
 * Checks (read-only, against the repo):
 * - error if the generated snippet does not exist (the import would break
 *   the docs build): run `examples extract` + `examples:build` first;
 * - warn if the page's block differs from its blocks.json entry, and in
 *   particular if an inline tab's code differs (a locale copy with
 *   translated comments): the shared snippet replaces it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  AstNode,
  ConvertContext,
  ConvertFile,
  Transform,
} from "../../types.ts";
import {
  componentName,
  EXAMPLES_PREFIX,
  normalizeBlock,
  snippetImportPath,
  type Block,
  type BlockRef,
  type BlocksFile,
} from "../../examples/blocks.ts";
import { scanExampleBlocks } from "../../examples/mdast.ts";

export const transform: Transform = {
  name: "codetabs-examples",
  order: 85,
  owner: "WP5",
  appliesTo: (source) => source.includes("file=packages/docs-examples/"),
  run(tree, file, ctx) {
    const { blocks, problems } = scanExampleBlocks(tree);
    for (const p of problems) ctx.error(p.message, p.node);
    if (blocks.length === 0) return;
    for (const b of blocks) checkAgainstRepo(b.ref, b.node, file, ctx);

    // Component names: unique per page, stable per block id.
    const nameById = new Map<string, string>();
    const used = new Set<string>(existingImportNames(tree));
    for (const b of blocks) {
      if (nameById.has(b.ref.id)) continue;
      const base = componentName(b.ref.id);
      let name = base;
      for (let i = 2; used.has(name); i++) name = `${base}${i}`;
      used.add(name);
      nameById.set(b.ref.id, name);
    }

    for (const b of blocks) {
      const name = nameById.get(b.ref.id)!;
      const replacement: AstNode = {
        type: "mdxJsxFlowElement",
        name,
        attributes: [],
        children: [],
      };
      const siblings = b.parent.children!;
      siblings[siblings.indexOf(b.node)] = replacement;
    }

    const imports = [...nameById].map(
      ([id, name]) =>
        `import ${name} from ${JSON.stringify(snippetImportPath(id))};`,
    );
    const root = tree.children!;
    const at = root[0]?.type === "yaml" ? 1 : 0;
    root.splice(at, 0, { type: "raw", value: imports.join("\n") });
  },
};

function existingImportNames(tree: AstNode): string[] {
  const out: string[] = [];
  for (const n of tree.children ?? []) {
    if (n.type !== "mdxjsEsm") continue;
    for (const m of String(n.value ?? "").matchAll(
      /import\s+([A-Za-z_$][\w$]*)/g,
    ))
      out.push(m[1]!);
  }
  return out;
}

const blocksCache = new Map<string, BlocksFile | null>();
function readBlocks(file: string): BlocksFile | null {
  if (!blocksCache.has(file)) {
    blocksCache.set(
      file,
      existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as BlocksFile)
        : null,
    );
  }
  return blocksCache.get(file)!;
}

/** Shape of a block without inline code and notes (those may differ legitimately). */
function shape(b: Block): string {
  const n = normalizeBlock(b);
  delete n.outputNote;
  return JSON.stringify({
    ...n,
    tabs: n.tabs.map(({ code: _code, outputNote: _note, ...t }) => t),
  });
}

function checkAgainstRepo(
  ref: BlockRef,
  node: AstNode,
  file: ConvertFile,
  ctx: ConvertContext,
) {
  const snippet = path.join(
    ctx.repoRoot,
    "apps/docs",
    snippetImportPath(ref.id),
  );
  if (!existsSync(snippet)) {
    ctx.error(
      `example snippet ${snippetImportPath(ref.id)} does not exist; run \`docs-tooling examples extract\` and \`examples:build\` first`,
      node,
    );
  }
  const blocksPath = path.join(
    ctx.repoRoot,
    EXAMPLES_PREFIX,
    ref.dir,
    "blocks.json",
  );
  const known = readBlocks(blocksPath)?.[ref.name];
  if (!known) {
    ctx.error(
      `block "${ref.name}" is missing from ${EXAMPLES_PREFIX}${ref.dir}/blocks.json`,
      node,
    );
    return;
  }
  if (shape(known) !== shape(ref.block)) {
    ctx.warn(
      `block ${ref.id} on this page differs from blocks.json (files, regions, highlights or tabs); the page will show the blocks.json version`,
      node,
    );
  }
  for (const tab of ref.block.tabs) {
    if (tab.code === undefined) continue;
    const shared = known.tabs.find(
      (t) => t.title === tab.title && t.code !== undefined,
    );
    if (shared && shared.code!.trimEnd() !== tab.code.trimEnd()) {
      ctx.warn(
        `inline "${tab.title}" tab of ${ref.id} differs from the shared snippet${file.locale !== "en" ? ` (${file.locale} copy, e.g. translated comments)` : ""}; the snippet's version replaces it`,
        node,
      );
    }
  }
}
