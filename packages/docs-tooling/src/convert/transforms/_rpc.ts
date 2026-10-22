/**
 * Shared helpers for the WP4 RPC transforms (`return-type`, `api-method`,
 * `code-reference`). Not a transform: files starting with `_` are skipped by
 * discovery.
 *
 * The legacy RPC pages are Code Hike "blocks" (codehike/blocks `parseProps`):
 * inside `<APIMethod>` / `<CodeReference>`, headings that start with `!` open
 * sections, fences whose meta starts with `!` fill code slots, and paragraphs
 * made only of `!key value` lines set values. `parseHikeSections` reproduces
 * Code Hike's `listToSection` (codehike@1.0.7, mdx/1.1.remark-list-to-section)
 * so the conversion sees exactly the tree the old components rendered:
 *
 *   ### !params            single section "params"
 *   #### !! pubkey         multi section "blocks", title "pubkey"
 *   ### !!result Healthy   multi section "result", title "Healthy"
 *   ```ts !!request title="Kit"   multi code "request", title `title="Kit"`
 *   !type string  /  !required    value lines
 *
 * One deliberate difference: Code Hike only splits value lines at line
 * breaks, so `!type string !required` (482 lines in the corpus) rendered as
 * the type "string !required" and was never required. Here every known key
 * (`!type`, `!required`, `!values`, `!default`, `!optional`) starts a new
 * value wherever it appears, which is what the authors meant.
 */
import type { AstNode, ConvertContext, ConvertFile } from "../../types.ts";

// ---------------------------------------------------------------------------
// mdast helpers
// ---------------------------------------------------------------------------

export type JsxAttrValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { expr: string };

export const isJsx = (n: AstNode | undefined, name?: string): boolean =>
  !!n &&
  (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") &&
  (name === undefined || n.name === name);

/** Build a flow JSX element. `true`/`null` values are boolean attributes. */
export function jsx(
  name: string,
  attrs: Record<string, JsxAttrValue> = {},
  children: AstNode[] = [],
): AstNode {
  const attributes: AstNode[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (v === null || v === true) {
      attributes.push({ type: "mdxJsxAttribute", name: k, value: null });
    } else if (typeof v === "object") {
      attributes.push({
        type: "mdxJsxAttribute",
        name: k,
        value: { type: "mdxJsxAttributeValueExpression", value: v.expr },
      });
    } else {
      attributes.push({ type: "mdxJsxAttribute", name: k, value: String(v) });
    }
  }
  return { type: "mdxJsxFlowElement", name, attributes, children };
}

export const text = (value: string): AstNode => ({ type: "text", value });
export const inlineCode = (value: string): AstNode => ({
  type: "inlineCode",
  value,
});
export const paragraph = (children: AstNode[]): AstNode => ({
  type: "paragraph",
  children,
});
export const heading = (depth: number, value: string): AstNode => ({
  type: "heading",
  depth,
  children: [text(value)],
});

/** Plain text of a node (mdast-util-to-string semantics). */
export function toText(node: AstNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string" && node.type !== "yaml")
    return node.value as string;
  if (node.type === "break") return "\n";
  return (node.children ?? []).map(toText).join("");
}

/** Visit every node with its parent (pre-order). */
export function walk(
  node: AstNode,
  fn: (n: AstNode, parent: AstNode | null, index: number) => void,
  parent: AstNode | null = null,
  index = -1,
) {
  fn(node, parent, index);
  const kids = node.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) walk(kids[i]!, fn, node, i);
}

/** Every JSX flow element named `name`, with its parent, deepest first. */
export function findJsx(
  tree: AstNode,
  name: string,
): { node: AstNode; parent: AstNode }[] {
  const out: { node: AstNode; parent: AstNode }[] = [];
  walk(tree, (n, parent) => {
    if (parent && n.type === "mdxJsxFlowElement" && n.name === name)
      out.push({ node: n, parent });
  });
  // Deepest first so nested elements are replaced before their ancestors.
  return out.reverse();
}

/** Replace `node` in `parent.children` with `replacement` (spliced). */
export function replaceNode(
  parent: AstNode,
  node: AstNode,
  replacement: AstNode[],
) {
  const kids = parent.children!;
  const i = kids.indexOf(node);
  if (i < 0) throw new Error("replaceNode: node is not a child of parent");
  kids.splice(i, 1, ...replacement);
}

// ---------------------------------------------------------------------------
// Code Hike section parsing
// ---------------------------------------------------------------------------

