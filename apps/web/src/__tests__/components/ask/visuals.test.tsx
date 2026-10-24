import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../../packages/i18n/messages/web/en/common.json";
import { AskVisual } from "@/components/docs/ask/visuals/ask-visual.client";
import {
  commonVisualGenerativeUiFixtures,
  tokenLifecycleGenerativeUiFixture,
} from "@/lib/docs/ask/fixtures/common-visual";
import { createTokenGenerativeUiFixture } from "@/lib/docs/ask/fixtures/create-token";
import type {
  AskGenerativeUi,
  AskGenerativeUiComponent,
} from "@/lib/docs/ask/generative-ui/types";

// DocsLink prefetches through the app router, which tests don't mount.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function ui(...components: AskGenerativeUiComponent[]): AskGenerativeUi {
  return { version: "solana-docs-ui/v1", kind: "answer", components };
}

function withIntl(element: ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {element}
    </NextIntlClientProvider>
  );
}

function markup(visual: AskGenerativeUi, props = {}) {
  return renderToStaticMarkup(withIntl(<AskVisual ui={visual} {...props} />));
}

function renderVisual(visual: AskGenerativeUi) {
  return render(withIntl(<AskVisual ui={visual} />));
}

const allFixtures = [
  ...commonVisualGenerativeUiFixtures,
  { name: "create token", ui: createTokenGenerativeUiFixture },
];

describe("AskVisual markup", () => {
  it.each(allFixtures.map((f) => [f.name, f.ui] as const))(
    "%s: one merged diagram with the model and the steps",
    (_name, fixture) => {
      const html = markup(fixture);
      expect(html).toContain('data-ask-visual=""');
      expect(html).toContain("@container");
      expect(html.match(/<section/g)).toHaveLength(1);
      expect(html).toContain(">Diagram<");
      expect(html).toContain("data-archetype=");
      for (const component of fixture.components) {
        if (component.type !== "step_flow") continue;
        for (const step of component.steps as Array<{ title: string }>) {
          expect(html).toContain(step.title);
        }
      }
      // No simulated execution, mascot or decoration.
      expect(html).not.toMatch(/Execute|Replay|Vector|gradient|glow|shimmer/i);
    },
  );

  it("renders setup as a checklist and the cleanup step as an extra", () => {
    const html = markup(tokenLifecycleGenerativeUiFixture);
    expect(html).toContain("Before you start");
    expect(html).toContain("Select devnet");
    expect(html).toContain("Fund wallet");
    expect(html).toContain("Lifecycle flow");
    expect(html).toContain("Create the mint");
    expect(html).toContain("Create the token account");
    expect(html).toContain("Mint supply");
    expect(html).toContain("More you can do (1)");
    expect(html).toContain("Close the empty account");
    expect(html).toContain('data-archetype="mint-account"');
    expect(html).toContain('data-archetype="token-account"');
  });

  it("renders every archetype from concept_model nodes", () => {
    const labels = [
      ["wallet", "User wallet"],
      ["signer", "Mint authority"],
      ["mint-account", "Mint account"],
      ["token-account", "Token account"],
      ["pda", "Escrow PDA"],
      ["program", "Token Program"],
      ["instruction", "InitializeMint"],
      ["transaction", "Create token transaction"],
      ["rpc-node", "RPC node"],
      ["validator", "Validator"],
    ] as const;
    const html = markup(
      ui({
        type: "concept_model",
        title: "Network model",
        nodes: labels.map(([archetype, label]) => ({
          id: archetype,
          archetype,
          label,
          fields: [{ label: "role", value: label }],
        })),
        relationships: [{ from: "wallet", to: "transaction", kind: "signs" }],
      }),
    );
    for (const [archetype, label] of labels) {
      expect(html).toContain(label);
      expect(html).toContain(`data-archetype="${archetype}"`);
    }
    expect(html).toContain("How they connect");
    expect(html).toContain(">signs<");
    expect(html).toContain("Network model");
  });

  it("ignores the retired heavyweight components", () => {
    const html = markup(
      ui(
        {
          type: "answer_intro",
          title: "Visible answer",
          body: "The compact renderer keeps this content.",
        },
        {
          type: "code_tabs",
          title: "Hidden code tabs",
          tabs: [{ label: "Hidden tab", code: "const hidden = true;" }],
        },
        {
          type: "cards",
          title: "Hidden cards",
          cards: [{ title: "Hidden card" }],
        },
        {
          type: "definition_grid",
          definitions: [{ term: "Hidden term", definition: "Hidden value" }],
        },
        {
          type: "comparison",
          rows: [{ label: "Hidden row", values: ["A", "B"] }],
        },
        {
          type: "source_links",
          links: [{ title: "Hidden source", url: "/docs/hidden" }],
        },
      ),
    );
    expect(html).toContain("Visible answer");
    expect(html).not.toMatch(/Hidden|const hidden/);
  });

  it("renders nothing when no block has content", () => {
    expect(markup(ui({ type: "cards", cards: [] }))).toBe("");
  });

  it("keeps the agent's block order", () => {
    const html = markup(
      ui(
        { type: "callout", tone: "warning", body: "First" },
        { type: "command_list", commands: ["whoami"] },
        { type: "callout", body: "Third" },
      ),
    );
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("whoami"));
    expect(html.indexOf("whoami")).toBeLessThan(html.indexOf("Third"));
  });

  it("wraps commands between words, never inside a flag", () => {
    const html = markup(
      ui({
        type: "command_list",
        commands: ["spl-token create-token --program-2022 <MINT>"],
      }),
    );
    const word =
      /<span class="inline-block[^"]*">(.*?)<\/span>(?=\s|<\/code>)/g;
    const words = [...html.matchAll(word)].map((match) =>
      match[1]!.replace(/<[^>]+>/g, ""),
    );
    expect(words).toEqual([
      "spl-token",
      "create-token",
      "--program-2022",
      "&lt;MINT&gt;",
    ]);
    expect(html).toMatch(/text-\[var\(--sol-purple-text\)\]">&lt;MINT&gt;/);
  });

  it("draws a standalone model and a standalone flow in their own frames", () => {
    const model = markup(
      ui({ type: "concept_model", nodes: [{ id: "a", label: "Alpha" }] }),
    );
    expect(model).toContain(">Diagram<");
    expect(model).toContain(">Accounts and programs<");
    const flow = markup(
      ui({ type: "step_flow", title: "Deploy", steps: [{ title: "Build" }] }),
    );
    expect(flow).toContain(">Steps<");
    expect(flow).toContain(">Deploy<");
    expect(flow).not.toContain("aria-pressed");
  });
});

