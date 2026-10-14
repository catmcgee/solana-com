import { describe, expect, it } from "vitest";
import { mdxCodec } from "../convert/codec.ts";
import {
  blockDir,
  blockFromFences,
  componentName,
  includeFence,
} from "./blocks.ts";
import { buildExamples, outputCandidates } from "./build-examples.ts";
import {
  parseLegacyFenceMeta,
  rewriteWeb3jsSpecifier,
  sliceRegion,
} from "./include.ts";
import { scanExampleBlocks } from "./mdast.ts";
import { fenceFor, renderSnippet } from "./render.ts";

describe("include (port of @devrelkit/remark-include-code 0.1.2)", () => {
  const src = [
    "import x from 'y';",
    "  // #region a",
    "  const one = 1;",
    "    nested();",
    "  // #endregion a",
    "// #region b",
    "b();",
    "// #endregion",
    "// #region a",
    "// #region inner",
    "const two = 2;",
    "// #endregion whatever",
  ].join("\n");

  it("joins same-name regions, strips the start indent, drops nested markers", () => {
    expect(sliceRegion({ source: src, region: "a", lang: "ts" })).toBe(
      "const one = 1;\n  nested();\n\nconst two = 2;",
    );
  });

  it("uses # for Python and throws on a missing region", () => {
    expect(
      sliceRegion({
        source: "# #region r\nprint(1)\n# #endregion r\n",
        region: "r",
        lang: "py",
      }),
    ).toBe("print(1)");
    expect(() =>
      sliceRegion({ source: src, region: "nope", lang: "ts" }),
    ).toThrow(/not found/);
  });

  it("parses legacy fence meta", () => {
    expect(
      parseLegacyFenceMeta(
        '!! title="Legacy Helper" file=packages/docs-examples/a/b/legacy.ts#region=x highlight=24-30',
      ),
    ).toMatchObject({
      title: "Legacy Helper",
      file: "packages/docs-examples/a/b/legacy.ts",
      region: "x",
      highlight: "24-30",
    });
  });

  it("rewrites the web3.js aliases like remark-web3js-specifier", () => {
    expect(
      rewriteWeb3jsSpecifier(
        'from "@solana/web3.js-legacy"; "@solana/web3.js-v3/x"',
      ),
    ).toBe('from "@solana/web3.js"; "@solana/web3.js/x"');
    expect(rewriteWeb3jsSpecifier("@solana/web3.js-legacy-extra")).toBe(
      "@solana/web3.js-legacy-extra",
    );
  });
});

describe("block naming", () => {
  it("puts Rust crates beside their page directory", () => {
    expect(
      blockDir(["cookbook/a/b/kit.ts", "cookbook/a/b/rust/src/main.rs"]),
    ).toBe("cookbook/a/b");
    expect(blockDir(["cookbook/a/b/rust/src/bin/x.rs"])).toBe("cookbook/a/b");
  });

  it("derives ids and component names from the first include fence", () => {
    const f = includeFence({
      lang: "typescript",
      meta: '!! title="Kit" file=packages/docs-examples/cookbook/transactions/send-sol/kit.ts#region=transfer',
    })!;
    const ref = blockFromFences([f], { runnable: true });
    expect(ref.id).toBe("cookbook/transactions/send-sol/transfer");
    expect(ref.block.tabs[0]).toEqual({
      title: "Kit",
      lang: "ts",
      file: "kit.ts",
      region: "transfer",
    });
    expect(componentName(ref.id)).toBe("SendSolTransfer");
    expect(
      componentName("cookbook/transactions/durable-nonce/durable-nonce"),
    ).toBe("DurableNonce");
  });

  it("finds CodeTabs blocks, bare include fences and keeps inline tabs", () => {
    const { tree } = mdxCodec.parse(
      [
        '<CodeTabs flags="r" runner="cookbook/wallets/create-keypair">',
        "",
        '```ts !! title="Kit" file=packages/docs-examples/cookbook/wallets/create-keypair/kit.ts#region=create',
        "```",
        "",
        '```py !! title="Python"',
        "print(1)",
        "```",
        "",
        "</CodeTabs>",
        "",
        '```ts !! title="T" file=packages/docs-examples/cookbook/x/y/kit.ts#region=r',
        "```",
        "",
      ].join("\n"),
      { path: "x.mdx" },
    );
    const { blocks, problems } = scanExampleBlocks(tree);
    expect(problems).toEqual([]);
    expect(
      blocks.map((b) => [
        b.kind,
        b.ref.id,
        b.ref.block.runnable,
        b.ref.block.runner,
      ]),
    ).toEqual([
      [
        "codetabs",
        "cookbook/wallets/create-keypair/create",
        true,
        "generate-keypair",
      ],
      ["fence", "cookbook/x/y/r", false, undefined],
    ]);
    expect(blocks[0]!.ref.block.tabs[1]).toEqual({
      title: "Python",
      lang: "py",
      code: "print(1)",
    });
  });
});

