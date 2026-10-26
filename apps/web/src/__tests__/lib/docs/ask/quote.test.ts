import { describe, expect, it } from "vitest";
import { quotedQuestion, quotedQuestionWithin } from "@/lib/docs/ask/quote";

describe("quotedQuestionWithin", () => {
  const words = (n: number) =>
    Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("is the quoted question when it fits", () => {
    const quote = { text: "Rent is a deposit." };
    expect(quotedQuestionWithin(quote, "Why?", 100)).toBe(
      quotedQuestion(quote, "Why?"),
    );
  });

  it("cuts the quote at a word, so the question always fits", () => {
    const text = `${words(40)}\n${words(40)}`;
    const cut = quotedQuestionWithin({ text }, "Why does it expire?", 200);
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut).toMatch(/^> word0 word1 .+ word\d+…\n\nWhy does it expire\?$/s);
    // Every quoted line keeps its marker.
    const lines = cut.split("\n\n")[0]!.split("\n");
    expect(lines.every((line) => line.startsWith("> "))).toBe(true);
  });

  it("keeps code fenced, with its language", () => {
    const cut = quotedQuestionWithin(
      {
        text: `let x = 1;\n${"y();\n".repeat(60)}`,
        code: true,
        language: "rust",
      },
      "What does it do?",
      120,
    );
    expect(cut.length).toBeLessThanOrEqual(120);
    expect(cut).toMatch(
      /^```rust\nlet x = 1;\n(y\(\);\n)+y\(\);…\n```\n\nWhat does it do\?$/,
    );
  });

  it("is the question alone when the quote can't keep enough", () => {
    const question = "x".repeat(180);
    expect(quotedQuestionWithin({ text: words(50) }, question, 200)).toBe(
      question,
    );
  });
});
