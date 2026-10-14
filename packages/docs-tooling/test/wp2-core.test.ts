/**
 * Unit tests for the WP2 core transforms beyond the fixture goldens:
 * fence meta/annotation semantics, error paths and cross-transform
 * idempotency (all WP2 transforms together, in registry order).
 */
import { describe, expect, it } from "vitest";
import { TransformRegistry } from "../src/convert/registry.ts";
import { convertSource } from "../src/convert/run.ts";
import {
  formatLines,
  formatMeta,
  parseLines,
  parseMeta,
  resolveAnnotations,
  convertTerminal,
  transform as fences,
} from "../src/convert/transforms/fences.ts";
import { transform as themedImage } from "../src/convert/transforms/themed-image.ts";
import { transform as frontmatter } from "../src/convert/transforms/frontmatter.ts";
import { transform as callout } from "../src/convert/transforms/callout.ts";
import { transform as cards } from "../src/convert/transforms/cards.ts";
import { transform as tabs } from "../src/convert/transforms/tabs.ts";
import { transform as steps } from "../src/convert/transforms/steps.ts";
import { transform as accordion } from "../src/convert/transforms/accordion.ts";
import { transform as embed } from "../src/convert/transforms/embed.ts";
import { transform as html } from "../src/convert/transforms/html.ts";
import { transform as images } from "../src/convert/transforms/images.ts";
import { transform as inlineCode } from "../src/convert/transforms/inline-code.ts";
import { transform as web3js } from "../src/convert/transforms/web3js-specifier.ts";
import {
  parseJsString,
  parseStringArray,
} from "../src/convert/transforms/_wp2.ts";
import type { Transform } from "../src/types.ts";

const FILE = {
  path: "apps/docs/docs/x/page.mdx",
  locale: "en",
  collection: "docs" as const,
};

function run(src: string, ...ts: Transform[]) {
  const r = new TransformRegistry();
  for (const t of ts) r.register(t);
  return convertSource(src, FILE, r);
}

const WP2 = [
  frontmatter,
  inlineCode,
  callout,
  cards,
  tabs,
  steps,
  accordion,
  embed,
  html,
  themedImage,
  images,
  fences,
  web3js,
];

describe("fence meta", () => {
  it("parses Code Hike meta into Mintlify meta", () => {
    expect(formatMeta(parseMeta('!! title="Kit"'))).toBe("Kit");
    expect(formatMeta(parseMeta('title="My file.ts" -w'))).toBe(
      'title="My file.ts" wrap',
    );
    expect(formatMeta(parseMeta('title="lib.rs" {13-16} /Game/'))).toBe(
      "lib.rs",
    );
    expect(formatMeta(parseMeta("filename=agent.ts"))).toBe("agent.ts");
    expect(formatMeta(parseMeta('name="Client"'))).toBe("Client");
    expect(formatMeta(parseMeta("highlight=15-19"))).toBe("highlight={15-19}");
    expect(
      formatMeta(parseMeta('!! title="Kit" file=packages/a.ts#region=x')),
    ).toBe("Kit file=packages/a.ts#region=x");
  });

  it("is a fixed point on its own output", () => {
    for (const m of [
      'title="A B" highlight={1-3,5} focus={2} wrap expandable',
      "Kit highlight={4}",
      "wrap",
      'title="say \\"hi\\""',
    ]) {
      expect(formatMeta(parseMeta(formatMeta(parseMeta(m))))).toBe(
        formatMeta(parseMeta(m)),
      );
    }
  });

  it("formats line sets", () => {
    expect(formatLines([5, 1, 2, 3, 9, 10])).toBe("1-3,5,9-10");
    expect(parseLines("{1-3,5}")).toEqual([1, 2, 3, 5]);
  });
});