describe("render", () => {
  const block = { runnable: true, tabs: [] };
  it("emits Tabs with a Run block only where output exists", () => {
    const mdx = renderSnippet({
      id: "cookbook/a/b/x",
      source: "packages/docs-examples/cookbook/a/b/blocks.json",
      block,
      tabs: [
        {
          title: "Kit",
          lang: "ts",
          code: "a()",
          output: "Signature: abc {x} <y>",
        },
        { title: "Rust", lang: "rust", code: "b()", highlight: "1" },
      ],
    });
    expect(mdx).toContain('<Tab title="Kit">');
    expect(mdx).toContain('<div className="sol-tab-label">Kit</div>');
    expect(mdx.match(/className="sol-run"/g)).toHaveLength(1);
    expect(mdx).toContain("```text Output\nSignature: abc {x} <y>\n```");
    expect(mdx).toContain("```rust highlight={1}\nb()\n```");
    // Never raw <details>/<noscript>: Mintlify drops them.
    expect(mdx).not.toMatch(/<details|<noscript/);
  });

  it("uses CodeGroup and no Run button without outputs, and long fences when needed", () => {
    const mdx = renderSnippet({
      id: "a/b/c",
      source: "s",
      block: { runnable: false, tabs: [] },
      tabs: [
        { title: "Kit", lang: "ts", code: "x", output: "ignored" },
        { title: "With space", lang: "ts", code: "```inner```" },
      ],
    });
    expect(mdx).toContain("<CodeGroup>");
    expect(mdx).not.toContain("sol-run");
    expect(mdx).toContain('````ts title="With space"');
    expect(fenceFor("a ```` b")).toBe("`````");
  });

  it("looks up outputs like remark-example-output", () => {
    expect(outputCandidates("rust/src/main.rs", "transfer")).toEqual([
      "rust/src/main.transfer.output.txt",
      "rust/src/main.output.txt",
    ]);
  });
});

describe("examples build", () => {
  const r = buildExamples({ check: true });
  it("builds every blocks.json without errors", () => {
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.index).length).toBeGreaterThanOrEqual(53);
  });
  it("embeds at least 88 recorded outputs (WP5 acceptance)", () => {
    expect(r.outputsEmbedded).toBeGreaterThanOrEqual(88);
  });
  it("committed snippets are up to date (examples:build --check)", () => {
    expect(r.stale).toEqual([]);
  });
});

describe("codetabs-examples repo checks", () => {
  const page = (python: string, region = "rpc-url") =>
    [
      "---",
      "title: t",
      "---",
      "",
      '<CodeTabs storage="cookbook">',
      "",
      `\`\`\`ts !! title="Kit" file=packages/docs-examples/cookbook/development/connect-environment/kit.ts#region=${region}`,
      "",
      "```",
      "",
      `\`\`\`ts !! title="Legacy" file=packages/docs-examples/cookbook/development/connect-environment/legacy.ts#region=${region}`,
      "",
      "```",
      "",
      `\`\`\`rust !! title="Rust" file=packages/docs-examples/cookbook/development/connect-environment/rust/src/main.rs#region=${region}`,
      "",
      "```",
      "",
      '```py !! title="Python"',
      python,
      "```",
      "",
      "</CodeTabs>",
      "",
    ].join("\n");
  const english = [
    "import asyncio",
    "from solana.rpc.async_api import AsyncClient",
    "",
    "async def main():",
    '    async with AsyncClient("http://localhost:8899") as client:',
    "        res = await client.is_connected()",
    "    print(res)  # True",
    "",
    "asyncio.run(main())",
  ].join("\n");
  async function run(source: string, locale = "en") {
    const { convertSource } = await import("../convert/run.ts");
    const { transform } =
      await import("../convert/transforms/codetabs-examples.ts");
    const registry = {
      list: (p?: (t: typeof transform) => boolean) =>
        [transform].filter((t) => !p || p(t)),
    };
    return convertSource(
      source,
      {
        path: `apps/docs/${locale === "en" ? "" : `${locale}/`}developers/cookbook/x.mdx`,
        locale,
        collection: "cookbook" as never,
      },
      registry as never,
    ).diagnostics.map((d) => `${d.level}: ${d.message}`);
  }

  it("is silent when the page matches blocks.json", async () => {
    expect(await run(page(english))).toEqual([]);
  });

  it("warns when a locale's inline tab differs from the shared snippet", async () => {
    const d = await run(page(english.replace("# True", "# Vrai")), "fr");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/^warn: inline "Python" tab .* \(fr copy/);
  });

  it("errors when the snippet or blocks.json entry is missing", async () => {
    const d = await run(page(english, "nope"));
    expect(
      d.some((x) => /^error: example snippet .*does not exist/.test(x)),
    ).toBe(true);
    expect(d.some((x) => /^error: block "nope" is missing/.test(x))).toBe(true);
  });
});
