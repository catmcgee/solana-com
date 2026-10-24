import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../../packages/i18n/messages/web/en/common.json";

// DocsLink prefetches through the app router, which tests don't mount.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));
// Shiki itself is not under test: a stand-in marks highlighted blocks.
vi.mock("fumadocs-core/highlight/client", () => ({
  useShiki: (code: string, options: { lang: string }) => (
    <pre className="shiki" data-lang={options.lang}>
      {code}
    </pre>
  ),
}));

const { AskMarkdown, isShellBlock, parseShellLines } =
  await import("@/components/docs/ask/ask-markdown.client");

function withIntl(element: ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {element}
    </NextIntlClientProvider>
  );
}

const writeText = vi.fn(async () => {});

beforeEach(() => {
  document.documentElement.lang = "en";
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  writeText.mockClear();
});

describe("shell blocks", () => {
  it("splits commands (prompt removed), comments and output", () => {
    expect(
      parseShellLines(
        "# Make a mint\n$ spl-token create-token\nCreating token Abc\n\nsolana balance",
      ),
    ).toEqual([
      { kind: "comment", text: "Make a mint" },
      { kind: "command", text: "spl-token create-token" },
      { kind: "output", text: "Creating token Abc" },
      { kind: "command", text: "solana balance" },
    ]);
  });

  it("are shell by language, by prompts, or when every line is a command", () => {
    expect(isShellBlock("spl-token accounts", "bash")).toBe(true);
    expect(isShellBlock("$ cargo build-sbf\nFinished", null)).toBe(true);
    expect(isShellBlock("npm install @solana/kit", null)).toBe(true);
    expect(isShellBlock("const x = 1;", "ts")).toBe(false);
    expect(isShellBlock("echo hi", "bash")).toBe(false);
  });
});

describe("AskMarkdown", () => {
  it("styles every element explicitly and keeps headings under the panel title", () => {
    const { container } = render(
      withIntl(
        <AskMarkdown
          text={
            "## Overview\n\nA **mint** holds `decimals`.\n\n- one\n- two\n\n> note\n\n| A | B |\n| - | - |\n| 1 | 2 |"
          }
          streaming
        />,
      ),
    );
    const heading = screen.getByRole("heading", { name: "Overview" });
    expect(heading.tagName).toBe("H3");
    expect(heading.className).toContain("text-[15px]");
    expect(container.querySelector("strong")!.className).toContain(
      "font-semibold",
    );
    expect(container.querySelector("code")!.className).toContain(
      "rounded-[5px]",
    );
    expect(container.querySelector("ul")!.className).toContain("list-disc");
    expect(container.querySelector("blockquote")!.className).toContain(
      "border-s-2",
    );
    // GFM tables work (remark-gfm through fumadocs-core).
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A" }).className).toContain(
      "text-[12.5px]",
    );
  });

  it("opens docs links in place (old /docs paths too) and other sites in a new tab", () => {
    render(
      withIntl(
        <AskMarkdown
          text={
            "[PDAs](/docs/core/pda), [fees](https://solana.com/developers/docs/core/fees) and [Anza](https://anza.xyz)."
          }
        />,
      ),
    );
    const pda = screen.getByRole("link", { name: "PDAs" });
    expect(pda).toHaveAttribute("href", "/developers/docs/core/pda");
    expect(pda).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "fees" })).toHaveAttribute(
      "href",
      "/developers/docs/core/fees",
    );
    const anza = screen.getByRole("link", { name: "Anza" });
    expect(anza).toHaveAttribute("target", "_blank");
    expect(anza).toHaveAttribute("rel", "noreferrer");
  });

  it("links docs in the reader's locale", () => {
    document.documentElement.lang = "ja";
    render(withIntl(<AskMarkdown text="[Accounts](/docs/core/accounts)" />));
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/ja/developers/docs/core/accounts",
    );
  });

  it("highlights code only once the answer is complete", () => {
    const text = "```ts\nconst x = 1;\n```";
    const { container, rerender } = render(
      withIntl(<AskMarkdown text={text} streaming />),
    );
    expect(container.querySelector(".shiki")).toBeNull();
    expect(screen.getByText("ts")).toBeInTheDocument();
    rerender(withIntl(<AskMarkdown text={text} />));
    expect(container.querySelector(".shiki")).toHaveAttribute(
      "data-lang",
      "ts",
    );
  });

  it("renders shell commands as rows; copying never includes the prompt", async () => {
    const { container } = render(
      withIntl(
        <AskMarkdown
          text={
            "```bash\n$ spl-token create-token\nCreating token Abc\n$ spl-token create-account Abc\n```"
          }
        />,
      ),
    );
    const rows = within(container.querySelector("ul")!).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toBe("$spl-token create-token");
    expect(rows[0]!.querySelector('[aria-hidden="true"]')!.textContent).toBe(
      "$",
    );
    const perRow = screen.getAllByRole("button", { name: "Copy command" });
    expect(perRow).toHaveLength(2);
    await act(async () => fireEvent.click(perRow[1]!));
    expect(writeText).toHaveBeenLastCalledWith("spl-token create-account Abc");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy code" })),
    );
    expect(writeText).toHaveBeenLastCalledWith(
      "spl-token create-token\nspl-token create-account Abc",
    );
  });

  it("keeps a single command to the block's one copy button", () => {
    render(withIntl(<AskMarkdown text={"```sh\nsolana --version\n```"} />));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Copy code" })).toBeVisible();
  });
});
