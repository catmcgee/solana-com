import { describe, expect, it } from "vitest";
import { mdxCodec } from "../src/convert/codec.ts";
import { findMathRisks } from "../src/convert/transforms/dollar-escape.ts";

const risks = (src: string) =>
  findMathRisks(mdxCodec.parse(src, { path: "x.mdx" }).tree, src);

describe("findMathRisks (verify: prose $ as KaTeX)", () => {
  it("flags two unescaped dollars in a paragraph", () => {
    expect(risks("Costs $5 or $50.\n")).toHaveLength(1);
  });
  it("flags a text dollar followed by a dollar in inline code", () => {
    expect(risks("Pay $5 then run `echo $HOME`.\n")).toHaveLength(1);
  });
  it("passes escaped, lone and code-only dollars", () => {
    expect(risks("Costs \\$5 or \\$50.\n")).toEqual([]);
    expect(risks("Only $5 here.\n")).toEqual([]);
    expect(risks("`$a` and `$b`\n")).toEqual([]);
    expect(risks("```sh\necho $A $B\n```\n")).toEqual([]);
    expect(risks('<Card title="$1 or $2">x</Card>\n')).toEqual([]);
  });
});
