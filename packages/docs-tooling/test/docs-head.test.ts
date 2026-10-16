import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCS_HEAD_CSS_OUT,
  DOCS_HEAD_SOURCES,
  DOCS_HEAD_VERSION_OUT,
  buildDocsHead,
  runDocsHead,
  stripCss,
} from "../src/generators/docs-head.ts";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "docs-head-"));
  const docs = path.join(root, "apps/docs");
  mkdirSync(path.join(docs, "styles"), { recursive: true });
  for (const rel of DOCS_HEAD_SOURCES)
    writeFileSync(
      path.join(docs, rel),
      `/* ${rel} */\n#navbar {\n  color: red; /* inline */\n}\n\n`,
    );
  return { root, docs };
}

describe("gen:docs-head", () => {
  it("strips comments and blank lines only", () => {
    expect(stripCss("/* a */\na {\n  b: c; /* d */\n}\n\n")).toBe(
      "a {\n  b: c;\n}",
    );
    expect(() => stripCss('a { content: "/*"; }')).toThrow();
  });

  it("keeps Mintlify's inline order: nojs, theme, assistant", () => {
    expect(DOCS_HEAD_SOURCES).toEqual([
      "styles/nojs.css",
      "styles/theme.css",
      "styles/assistant.css",
    ]);
  });

  it("writes the CSS and its hash, and --check catches drift", () => {
    const { root, docs } = fixture();
    const first = runDocsHead({ docsRoot: docs, outRoot: root });
    expect(first.written).toEqual([DOCS_HEAD_CSS_OUT, DOCS_HEAD_VERSION_OUT]);
    expect(runDocsHead({ docsRoot: docs, outRoot: root, check: true }).ok).toBe(
      true,
    );
    const { version } = buildDocsHead(docs);
    expect(
      readFileSync(path.join(root, DOCS_HEAD_VERSION_OUT), "utf8"),
    ).toContain(`"${version}"`);
    writeFileSync(path.join(docs, "styles/theme.css"), "a { b: c; }\n");
    const stale = runDocsHead({ docsRoot: docs, outRoot: root, check: true });
    expect(stale.ok).toBe(false);
    expect(stale.written).toEqual([DOCS_HEAD_CSS_OUT, DOCS_HEAD_VERSION_OUT]);
  });

  it("is up to date in the repo", () => {
    expect(runDocsHead({ check: true }).ok).toBe(true);
  });
});
