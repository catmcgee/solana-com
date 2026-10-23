/**
 * WP4 (RPC) checks beyond the per-transform fixture goldens:
 *
 * - helpers: Code Hike name/value parsing, annotation stripping, cURL;
 * - corpus (read-only, in memory): every file with `<APIMethod>` /
 *   `<CodeReference>` converts without errors through return-type ->
 *   api-method -> code-reference, leaves no Code Hike RPC syntax, emits one
 *   ParamField/ResponseField per source `!type` (spec §9 WP4 acceptance),
 *   reparses as MDX and is idempotent;
 * - Surfpool: snippets are fresh (`gen:surfpool --check`), list every method
 *   in the schemas, use only server-rendered built-ins, and every Surfpool
 *   page converts to an import of an existing snippet.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/lib/paths.ts";
import { TransformRegistry } from "../src/convert/registry.ts";
import { convertSource, mdxCodec } from "../src/convert/run.ts";
import { transform as returnType } from "../src/convert/transforms/return-type.ts";
import { transform as apiMethod } from "../src/convert/transforms/api-method.ts";
import { transform as codeReference } from "../src/convert/transforms/code-reference.ts";
import {
  curlCommand,
  parseHikeName,
  parseHikeSections,
  stripAnnotations,
} from "../src/convert/transforms/_rpc.ts";
import {
  SURFPOOL_CATEGORIES,
  SURFNET_UNSUPPORTED_ADMIN,
  SURFPOOL_SNIPPET_DIR,
  loadSurfpoolSchemas,
  mergeJson,
  renderSurfpoolSnippets,
  runSurfpoolGenerator,
} from "../src/generators/surfpool-rpc.ts";
import type { AstNode, Collection } from "../src/types.ts";

const wp4 = new TransformRegistry()
  .register(returnType)
  .register(apiMethod)
  .register(codeReference);

const docsDir = path.join(repoRoot, "apps", "docs");
const LOCALE_RE =
  /^apps\/docs\/(ar|de|es|fi|fr|id|it|ja|ko|nl|pl|pt|ru|tr|uk|vi|zh)\//;

function* mdxFiles(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "snippets" || n.startsWith(".")) continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) yield* mdxFiles(p);
    else if (n.endsWith(".mdx")) yield p;
  }
}

const fileMeta = (rel: string) => ({
  path: rel,
  locale: LOCALE_RE.exec(rel)?.[1] ?? "en",
  collection: "docs" as Collection,
});

/** `!type` tokens outside fences (inline `!type x !required` counts once). */
function countTypes(src: string): number {
  let n = 0;
  let fence = false;
  for (const line of src.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    else if (!fence) n += line.match(/(^|\s)!type\b/g)?.length ?? 0;
  }
  return n;
}

function jsxNames(tree: AstNode, out = new Map<string, number>()) {
  if (
    (tree.type === "mdxJsxFlowElement" || tree.type === "mdxJsxTextElement") &&
    typeof tree.name === "string"
  )
    out.set(tree.name, (out.get(tree.name) ?? 0) + 1);
  for (const c of tree.children ?? []) jsxNames(c, out);
  return out;
}

describe("WP4 helpers", () => {
  it("parses Code Hike names like codehike/blocks", () => {
    expect(parseHikeName("!! pubkey")).toEqual({
      multi: true,
      name: "",
      title: "pubkey",
    });
    expect(parseHikeName("!!result Healthy")).toEqual({
      multi: true,
      name: "result",
      title: "Healthy",
    });
    expect(parseHikeName("!params")).toEqual({
      multi: false,
      name: "params",
      title: "",
    });
  });

  it("splits one-line `!type x !required !values … !default …`", () => {
    const tree = mdxCodec.parse(
      "#### !! commitment\n\n!type string !required !values a b !default b\n\nText.\n",
    ).tree;
    const s = parseHikeSections(tree.children!).children[0]!;
    expect(s.values).toMatchObject({
      type: "string",
      required: true,
      values: ["a", "b"],
      default: "b",
      inlineSplits: 1,
    });
    expect(s.content).toHaveLength(1);
  });

  it("removes annotation lines and maps !collapse … collapsed to expandable", () => {
    const r = stripAnnotations(
      '{\n  // !hover x\n  "a": 1,\n  // !collapse(1:2) collapsed\n  "b": {}\n}',
      "jsonc",
    );
    expect(r.value).toBe('{\n  "a": 1,\n  "b": {}\n}');
    expect(r.collapsed).toBe(true);
    expect(stripAnnotations("# !mark\necho", "bash").value).toBe("echo");
    // A `//` inside a JSON string is not an annotation.
    expect(stripAnnotations('"x": "a//!b"', "jsonc").value).toBe(
      '"x": "a//!b"',
    );
  });

  it("builds the cURL command and escapes single quotes", () => {
    expect(curlCommand('{"a":"it\'s"}', "https://h")).toBe(
      [
        "curl https://h -s -X POST \\",
        '  -H "Content-Type: application/json" \\',
        `  -d '\n  {"a":"it'\\''s"}\n'`,
      ].join("\n"),
    );
  });
});