export interface HikeValues {
  type?: string;
  required: boolean;
  optional: boolean;
  values?: string[];
  default?: string;
  /** `!key` lines with an unknown key, verbatim. */
  unknown: string[];
  /** Value lines that held several known keys (`!type x !required`). */
  inlineSplits: number;
}

export interface HikeSection {
  depth: number;
  multi: boolean;
  /** Section name ("blocks" for `!! title`). */
  name: string;
  title: string;
  heading?: AstNode;
  values: HikeValues;
  /** Hike fences (`!name` / `!!name` meta) in this section, in order. */
  code: HikeCode[];
  /** Everything else, in order (moved verbatim into the output). */
  content: AstNode[];
  children: HikeSection[];
}

export interface HikeCode {
  node: AstNode;
  name: string;
  multi: boolean;
  /** Meta after the slot name, e.g. `curl` or `title="Kit"`. */
  title: string;
}

const DEFAULT_BLOCKS = "blocks";
const DEFAULT_CODE = "code";
const KNOWN_KEYS = ["type", "required", "values", "default", "optional"];
const KEY_SPLIT = new RegExp(`\\s+(?=!(?:${KNOWN_KEYS.join("|")})\\b)`);

function emptyValues(): HikeValues {
  return { required: false, optional: false, unknown: [], inlineSplits: 0 };
}

/** Code Hike `parseName`: `!!name title` / `!name title` / `!! title`. */
export function parseHikeName(value: string): {
  multi: boolean;
  name: string;
  title: string;
} {
  const v = value.trim();
  const multi = v.startsWith("!!");
  const content = multi ? v.slice(2) : v.slice(1);
  const name = content.split(/\s+/)[0] ?? "";
  const title = content.slice(name.length).trim();
  return { multi, name, title };
}

export function isHikeHeading(n: AstNode): boolean {
  return (
    n.type === "heading" &&
    n.children?.[0]?.type === "text" &&
    String(n.children[0].value).trim().startsWith("!")
  );
}

export function isHikeCode(n: AstNode): boolean {
  return (
    n.type === "code" &&
    String(n.meta ?? "")
      .trim()
      .startsWith("!")
  );
}

/** Code Hike `isImageAndParagraphs` (images are not used in RPC pages). */
export function isValueParagraph(n: AstNode): boolean {
  if (n.type !== "paragraph" || !n.children?.length) return false;
  let sawValue = false;
  for (const c of n.children) {
    if (c.type === "break") continue;
    if (c.type !== "text") return false;
    const v = String(c.value);
    if (v.trim() === "") continue;
    if (!v.trim().startsWith("!")) return false;
    sawValue = true;
  }
  return sawValue;
}

/** Code Hike `splitValues` + the known-key split described above. */
function readValues(p: AstNode, into: HikeValues) {
  const raw = (p.children ?? [])
    .map((c) => (c.type === "break" ? "\n" : String(c.value ?? "")))
    .join("");
  const lines = raw.trim().match(/(?:!!|!).*(?:(?:\r?\n|\r)(?!!|!).*)*/g) ?? [];
  for (const line of lines) {
    const parts = line.trim().split(KEY_SPLIT);
    if (parts.length > 1) into.inlineSplits++;
    for (const part of parts) {
      const { name, title } = parseHikeName(part.replace(/\s+/g, " "));
      switch (name) {
        case "type":
          into.type = title;
          break;
        case "required":
          into.required = true;
          break;
        case "optional":
          into.optional = true;
          break;
        case "values":
          into.values = title.split(/\s+/).filter(Boolean);
          break;
        case "default":
          into.default = title;
          break;
        default:
          into.unknown.push(part.trim());
      }
    }
  }
}

/**
 * Parse a block's children into Code Hike's section tree. Mirrors
 * `listToSection`: a hike heading closes every open section of the same or
 * greater depth; everything else attaches to the innermost open section.
 */
export function parseHikeSections(children: AstNode[]): HikeSection {
  const root: HikeSection = {
    depth: 0,
    multi: false,
    name: "",
    title: "",
    values: emptyValues(),
    code: [],
    content: [],
    children: [],
  };
  const stack: HikeSection[] = [root];
  const top = () => stack[stack.length - 1]!;
  for (const child of children) {
    if (isHikeHeading(child)) {
      const depth = Number(child.depth);
      while (stack.length > 1 && top().depth >= depth) stack.pop();
      const { multi, name, title } = parseHikeName(toText(child));
      const section: HikeSection = {
        depth,
        multi,
        name: name || DEFAULT_BLOCKS,
        title,
        heading: child,
        values: emptyValues(),
        code: [],
        content: [],
        children: [],
      };
      top().children.push(section);
      stack.push(section);
    } else if (isHikeCode(child)) {
      const { multi, name, title } = parseHikeName(String(child.meta));
      top().code.push({
        node: child,
        name: name || DEFAULT_CODE,
        multi,
        title,
      });
    } else if (isValueParagraph(child)) {
      readValues(child, top().values);
    } else {
      top().content.push(child);
    }
  }
  return root;
}

