/**
 * remark-docs-compat: lets the docs content (apps/docs, written for the
 * Mintlify conventions it was authored in) compile with Fumadocs MDX
 * unchanged.
 *
 * - Snippets: `import X from "/snippets/a/b.mdx"` plus `<X />` in the page.
 *   Each `<X />` is replaced by the snippet's own MDX tree (parsed with this
 *   processor, so its JSX, fences and headings are handled like the page's)
 *   and the import is dropped. The page compiles as one document: headings
 *   from snippets reach the TOC, and the processed Markdown (`.md` twins,
 *   llms-full.txt) contains the snippet text, as it did before.
 *   Snippets may import other snippets; those are inlined the same way.
 * - Heading ids follow the slugs the docs have always published (kept by
 *   `docsSlug`, used through remarkHeading's `slug` option in
 *   source.config.ts), so existing #anchors keep working.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { VFile } from "vfile";
import { findDocsRoot } from "./docs-root.mjs";

const SNIPPET_PREFIX = "/snippets/";

function snippetsDir() {
  return path.join(findDocsRoot(), "snippets");
}

/** Default imports from /snippets/*.mdx in one mdxjsEsm node. */
function snippetImports(node) {
  const found = [];
  const body = node.data?.estree?.body ?? [];
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = String(statement.source?.value ?? "");
    if (!source.startsWith(SNIPPET_PREFIX) || !source.endsWith(".mdx"))
      continue;
    for (const spec of statement.specifiers ?? []) {
      if (spec.type === "ImportDefaultSpecifier")
        found.push({ name: spec.local.name, source, statement });
    }
  }
  return found;
}

function removeStatements(node, statements) {
  const body = node.data.estree.body.filter((s) => !statements.includes(s));
  node.data.estree.body = body;
  // Keep the source text in step with the estree for the Markdown output.
  node.value = node.value
    .split("\n")
    .filter(
      (line) =>
        !/^\s*import\s+\w+\s+from\s+["']\/snippets\/[^"']+\.mdx["'];?\s*$/.test(
          line,
        ),
    )
    .join("\n");
  return body.length === 0;
}

function isSnippetElement(node, names) {
  return (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    names.has(node.name)
  );
}

/**
 * Replace every <Name /> whose Name is a snippet import with the snippet
 * tree. `seen` guards against import cycles.
 */
function inlineSnippets(processor, tree, file, seen = new Set()) {
  const imports = new Map();
  const emptyEsm = new Set();
  for (const node of tree.children) {
    if (node.type !== "mdxjsEsm") continue;
    const found = snippetImports(node);
    if (!found.length) continue;
    for (const item of found) imports.set(item.name, item.source);
    if (
      removeStatements(
        node,
        found.map((f) => f.statement),
      )
    )
      emptyEsm.add(node);
  }
  if (emptyEsm.size)
    tree.children = tree.children.filter((n) => !emptyEsm.has(n));
  if (!imports.size) return;

  const names = new Set(imports.keys());
  const cache = new Map();
  const load = (name) => {
    const source = imports.get(name);
    if (cache.has(source)) return structuredClone(cache.get(source));
    const abs = path.join(snippetsDir(), source.slice(SNIPPET_PREFIX.length));
    if (seen.has(abs)) throw new Error(`snippet import cycle at ${abs}`);
    const value = readFileSync(abs, "utf8");
    file.data?._compiler?.addDependency?.(abs);
    const child = new VFile({ path: abs, value, data: file.data });
    const parsed = processor.parse(child);
    inlineSnippets(processor, parsed, child, new Set([...seen, abs]));
    cache.set(source, parsed);
    return structuredClone(parsed);
  };

  const visit = (parent) => {
    if (!parent.children) return;
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i];
      if (isSnippetElement(node, names)) {
        const snippet = load(node.name);
        // ESM (imports/exports a snippet declares) moves to the page root.
        const esm = snippet.children.filter((n) => n.type === "mdxjsEsm");
        const content = snippet.children.filter((n) => n.type !== "mdxjsEsm");
        if (esm.length) tree.children.unshift(...esm);
        let replacement = content;
        if (node.type === "mdxJsxTextElement") {
          // Inline use: unwrap a single paragraph so the text stays inline.
          replacement =
            content.length === 1 && content[0].type === "paragraph"
              ? content[0].children
              : content;
        }
        parent.children.splice(i, 1, ...replacement);
        i += replacement.length - 1;
        continue;
      }
      visit(node);
    }
  };
  visit(tree);
}

export function remarkDocsCompat() {
  const processor = this;
  return (tree, file) => {
    inlineSnippets(processor, tree, file);
  };
}

/**
 * Heading slugs as the docs have published them: lower case; spaces and
 * dots become hyphens; letters, digits, `-`, `_` and a few symbols are
 * kept (/ & + # @ ’ “ ” → and full-width ？ ：), all other punctuation and
 * emoji are dropped; runs of hyphens collapse. Inside inline code an
 * opening parenthesis separates words (`useTheme(theme)` -> usetheme-theme).
 * Repeats on one page get -2, -3, ...
 */
const KEEP = /[\p{L}\p{N}\-_’/&+”“→？#@：\s.]/u;

export function docsSlugBase(text) {
  let s = text.toLowerCase().trim();
  s = [...s].filter((c) => KEEP.test(c)).join("");
  return s.replace(/[\s.]+/g, "-").replace(/-+/g, "-");
}

function headingText(node) {
  if (node.type === "inlineCode") return node.value.replace(/\(/g, " ");
  if (node.type === "text") return node.value;
  if (node.children) return node.children.map(headingText).join("");
  return "";
}

const counters = new WeakMap();

export function docsSlug(root, heading) {
  let used = counters.get(root);
  if (!used) {
    used = new Map();
    counters.set(root, used);
  }
  const base = docsSlugBase(headingText(heading));
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}