/**
 * The corpus tests convert the PRE-conversion pages. Since the integration
 * convert run the working tree holds converted content, so the source
 * is read from git: DOCS_CORPUS_REF (default c06186ae1, the move commit,
 * content in the docs layout but not yet converted).
 */
const CORPUS_REF = process.env.DOCS_CORPUS_REF ?? "c06186ae1";
function corpusAtRef(ref: string): Map<string, string> {
  const names = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "apps/docs"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 28 },
  )
    .split("\n")
    .filter((n) => /\.mdx?$/.test(n) && !n.startsWith("apps/docs/snippets/"));
  const out = new Map<string, string>();
  const batch = execFileSync("git", ["cat-file", "--batch"], {
    cwd: repoRoot,
    input: names.map((n) => `${ref}:${n}`).join("\n") + "\n",
    maxBuffer: 1 << 30,
  });
  let pos = 0;
  for (const n of names) {
    const nl = batch.indexOf(10, pos);
    const size = Number(batch.subarray(pos, nl).toString().split(" ")[2]);
    out.set(n, batch.subarray(nl + 1, nl + 1 + size).toString("utf8"));
    pos = nl + 1 + size + 1;
  }
  return out;
}
const corpus = corpusAtRef(CORPUS_REF);

describe("WP4 corpus conversion (read-only)", () => {
  const files = [...corpus]
    .map(([rel, src]) => ({ rel, src }))
    .filter(({ src }) => /<(APIMethod|CodeReference)\b/.test(src))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  it("finds the RPC pages (71 en APIMethod pages, CodeReference in 10)", () => {
    const en = files.filter((f) => !LOCALE_RE.test(f.rel));
    const api = en.filter((f) => f.src.includes("<APIMethod"));
    expect(api).toHaveLength(71);
    const cr = en.filter((f) => f.src.includes("<CodeReference"));
    expect(cr).toHaveLength(10);
    expect(files.length).toBeGreaterThan(1200);
  });

  it("converts every file: no errors, no Code Hike RPC syntax, one field per !type, MDX, idempotent", () => {
    const problems: string[] = [];
    for (const { src, rel } of files) {
      const meta = fileMeta(rel);
      const r = convertSource(src, meta, wp4);
      for (const d of r.diagnostics)
        if (d.level === "error")
          problems.push(`${rel}: ${d.transform}: ${d.message}`);
      const out = r.output;
      for (const re of [
        /<APIMethod\b/,
        /<CodeReference\b/,
        // RPC slot metas (`<CodeTabs>` `!! title=` fences are WP2's).
        /^\s*```\w*\s+!(!request|response|!\s*$)/m,
        /^#+ !/m,
        /^\s*(\/\/|#)\s*!(hover|collapse)\b/m,
        /^!(type|required|values|default|optional)\b/m,
      ])
        if (re.test(out)) problems.push(`${rel}: residual ${re}`);
      const tree = mdxCodec.parse(out, { path: rel }).tree;
      const names = jsxNames(tree);
      const fields =
        (names.get("ParamField") ?? 0) + (names.get("ResponseField") ?? 0);
      const types = countTypes(src);
      if (fields !== types)
        problems.push(`${rel}: ${fields} fields for ${types} !type`);
      if (src.includes("<APIMethod") && names.get("RequestExample") !== 1)
        problems.push(`${rel}: expected one RequestExample`);
      if ((names.get("ResponseExample") ?? 0) > 1)
        problems.push(`${rel}: several ResponseExample`);
      if (convertSource(out, meta, wp4).output !== out)
        problems.push(`${rel}: not idempotent`);
    }
    expect(problems).toEqual([]);
  });

  it("drops hideTableOfContents / mode: wide on API method pages only", () => {
    // Corpus files are read at CORPUS_REF, before the /developers/docs move.
    const rel = "apps/docs/docs/rpc/http/getbalance.mdx";
    const out = convertSource(corpus.get(rel)!, fileMeta(rel), wp4).output;
    expect(out).not.toMatch(/hideTableOfContents|mode: wide/);
    const wide = convertSource(
      "---\ntitle: x\nmode: wide\n---\n\n<APIMethod>\n\n```jsonc !!request curl\n{}\n```\n\n### !params\n\n</APIMethod>\n",
      {
        path: "apps/docs/developers/docs/rpc/http/x.mdx",
        locale: "en",
        collection: "docs",
      },
      wp4,
    ).output;
    expect(wide).not.toContain("mode:");
  });

  it("shows WebSocket requests as messages, HTTP requests as cURL", () => {
    const ws = "apps/docs/developers/docs/rpc/websocket/accountsubscribe.mdx";
    const http = "apps/docs/developers/docs/rpc/http/getbalance.mdx";
    const w = convertSource(
      readFileSync(path.join(repoRoot, ws), "utf8"),
      fileMeta(ws),
      wp4,
    ).output;
    const h = convertSource(
      readFileSync(path.join(repoRoot, http), "utf8"),
      fileMeta(http),
      wp4,
    ).output;
    expect(w).toContain("```json WebSocket");
    expect(w).not.toContain("curl ");
    expect(h).toContain(
      "```bash cURL\n  curl https://api.devnet.solana.com -s -X POST",
    );
  });
});

describe("WP4 Surfpool snippets", () => {
  const schemas = loadSurfpoolSchemas();
  const snippets = renderSurfpoolSnippets(schemas);

  it("committed snippets are fresh (gen:surfpool --check)", () => {
    const r = runSurfpoolGenerator({ check: true });
    expect(r.stale).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("schema sync is a 3-way merge that keeps local edits", () => {
    const base = '{\n  "a": { "const": "Processed" },\n  "b": "old"\n}';
    const ours = '{"a":{"const":"processed"},"b":"old"}'; // local fix, other formatting
    const theirs =
      '{\n  "a": { "const": "Processed" },\n  "b": "new",\n  "c": 1\n}';
    const m = mergeJson(ours, base, theirs);
    expect(m.conflicts).toBe(false);
    expect(JSON.parse(m.text)).toEqual({
      a: { const: "processed" },
      b: "new",
      c: 1,
    });
    const clash = mergeJson('{"b":"ours"}', '{"b":"old"}', '{"b":"theirs"}');
    expect(clash.conflicts).toBe(true);
  });

  it("lists every method in the schemas", () => {
    const headings = new Set<string>();
    for (const s of snippets.values())
      for (const m of s.matchAll(/^## (.+)$/gm))
        headings.add(m[1]!.replace(/\\_/g, "_"));
    const expected = new Set<string>();
    for (const [k, g] of Object.entries(schemas.rpc.$defs ?? {})) {
      if (!/^endpoints\d*$/.test(k)) continue;
      for (const e of g.oneOf ?? []) {
        if (e.type === "string" && e.const) expected.add(String(e.const));
        for (const name of Object.keys(e.properties ?? {}))
          expected.add(k === "endpoints7" ? `surfnet_${name}` : name);
      }
    }
    for (const name of Object.keys(
      schemas.response.$defs?.SurfnetCheatcodesEndpoints?.properties ?? {},
    ))
      expected.add(`surfnet_${name}`);
    for (const name of Object.keys(
      schemas.response.$defs?.WebSocketSubscriptions?.properties ?? {},
    ))
      expected.add(name);
    // Agave admin methods that Surfnet does not implement are intentionally
    // left out of the admin page.
    const missing = [...expected]
      .filter((m) => !SURFNET_UNSUPPORTED_ADMIN.has(m) && !headings.has(m))
      .sort();
    expect(missing).toEqual([]);
    expect(expected.size).toBeGreaterThan(90);
  });

  it("is static MDX built only from server-rendered built-ins", () => {
    const allowed = new Set(["ParamField", "ResponseField", "Expandable"]);
    for (const [f, s] of snippets) {
      const tree = mdxCodec.parse(s, { path: f }).tree;
      const names = [...jsxNames(tree).keys()].filter((n) => !allowed.has(n));
      expect(names, f).toEqual([]);
      expect(
        tree.children!.some((c) => c.type === "mdxjsEsm"),
        f,
      ).toBe(false);
      expect(s, f).toMatch(/^\{\/\* GENERATED by /);
    }
    expect([...snippets.keys()].sort()).toEqual(
      SURFPOOL_CATEGORIES.map((c) => `${c}.mdx`).sort(),
    );
  });

  it("every Surfpool RPC page (all locales) imports an existing snippet", () => {
    const pages = [...mdxFiles(docsDir)]
      .map((abs) => path.relative(repoRoot, abs))
      .filter((rel) =>
        /\/tools\/surfpool\/rpc\/(?!overview)[a-z]+\.mdx$/.test(rel),
      );
    expect(pages.length).toBeGreaterThanOrEqual(7 * 18);
    for (const rel of pages) {
      const src = readFileSync(path.join(repoRoot, rel), "utf8");
      const out = convertSource(src, fileMeta(rel), wp4).output;
      const m =
        /^import (\w+) from "\/snippets\/rpc\/surfpool\/(\w+)\.mdx";$/m.exec(
          out,
        );
      expect(m, rel).not.toBeNull();
      expect(out, rel).toContain(`<${m![1]} />`);
      expect(
        existsSync(path.join(SURFPOOL_SNIPPET_DIR, `${m![2]}.mdx`)),
        rel,
      ).toBe(true);
      expect(out, rel).not.toMatch(/<\w+Rpc \/>/);
      expect(convertSource(out, fileMeta(rel), wp4).output, rel).toBe(out);
    }
  });
});