describe("intro", () => {
  const intro = ui({
    type: "answer_intro",
    title: "Token lifecycle",
    body: "Create a token by creating a mint account, then minting supply.",
  });

  it("shows when it adds to the summary", () => {
    expect(markup(intro, { summary: "Tokens live in accounts." })).toContain(
      "Token lifecycle",
    );
  });

  it("is left out when it repeats the summary", () => {
    expect(
      markup(intro, {
        summary:
          "To create a token, create a mint account and then mint supply.",
      }),
    ).toBe("");
  });

  it("waits for the stream to finish", () => {
    expect(markup(intro, { streaming: true })).toBe("");
  });
});

describe("callouts and commands", () => {
  it("labels note and warning callouts", () => {
    renderVisual(
      ui(
        { type: "callout", body: "Plain note" },
        { type: "callout", tone: "warning", title: "Careful", body: "Body" },
      ),
    );
    const notes = screen.getAllByRole("note");
    expect(notes.map((note) => note.getAttribute("aria-label"))).toEqual([
      "Note",
      "Warning",
    ]);
    expect(within(notes[1]!).getByText("Careful")).toBeInTheDocument();
  });

  it("copies a command without its prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderVisual(
      ui({
        type: "command_list",
        commands: [
          { command: "$ spl-token create-account <MINT>", note: "Holds it" },
        ],
      }),
    );
    expect(screen.getByText("<MINT>")).toHaveClass(
      "text-[var(--sol-purple-text)]",
    );
    expect(screen.getByText("Holds it")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
    });
    expect(writeText).toHaveBeenCalledWith("spl-token create-account <MINT>");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("labels multi-line code as code", () => {
    renderVisual(
      ui({
        type: "command_list",
        commands: [{ code: "const a = 1;\na + 1;" }],
      }),
    );
    expect(screen.getByRole("button", { name: "Copy code" })).toBeVisible();
  });
});

