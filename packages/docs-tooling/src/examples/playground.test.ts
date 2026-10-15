import { describe, expect, it } from "vitest";
import { buildExamples } from "./build-examples.ts";
import { detectProgramKind, playgroundSource } from "./playground.ts";
import { playgroundMarker, renderSnippet } from "./render.ts";
import { demoMarker } from "../generators/paths.ts";

describe("playground kinds (mirror of the playground's GitHub import)", () => {
  it("detects Native and Anchor programs like the playground does", () => {
    const native = "use solana_program::entrypoint;\nentrypoint!(process);";
    const anchor = "use anchor_lang::prelude::*;\n#[program]\npub mod x {}";
    expect(detectProgramKind([["src/lib.rs", native]])).toBe("native");
    expect(detectProgramKind([["programs/x/src/lib.rs", anchor]])).toBe(
      "anchor",
    );
    // Anchor is rejected when any Python file is present.
    expect(
      detectProgramKind([
        ["programs/x/src/lib.rs", anchor],
        ["x.py", "print()"],
      ]),
    ).toBeUndefined();
    // Detected, but convertToPlayground keeps nothing outside src/: fails.
    expect(detectProgramKind([["lib.rs", native]])).toBeUndefined();
  });

  it("leaves client code (TS, Rust binaries, Python) undetected", () => {
    expect(detectProgramKind([["kit.ts", "import x"]])).toBeUndefined();
    expect(
      detectProgramKind([["src/main.rs", "fn main() {}"]]),
    ).toBeUndefined();
    expect(detectProgramKind([["a.py", "import solders"]])).toBeUndefined();
  });

  it("opens TS files on their own and Rust files as their crate", () => {
    const base = "packages/docs-examples/cookbook/wallets/create-keypair";
    expect(playgroundSource(`${base}/kit.ts`)).toEqual({
      src: `${base}/kit.ts`,
      open: `${base}/kit.ts`,
      kind: "ts",
    });
    expect(playgroundSource(`${base}/rust/src/main.rs`)).toEqual({
      src: `${base}/rust/src/main.rs`,
      open: `${base}/rust`,
      kind: "rust",
    });
    expect(playgroundSource(`${base}/python.py`).kind).toBe("py");
  });
});

describe("playground markers in snippets", () => {
  const pg = {
    src: "packages/docs-examples/a/kit.ts",
    open: "packages/docs-examples/a/kit.ts",
    kind: "ts" as const,
  };
  it("renders a hidden marker with the source path", () => {
    expect(playgroundMarker(pg)).toBe(
      '<div className="sol-pg" data-pg-src="packages/docs-examples/a/kit.ts" data-pg-open="packages/docs-examples/a/kit.ts" data-pg-kind="ts" />',
    );
    expect(playgroundMarker(undefined)).toBe(
      '<div className="sol-pg" data-pg-kind="inline" />',
    );
  });

  it("puts one marker per tab, in tab order, before a CodeGroup", () => {
    const mdx = renderSnippet({
      id: "a/b",
      source: "s",
      block: { runnable: false, tabs: [] },
      tabs: [
        { title: "Kit", lang: "ts", code: "x", playground: pg },
        { title: "Inline", lang: "ts", code: "y" },
      ],
    });
    const head = mdx.slice(0, mdx.indexOf("<CodeGroup>"));
    expect(head.match(/className="sol-pg"/g)).toHaveLength(2);
    expect(head.indexOf('data-pg-kind="ts"')).toBeLessThan(
      head.indexOf('data-pg-kind="inline"'),
    );
  });

  it("puts the marker right before the fence inside each Tab", () => {
    const mdx = renderSnippet({
      id: "a/b",
      source: "s",
      block: { runnable: true, tabs: [] },
      tabs: [
        { title: "Kit", lang: "ts", code: "x", output: "o", playground: pg },
        { title: "Rust", lang: "rust", code: "y" },
      ],
    });
    expect(mdx).toContain(
      `<div className="sol-tab-label">Kit</div>\n${playgroundMarker(pg)}\n\n\`\`\`ts\nx`,
    );
  });

  it("gives every file-backed tab of every generated snippet a marker", () => {
    const r = buildExamples({ check: true });
    for (const [rel, text] of r.files) {
      if (!rel.endsWith(".mdx")) continue;
      const fences = text.match(/^`{3,}(?!text Output)\w+/gm) ?? [];
      const markers = text.match(/className="sol-pg"/g) ?? [];
      expect(markers.length, rel).toBe(fences.length);
    }
    for (const entry of Object.values(r.index))
      for (const t of entry.tabs)
        if (t.file) expect(t.playground?.open, t.file).toMatch(/^[\w\-/.]+$/);
  });

  it("marks each path demo terminal with its example folder", () => {
    const checkout = demoMarker([
      { label: "Pay", output: "paths/payments/checkout/pay.output.txt" },
      {
        label: "Verify",
        output: "paths/payments/checkout/verify-payment.output.txt",
      },
    ]);
    expect(checkout).toBe(
      '<div className="sol-pg" data-pg-src="packages/docs-examples/paths/payments/checkout/pay.ts" data-pg-open="packages/docs-examples/paths/payments/checkout" data-pg-kind="ts" />',
    );
    // A step without a source file next to its output: no source.
    expect(
      demoMarker([{ label: "x", output: "paths/nope/missing.output.txt" }]),
    ).toBe('<div className="sol-pg" data-pg-kind="inline" />');
  });
});
