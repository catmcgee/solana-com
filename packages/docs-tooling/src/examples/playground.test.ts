import { describe, expect, it } from "vitest";
import { buildExamples } from "./build-examples.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectProgramKind, folderKind } from "./playground.ts";
import {
  buildPathOutputs,
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
    intro: `/developers/docs/${tab}/${key}`,
    steps: [{ href: `/developers/docs/${tab}/${key}/a`, title: "A" }],
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
      '<a className="sol-pg-tut" data-pg-open="packages/docs-examples/paths/a/b" data-pg-kind="ts" data-pg-label="Open tutorial in Playground" data-pg-off="Open tutorial in Playground: not available for this tutorial yet" data-tip="Open tutorial in Playground: not available for this tutorial yet" aria-label="Open tutorial in Playground: not available for this tutorial yet" aria-disabled="true" role="link" tabIndex="0">Open tutorial in Playground</a>',
    );
    expect(btn).not.toContain("href");
    // No folder: no source attributes, still disabled.
    const none = tutorialButton(PATH_UI, undefined);
    expect(none).toContain('data-pg-kind="inline"');
    expect(none).not.toContain("data-pg-open");
    expect(none).toContain('aria-disabled="true"');
  });

  it("renders it only in playground.mdx, never in a stepper", () => {
    const src = { lang: "en", ui: PATH_UI, paths: [] };
    const p = def("checkout", "payments");
    const pg = tutorialSource(p);
    for (const n of [0, 1])
      expect(renderStepper("/nonexistent", src, p, n)).not.toContain("sol-pg");
    const block = renderPlaygroundBlock(src, p, pg);
    expect(block).toContain('<div className="sol-pg-tutorial not-prose"');
    expect(block).toContain(tutorialButton(PATH_UI, pg));
    expect(block).toContain(PATH_UI.playgroundNote);
  });
});

describe("no Playground control outside the tutorial block", () => {
  it("generated example snippets carry no markers", () => {
    const r = buildExamples({ check: true });
    for (const [rel, text] of r.files)
      expect(text, rel).not.toMatch(/sol-pg|data-pg-/);
  });

  it("only playground.mdx of each path has Playground markup", () => {
    const src = { lang: "en", ui: PATH_UI, paths: [] as PathDef[] };
    const p: PathDef = {
      key: "checkout",
      tab: "payments",
      label: "c",
      job: "j",
      name: "n",
      time: "t",
      intro: "/developers/docs/payments/checkout",
      steps: [{ href: "/developers/docs/payments/checkout/a", title: "A" }],
      demo: {
        component: "checkout",
        title: "T",
        steps: [
          { label: "Pay", output: "paths/payments/checkout/pay.output.txt" },
        ],
      },
    };
    src.paths.push(p);
    const files = buildPathOutputs("/nonexistent", [src], []);
    const withPg = [...files]
      .filter(([, text]) => /sol-pg|data-pg-/.test(text))
      .map(([f]) => path.basename(f));
    expect(withPg).toEqual(["playground.mdx"]);
  });
});
