/**
 * WP3 acceptance (spec §9): goldens for build-first-program,
 * account-structure and deferred-execution in en, fr and ru, run through
 * every WP3 Code Hike transform via the real MDX codec.
 *
 * UPDATE_GOLDENS=1 rewrites out.mdx (review the diff before committing).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Collection, Transform } from "../src/types.ts";
import { toolingRoot } from "../src/lib/paths.ts";
import { TransformRegistry } from "../src/convert/registry.ts";
import { convertSource, mdxCodec } from "../src/convert/run.ts";
import { transform as notes } from "../src/convert/transforms/notes.ts";
import { transform as mentions } from "../src/convert/transforms/mentions.ts";
import { transform as sideBySide } from "../src/convert/transforms/side-by-side.ts";
import { transform as scrolly } from "../src/convert/transforms/scrolly.ts";
import { transform as files } from "../src/convert/transforms/files.ts";
import {
  hasPhoneVariant,
  mermaidHash,
  transform as mermaid,
} from "../src/convert/transforms/mermaid.ts";
import { transform as terminal } from "../src/convert/transforms/terminal.ts";
import type { AstNode } from "../src/types.ts";

export const WP3_TRANSFORMS: Transform[] = [
  notes,
  mentions,
  sideBySide,
  scrolly,
  files,
  mermaid,
  terminal,
];

const ROOT = path.join(toolingRoot, "__fixtures__", "goldens-wp3");
const UPDATE = process.env.UPDATE_GOLDENS === "1";

/** Code Hike syntax WP3 owns; none may survive. */
const RESIDUAL: Array<[string, RegExp]> = [
  ["<ScrollyCoding", /<ScrollyCoding\b/],
  ["<CodePlaceholder", /<CodePlaceholder\b/],
  ["<WithMentions", /<WithMentions\b/],
  ["<WithNotes", /<WithNotes\b/],
  ["<SideBySide", /<SideBySide\b/],
  ["<Files", /<Files\b/],
  ["<Folder", /<Folder\b/],
  ["<File ", /<File\s/],
  ["mention: link", /\]\(mention:/],
  ["## !!steps", /^\s*## !!/m],
  ["### !note", /^\s*### !/m],
  ["!tooltip line", /^\s*(\/\/|#|--)\s*!tooltip\b/m],
  ["!mention line", /^\s*(\/\/|#|--)\s*!mention\b/m],
  ["terminal fence", /^\s*`{3,}terminal\b/m],
  ["mermaid title", /^[ \t]*`{3,}mermaid[ \t]+\S/m],
];

interface Golden {
  name: string;
  dir: string;
  input: string;
  file: { path: string; locale: string; collection: Collection };
}

function loadGoldens(): Golden[] {
  const out: Golden[] = [];
  for (const page of readdirSync(ROOT).sort()) {
    const pdir = path.join(ROOT, page);
    if (!statSync(pdir).isDirectory()) continue;
    for (const loc of readdirSync(pdir).sort()) {
      const dir = path.join(pdir, loc);
      const meta = JSON.parse(
        readFileSync(path.join(dir, "meta.json"), "utf8"),
      ) as Golden["file"];
      out.push({
        name: `${page}/${loc}`,
        dir,
        input: readFileSync(path.join(dir, "in.mdx"), "utf8"),
        file: meta,
      });
    }
  }
  return out;
}

function walk(n: AstNode, fn: (n: AstNode, parent: AstNode | null) => void) {
  const go = (x: AstNode, p: AstNode | null) => {
    fn(x, p);
    for (const c of x.children ?? []) go(c, x);
  };
  go(n, null);
}

const registry = new TransformRegistry();
for (const t of WP3_TRANSFORMS) registry.register(t);
const goldens = loadGoldens();

describe("WP3 goldens", () => {
  it("covers the three anchor pages in en, fr and ru", () => {
    expect(goldens.map((g) => g.name).sort()).toEqual(
      [
        "account-structure",
        "build-first-program",
        "deferred-execution",
      ].flatMap((p) => ["en", "fr", "ru"].map((l) => `${p}/${l}`)),
    );
  });

  for (const g of goldens) {
    describe(g.name, () => {
      const { output, diagnostics } = convertSource(g.input, g.file, registry);
      const outPath = path.join(g.dir, "out.mdx");
      if (UPDATE) writeFileSync(outPath, output);

      it("matches out.mdx with no errors", () => {
        expect(diagnostics.filter((d) => d.level === "error")).toEqual([]);
        expect(existsSync(outPath)).toBe(true);
        expect(output).toBe(readFileSync(outPath, "utf8"));
      });

      it("is idempotent", () => {
        expect(convertSource(output, g.file, registry).output).toBe(output);
      });

      it("leaves no WP3-owned Code Hike syntax", () => {
        const hits = RESIDUAL.filter(([, re]) => re.test(output)).map(
          ([k]) => k,
        );
        expect(hits).toEqual([]);
      });

      it("pairs every mermaid fence with its pre-rendered figure", () => {
        const { tree } = mdxCodec.parse(output, { path: g.file.path });
        walk(tree, (n) => {
          const kids = n.children ?? [];
          kids.forEach((c, i) => {
            if (c.type !== "code" || c.lang !== "mermaid") return;
            const next = kids[i + 1] as AstNode | undefined;
            expect(next?.type).toBe("mdxJsxFlowElement");
            expect(next?.name).toBe("div");
            const attrs = (next?.attributes ?? []) as {
              name: string;
              value: unknown;
            }[];
            expect(attrs.find((a) => a.name === "data-mermaid")?.value).toBe(
              mermaidHash(String(c.value)),
            );
            const imgs = (next?.children ?? []).filter((k) => k.name === "img");
            // Left-to-right flowcharts also carry their phone drawing.
            expect(imgs).toHaveLength(hasPhoneVariant(String(c.value)) ? 4 : 2);
          });
        });
      });

      it("keeps every note body and step title as server-rendered text", () => {
        // Note bodies: first line of every `### !name` section (not the
        // SideBySide markers) must survive.
        const lines = g.input.split("\n");
        lines.forEach((line, i) => {
          if (!/^### !(?!left$|right$)\S/.test(line)) return;
          const body = lines.slice(i + 1).find((l) => l.trim() !== "");
          if (body && !/^#{1,3} /.test(body))
            expect(output).toContain(body.trim());
        });
        for (const m of g.input.matchAll(/^## !!steps (.+)$/gm)) {
          expect(output).toContain(
            `<Step title=${JSON.stringify(m[1]!.trim())}>`,
          );
        }
      });
    });
  }
});