describe("annotations", () => {
  it("resolves ranges relative to the next code line, after removal", () => {
    const r = resolveAnnotations(
      ["a", "// !mark(1:2)", "b", "c", "d", "// !focus", "e"].join("\n"),
      "ts",
    );
    expect(r.value).toBe("a\nb\nc\nd\ne");
    expect(r.highlight).toEqual([2, 3]);
    expect(r.focus).toEqual([5]);
  });

  it("maps regex marks to their line and collapse to expandable", () => {
    const r = resolveAnnotations(
      ["# !collapse(1:1000) collapsed", "x = 1", "# !mark[/y/]", "y = 2"].join(
        "\n",
      ),
      "py",
    );
    expect(r.value).toBe("x = 1\ny = 2");
    expect(r.highlight).toEqual([2]);
    expect(r.expandable).toBe(true);
  });

  it("writes diffs in the language's comment syntax", () => {
    const r = resolveAnnotations(
      "// !diff -\nold();\n// !diff +\nnew();",
      "rs",
    );
    expect(r.value).toBe("old(); // [!code --]\nnew(); // [!code ++]");
    expect(resolveAnnotations("# !diff +\nx", "py").value).toBe(
      "x # [!code ++]",
    );
  });

  it("strips hover/tooltip/mention and trailing annotations", () => {
    const r = resolveAnnotations(
      "let a = 1; // !mark\n// !hover foo\n// !tooltip[/x/] note\nlet b = 2;",
      "rs",
    );
    expect(r.value).toBe("let a = 1;\nlet b = 2;");
    expect(r.highlight).toEqual([1]);
  });

  it("keeps Rust inner attributes and shebangs", () => {
    const src = "#![no_std]\n#!/bin/bash\n// !important is prose";
    const r = resolveAnnotations(src, "rs");
    expect(r.value).toBe("#![no_std]\n#!/bin/bash\n// !important is prose");
    expect(r.unknown).toEqual(["// !important is prose"]);
  });

  it("reports unknown annotations as errors", () => {
    const { diagnostics } = run("```ts\n// !weird\nx\n```\n", fences);
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });
});

describe("terminal fences", () => {
  const t = (value: string, inTabs = false) =>
    convertTerminal(
      { type: "code", lang: "terminal", meta: null, value },
      inTabs,
    ).map((c) => `${c.lang} ${c.meta ?? ""}|${c.value}`);

  it("splits commands and output", () => {
    expect(t("$ solana --version\nsolana-cli 2.0")).toEqual([
      "bash Terminal|solana --version",
      "text Output|solana-cli 2.0",
    ]);
  });
  it("keeps continuation lines with their command", () => {
    expect(t("$ a \\\n  --flag")).toEqual(["bash Terminal|a \\\n  --flag"]);
  });
  it("uses one console fence for interleaved output or inside tabs", () => {
    expect(t("$ a\nout\n$ b\nout")).toEqual([
      "console Terminal|$ a\nout\n$ b\nout",
    ]);
    expect(t("$ a\nout", true)).toEqual(["console Terminal|$ a\nout"]);
  });
});

describe("fences: container and no-JS behaviour", () => {
  it("leaves fences in unconverted Code Hike containers untouched", () => {
    const src =
      "<APIMethod>\n\n```jsonc !!request curl\n// !hover x\n{}\n```\n\n</APIMethod>\n";
    const { output, diagnostics } = run(src, fences);
    expect(output).toBe(src);
    expect(diagnostics.map((d) => d.level)).toEqual(["warn"]);
  });

  it("adds a no-JS source fallback to mermaid once", () => {
    const src = '```mermaid title="Flow"\ngraph LR\n  A --> B\n```\n';
    const once = run(src, fences).output;
    expect(once).toContain('<div className="sol-caption">');
    expect(once).toContain('<div className="nojs-only">');
    expect(once).toContain("```text Flow\n  graph LR");
    expect(run(once, fences).output).toBe(once);
  });
});

describe("themed-image", () => {
  it("errors (file left unchanged) when the light variant is missing", () => {
    const src = "![x](/assets/docs/core/does-not-exist.svg)\n";
    const { output, diagnostics } = run(src, themedImage);
    expect(output).toBe(src);
    expect(diagnostics.filter((d) => d.level === "error").length).toBe(2);
  });
});

describe("frontmatter", () => {
  it("warns on unknown page types and keeps them", () => {
    const { output, diagnostics } = run(
      "---\ntitle: X\ntype: weird\n---\n",
      frontmatter,
    );
    expect(output).toContain("type: weird");
    expect(diagnostics[0]?.message).toMatch(/not a known page type/);
  });
  it("drops h1 equal to title without adding sidebarTitle", () => {
    const { output } = run(
      "---\ntitle: Quick Start\nh1: Quick Start\n---\n",
      frontmatter,
    );
    expect(output).toBe("---\ntitle: Quick Start\n---\n");
  });
});