/** Report value lines that the conversion cannot represent. */
export function reportValues(
  s: HikeSection,
  ctx: ConvertContext,
  where: string,
) {
  for (const u of s.values.unknown)
    ctx.warn(`${where}: unknown Code Hike value "${u}" dropped`);
  if (s.values.required && s.values.optional)
    ctx.warn(`${where}: both !required and !optional; kept required`);
}

// ---------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------

const SLASH_LANGS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "javascript",
  "typescript",
  "rs",
  "rust",
  "json",
  "jsonc",
  "c",
  "cpp",
  "go",
  "java",
  "kotlin",
  "swift",
  "csharp",
  "cs",
]);
const HASH_LANGS = new Set([
  "sh",
  "bash",
  "shell",
  "zsh",
  "py",
  "python",
  "toml",
  "yaml",
  "yml",
  "rb",
  "ruby",
]);

function annotationRe(lang: string): RegExp {
  const l = lang.toLowerCase();
  if (HASH_LANGS.has(l)) return /^\s*#\s*!(\w+)(.*)$/;
  if (SLASH_LANGS.has(l)) return /^\s*\/\/\s*!(\w+)(.*)$/;
  return /^\s*(?:\/\/|#|--)\s*!(\w+)(.*)$/;
}

export interface CleanedCode {
  value: string;
  /** A `!collapse(...) collapsed` annotation was present. */
  collapsed: boolean;
  /** Annotation names removed, in order. */
  removed: string[];
}

/**
 * Remove Code Hike annotation comment lines (`// !hover x`, `# !mark`, ...).
 * Only own-line annotations exist in the RPC pages; `!collapse … collapsed`
 * becomes the docs `expandable` flag (spec §3.2).
 */
export function stripAnnotations(value: string, lang: string): CleanedCode {
  const re = annotationRe(lang);
  const removed: string[] = [];
  let collapsed = false;
  const lines = value.split("\n").filter((line) => {
    const m = re.exec(line);
    if (!m) return true;
    removed.push(m[1]!);
    if (m[1] === "collapse" && /\bcollapsed\b/.test(m[2] ?? ""))
      collapsed = true;
    return false;
  });
  return { value: lines.join("\n"), collapsed, removed };
}

/** `title="Kit"` / `Kit` / `curl` -> the display title (or ""). */
export function hikeCodeTitle(title: string): string {
  const m = /\btitle=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(title);
  if (m) return (m[1] ?? m[2] ?? m[3] ?? "").trim();
  return title.trim();
}

/** Docs fence meta: `Title` or `title="Two words"`, then flags. */
export function fenceMeta(title: string, flags: string[] = []): string | null {
  const parts: string[] = [];
  if (title) parts.push(/\s/.test(title) ? `title="${title}"` : title);
  parts.push(...flags);
  return parts.length ? parts.join(" ") : null;
}

export function codeNode(
  lang: string,
  meta: string | null,
  value: string,
): AstNode {
  return { type: "code", lang, meta, value };
}

/** Normalize JSON languages after comment stripping (json when no `//`). */
export function jsonLang(lang: string, value: string): string {
  if (lang !== "jsonc") return lang;
  try {
    JSON.parse(value);
    return "json";
  } catch {
    return "jsonc";
  }
}

/** A hike fence turned into a plain docs fence. */
export function plainFence(
  code: HikeCode,
  opts: { title?: string; ctx: ConvertContext; where: string },
): AstNode {
  const lang = String(code.node.lang ?? "text");
  const cleaned = stripAnnotations(String(code.node.value ?? ""), lang);
  for (const r of cleaned.removed)
    if (r !== "hover" && r !== "collapse")
      opts.ctx.warn(`${opts.where}: dropped Code Hike annotation !${r}`);
  const title = opts.title ?? hikeCodeTitle(code.title);
  return codeNode(
    jsonLang(lang, cleaned.value),
    fenceMeta(title, cleaned.collapsed ? ["expandable"] : []),
    cleaned.value,
  );
}

/** Wrap a single-quoted shell argument. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The cURL command the old `APIMethod` built from a `!!request curl` body. */
export function curlCommand(json: string, endpoint: string): string {
  const body = json
    .trimEnd()
    .split("\n")
    .map((l) => (l ? `  ${l}` : l))
    .join("\n");
  return [
    `curl ${endpoint} -s -X POST \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d ${shellQuote(`\n${body}\n`)}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Field rendering (ParamField / ResponseField trees)
// ---------------------------------------------------------------------------

export type FieldKind = "param" | "response";

/** `Values: \`a\`, \`b\`` (spec §3.1: `!values` becomes a body line). */
export function valuesParagraph(values: string[]): AstNode {
  const kids: AstNode[] = [text("Values: ")];
  values.forEach((v, i) => {
    if (i) kids.push(text(", "));
    kids.push(inlineCode(v));
  });
  return paragraph(kids);
}

/**
 * One field section -> `<ParamField body=…>` / `<ResponseField name=…>`,
 * with nested sections inside `<Expandable title="properties">`.
 *
 * The Expandable of a top-level field is `defaultOpen`, so the names, types
 * and descriptions of its direct children are visible at a glance (the old
 * component always showed nested field names and types); deeper levels start
 * closed. Expandable renders as native `<details>`, so every level opens
 * without JavaScript.
 */
export function renderField(
  s: HikeSection,
  kind: FieldKind,
  ctx: ConvertContext,
  where: string,
  opts: { name?: string; post?: string; level?: number } = {},
): AstNode {
  const level = opts.level ?? 0;
  const name = opts.name ?? s.title;
  const here = `${where} > ${name || "(unnamed)"}`;
  if (!name) ctx.warn(`${here}: field has no name`);
  if (!s.values.type) ctx.warn(`${here}: field has no !type`);
  reportValues(s, ctx, here);
  for (const c of s.code)
    ctx.warn(`${here}: unexpected Code Hike fence "${c.name}" kept as code`);
  const body: AstNode[] = [];
  if (s.values.values?.length) body.push(valuesParagraph(s.values.values));
  body.push(...s.content);
  body.push(...s.code.map((c) => plainFence(c, { ctx, where: here })));
  if (s.children.length) {
    body.push(
      jsx(
        "Expandable",
        { title: "properties", defaultOpen: level === 0 || undefined },
        s.children.map((c) => renderChild(c, kind, ctx, here, level + 1)),
      ),
    );
  }
  const attrs: Record<string, JsxAttrValue> =
    kind === "param" ? { body: name } : { name };
  attrs.type = s.values.type;
  attrs.required = s.values.required || undefined;
  attrs.default = s.values.default;
  if (opts.post) attrs.post = { expr: JSON.stringify([opts.post]) };
  return jsx(kind === "param" ? "ParamField" : "ResponseField", attrs, body);
}

function renderChild(
  s: HikeSection,
  kind: FieldKind,
  ctx: ConvertContext,
  where: string,
  level: number,
): AstNode {
  if (s.name !== DEFAULT_BLOCKS)
    ctx.warn(`${where}: unexpected section "!${s.name}" rendered as a field`);
  return renderField(s, kind, ctx, where, { level });
}

/** The field sections of a slot section (its `!! name` children). */
export function fieldChildren(
  s: HikeSection,
  ctx: ConvertContext,
  where: string,
): HikeSection[] {
  return s.children.filter((c) => {
    if (c.name === DEFAULT_BLOCKS) return true;
    ctx.warn(`${where}: unexpected section "!${c.name}" dropped`);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Page-level helpers
// ---------------------------------------------------------------------------

/**
 * Depth for the generated "Parameters"/"Result" headings: the shallowest
 * author heading at the page root (so e.g. `### Notification format` stays a
 * sibling), clamped to h2..h3. Code Hike headings (`### !params`) are not
 * author headings.
 */
export function sectionDepth(tree: AstNode): number {
  let min = Infinity;
  for (const n of tree.children ?? []) {
    if (n.type === "heading" && !isHikeHeading(n))
      min = Math.min(min, Number(n.depth));
  }
  if (!Number.isFinite(min)) return 2;
  return Math.min(3, Math.max(2, min));
}

/** WebSocket method pages (subscriptions are not HTTP POSTs). */
export function isWebSocketPage(file: Pick<ConvertFile, "path">): boolean {
  return /(^|\/)rpc\/websocket\//.test(file.path);
}

/** Public RPC endpoint used by the generated cURL examples (as before). */
export const DEVNET_RPC = "https://api.devnet.solana.com";