describe("links", () => {
  it("rewrites old docs paths and opens other sites in a tab", () => {
    renderVisual(
      ui({
        type: "step_flow",
        steps: [
          {
            title: "Read up",
            sources: [
              { title: "Accounts", url: "/docs/core/accounts" },
              { title: "Anchor", url: "https://www.anchor-lang.com/docs" },
              { title: "Bad", url: "javascript:alert(1)" },
            ],
          },
        ],
      }),
    );
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/developers/docs/core/accounts",
    );
    const anchor = screen.getByRole("link", { name: "Anchor" });
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByText("Bad")).toBeNull();
  });
});

describe("merged diagram", () => {
  afterEach(() => vi.useRealTimers());

  const node = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
  const step = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLElement>(`[data-step="${id}"]`)!;

  it("highlights what a hovered step touches and shows its result", () => {
    const { container } = renderVisual(tokenLifecycleGenerativeUiFixture);
    expect(container.querySelector("[data-touched]")).toBeNull();

    fireEvent.mouseEnter(step(container, "step-5"));
    expect(node(container, "mint")).toHaveAttribute("data-touched", "true");
    expect(node(container, "holder-token")).toHaveAttribute("data-touched");
    expect(node(container, "wallet")).not.toHaveAttribute("data-touched");
    expect(node(container, "wallet")).toHaveClass("opacity-60");
    const changed = node(container, "mint").querySelector("[data-changed]");
    expect(changed).toHaveTextContent("100");

    fireEvent.mouseLeave(step(container, "step-5"));
    expect(container.querySelector("[data-touched]")).toBeNull();
    expect(node(container, "wallet")).not.toHaveClass("opacity-60");
  });

  it("highlights the relationships a step creates", () => {
    const { container } = renderVisual(tokenLifecycleGenerativeUiFixture);
    fireEvent.mouseEnter(step(container, "step-4"));
    const linked = container.querySelector(
      '[data-relationship="wallet>holder-token"]',
    );
    expect(linked).not.toHaveClass("opacity-60");
    fireEvent.mouseEnter(step(container, "step-3"));
    expect(linked).toHaveClass("opacity-60");
  });

  it("marks a closed node when the cleanup step is in view", () => {
    const { container } = renderVisual(tokenLifecycleGenerativeUiFixture);
    fireEvent.mouseEnter(step(container, "step-6"));
    const holder = node(container, "holder-token");
    expect(holder).toHaveClass("border-dashed");
    expect(within(holder).getByText("Closed")).toBeInTheDocument();
  });

  it("follows keyboard focus and pins a step on click", () => {
    const { container } = renderVisual(tokenLifecycleGenerativeUiFixture);
    const title = screen.getByRole("button", {
      name: "Create the token account",
    });
    expect(title).toHaveAttribute("aria-pressed", "false");

    fireEvent.focus(title);
    expect(node(container, "holder-token")).toHaveAttribute("data-touched");
    fireEvent.blur(title);
    expect(container.querySelector("[data-touched]")).toBeNull();

    fireEvent.click(title);
    expect(title).toHaveAttribute("aria-pressed", "true");
    expect(node(container, "holder-token")).toHaveAttribute("data-touched");
    // Hover elsewhere wins while it lasts, then the pinned step returns.
    fireEvent.mouseEnter(step(container, "step-3"));
    expect(node(container, "holder-token")).not.toHaveAttribute("data-touched");
    fireEvent.mouseLeave(step(container, "step-3"));
    expect(node(container, "holder-token")).toHaveAttribute("data-touched");
    fireEvent.click(title);
    expect(title).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("[data-touched]")).toBeNull();
  });
});