describe("inline-code edge shapes", () => {
  const cases: Array<[string, string]> = [
    [
      "CPIは*rs`invoke`*と*rs`invoke_signed`*の動作",
      "CPIは`invoke`と`invoke_signed`の動作",
    ],
    [
      "- *rs`Approve`*および*rs`ApproveChecked`*",
      "- `Approve`および`ApproveChecked`",
    ],
    ["و\\_rs`A::B`_ و_rs`InitializeMint`_ في", "و`A::B` و`InitializeMint` في"],
    ["alusta \\_rs`ScaledUiAmount`_ ja", "alusta `ScaledUiAmount` ja"],
    [
      "plain _rs`x`_ and *y* and snake_ts`z`_ and `_rs`",
      "plain `x` and *y* and snake_ts`z`_ and `_rs`",
    ],
  ];
  for (const [input, expected] of cases) {
    it(input, () => {
      const out = run(input + "\n", inlineCode).output;
      expect(out).toBe(expected + "\n");
      expect(run(out, inlineCode).output).toBe(out);
    });
  }
});

describe("helpers", () => {
  it("parses JS string literals and arrays", () => {
    expect(parseJsString('"a\\"b"')).toBe('a"b');
    expect(parseJsString("'x'")).toBe("x");
    expect(parseJsString("`a${b}`")).toBeUndefined();
    expect(parseStringArray(`['pnpm', "npm", \`yarn\`]`)).toEqual([
      "pnpm",
      "npm",
      "yarn",
    ]);
    expect(parseStringArray("[a, b]")).toBeUndefined();
  });
});

describe("all WP2 transforms together", () => {
  const page = [
    "---",
    "title: Install",
    "h1: Install the CLI",
    "hideTableOfContents: true",
    "---",
    "",
    '<Callout type="warn" title="Heads up">Use _rs`cargo`_ 1.80+</Callout>',
    "",
    "<Steps>",
    "<Step>",
    "### Download",
    "",
    "```terminal",
    "$ curl -sSf https://example.com | sh",
    "```",
    "",
    "</Step>",
    "</Steps>",
    "",
    '<Tabs items={["Kit", "web3.js"]}>',
    '<Tab value="Kit">',
    "",
    '```ts !! title="kit.ts"',
    "// !mark",
    'import { createClient } from "@solana/kit";',
    "```",
    "",
    "</Tab>",
    '<Tab value="web3.js">',
    "",
    "```ts",
    'import { Connection } from "@solana/web3.js-legacy";',
    "```",
    "",
    "</Tab>",
    "</Tabs>",
    "",
    "<Cards>",
    '  <Card title="Next" href="/docs/next" description="Go on" />',
    "</Cards>",
    "",
    '<Embed url="https://youtu.be/Bqs95tFcRIU" />',
    "",
    "![Accounts](/assets/docs/core/accounts/accounts.png)",
    "",
  ].join("\n");

  it("converts a mixed page and is idempotent", () => {
    const { output, diagnostics } = run(page, ...WP2);
    expect(diagnostics.filter((d) => d.level === "error")).toEqual([]);
    expect(output).toContain("title: Install the CLI");
    expect(output).toContain("sidebarTitle: Install");
    expect(output).toContain("mode: wide");
    expect(output).toContain("<Warning>");
    expect(output).toContain("Use `cargo` 1.80+");
    expect(output).toContain('<Step title="Download">');
    expect(output).toContain("```bash Terminal");
    expect(output).toContain('<Tab title="Kit">');
    expect(output).toContain("```ts kit.ts highlight={1}");
    expect(output).toContain('from "@solana/web3.js"');
    expect(output).toContain("<Columns cols={2}>");
    expect(output).toContain("youtube-nocookie.com/embed/Bqs95tFcRIU");
    expect(output).toContain('<Frame caption="Accounts">');
    expect(output).toContain(
      "/docs-assets/assets/docs/core/accounts/accounts.png",
    );
    expect(output).not.toMatch(
      /<Callout|<Cards|<Embed|items=|value=|!!|\/\/ !mark|\$ curl/,
    );
    expect(run(output, ...WP2).output).toBe(output);
  });
});
