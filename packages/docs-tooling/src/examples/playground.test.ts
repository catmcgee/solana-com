import { describe, expect, it } from "vitest";
import { buildExamples } from "./build-examples.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectProgramKind,
  folderKind,
  playgroundSource,
  tutorialFolder,
} from "./playground.ts";
import { playgroundMarker, renderSnippet } from "./render.ts";
import {
  demoMarker,
  PATH_UI,
  renderPlaygroundBlock,
  renderStepper,
  tutorialButton,
  tutorialDir,
  tutorialSource,
  type PathDef,
} from "../generators/paths.ts";

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

  it("opens a job tutorial file as the whole tutorial folder", () => {
    const dir = "packages/docs-examples/paths/assets/issue-asset";
    expect(tutorialFolder(`${dir}/create-asset.ts`)).toBe(dir);
    expect(tutorialFolder(`${dir}/sub/x.ts`)).toBe(dir);
    // Not inside a tutorial folder.
    expect(tutorialFolder("packages/docs-examples/paths/x.ts")).toBeUndefined();
    expect(
      tutorialFolder("packages/docs-examples/cookbook/wallets/a/kit.ts"),
    ).toBeUndefined();
    expect(playgroundSource(`${dir}/create-asset.ts`)).toEqual({
      src: `${dir}/create-asset.ts`,
      open: dir,
      kind: "ts",
    });
    // A Python file in a mostly-TypeScript tutorial gets the folder's kind,
    // so every block of a tutorial switches on together.
    const checkout = "packages/docs-examples/paths/payments/checkout";
    expect(playgroundSource(`${checkout}/verify_payment.py`)).toEqual({
      src: `${checkout}/verify_payment.py`,
      open: checkout,
      kind: "ts",
    });
  });
});

describe("folder kinds", () => {
  let root: string;
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  it("uses the framework, else the most common language", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "pg-kind-"));
    try {
      write("a/x.ts", "");
      write("a/y.ts", "");
      write("a/z.py", "");
      write("a/package.json", "{}");
      expect(folderKind(path.join(root, "a"))).toBe("ts");
      write("b/z.py", "");
      write("b/y.ts", "");
      // Tie: ts wins over py.
      expect(folderKind(path.join(root, "b"))).toBe("ts");
      write("c/src/lib.rs", "entrypoint!(p);");
      write("c/client/a.ts", "");
      write("c/client/b.ts", "");
      expect(folderKind(path.join(root, "c"))).toBe("native");
      write("d/README.md", "");
      expect(folderKind(path.join(root, "d"))).toBe("other");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Open tutorial in Playground (gen:paths)", () => {
  const def = (key: string, tab: string, demo?: string[]): PathDef => ({
    key,
    tab,
    label: key,
    job: "Job",
    name: "Name",
    time: "~1 min",
    intro: `/docs/${tab}/${key}`,
    steps: [{ href: `/docs/${tab}/${key}/a`, title: "A" }],
    demo: demo && {
      component: "asset",
      title: "T",
      steps: demo.map((output) => ({ label: "x", output })),
    },
  });
  let root: string;
  const touch = (rel: string) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), "");
  };

  it("finds the folder from the demo outputs, else paths/<domain>/<key>", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "pg-tut-"));
    try {
      touch("paths/assets/issue-asset/create-asset.ts");
      touch("paths/defi/settle-trade/price.ts");
      touch("paths/defi/settle-trade/dvp/index.ts");
      touch("paths/defi/settle-trade/blocks.json");
      // Demo outputs decide.
      expect(
        tutorialDir(
          def("issue-asset", "assets", [
            "paths/assets/issue-asset/a.output.txt",
          ]),
          root,
        ),
      ).toBe("paths/assets/issue-asset");
      // A tutorial whose tab is not its folder's domain (settle-trade:
      // tab "markets", folder paths/defi/), with or without a demo.
      expect(tutorialDir(def("settle-trade", "markets"), root)).toBe(
        "paths/defi/settle-trade",
      );
      expect(tutorialSource(def("settle-trade", "markets"), root)).toEqual({
        open: "packages/docs-examples/paths/defi/settle-trade",
        kind: "ts",
      });
      // No folder: no source.
      expect(tutorialSource(def("nope", "markets"), root)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds the real tutorial folders", () => {
    expect(tutorialSource(def("checkout", "payments"))).toEqual({
      open: "packages/docs-examples/paths/payments/checkout",
      kind: "ts",
    });
    expect(tutorialSource(def("issue-asset", "assets"))?.open).toBe(
      "packages/docs-examples/paths/assets/issue-asset",
    );
  });

  it("renders the button disabled, without an href", () => {
    const pg = {
      open: "packages/docs-examples/paths/a/b",
      kind: "ts" as const,
    };
    const btn = tutorialButton(PATH_UI, pg);
    expect(btn).toBe(
      '<a className="sol-pg-btn sol-pg-tut" data-variant="compact" data-pg-open="packages/docs-examples/paths/a/b" data-pg-kind="ts" data-pg-label="Open tutorial in Playground" data-pg-off="Open tutorial in Playground: not available for this tutorial yet" data-tip="Open tutorial in Playground: not available for this tutorial yet" aria-label="Open tutorial in Playground: not available for this tutorial yet" aria-disabled="true" role="link" tabIndex="0"><span className="sol-pg-label">Open tutorial in Playground</span></a>',
    );
    expect(btn).not.toContain("href");
    // No folder: no source attributes, still disabled.
    const none = tutorialButton(PATH_UI, undefined, "block");
    expect(none).toContain('data-pg-kind="inline"');
    expect(none).not.toContain("data-pg-open");
    expect(none).toContain('aria-disabled="true"');
  });

  it("puts it in every stepper's header and in playground.mdx", () => {
    const src = { lang: "en", ui: PATH_UI, paths: [] };
    const p = def("checkout", "payments");
    const pg = tutorialSource(p);
    for (const n of [0, 1]) {
      const s = renderStepper("/nonexistent", src, p, n, pg);
      expect(s).toContain(
        `<div className="sol-stepper-head">${tutorialButton(PATH_UI, pg)}</div>`,
      );
      // The button is outside the step navigation landmark.
      expect(s.indexOf("sol-pg-tut")).toBeLessThan(
        s.indexOf('role="navigation"'),
      );
    }
    const block = renderPlaygroundBlock(src, p, pg);
    expect(block).toContain('<div className="sol-pg-tutorial not-prose"');
    expect(block).toContain(tutorialButton(PATH_UI, pg, "block"));
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
