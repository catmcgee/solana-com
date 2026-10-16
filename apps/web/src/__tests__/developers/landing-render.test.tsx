import { render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../../../../../packages/i18n/messages/web/en/common.json";

vi.mock("@workspace/i18n/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace?: string;
  }) => createTranslator({ locale, messages: en, namespace } as never),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: { src: string } | string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : src.src} alt={alt} />
  ),
}));
vi.mock("@@/assets/learn/learn-hero.webp", () => ({
  default: { src: "/learn-hero.webp", width: 960, height: 720 },
}));

const { DevelopersHub } =
  await import("@/app/[locale]/developers/developers-hub");
const { LearnLanding } = await import("@/app/[locale]/learn/learn-landing");
const { AGENT_SETUP, HUB_STATS, JOB_PATHS } =
  await import("@/data/developers/hub");

function renderWithIntl(ui: ReactElement, locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("/developers landing", () => {
  it("renders the hero, the agent card and every section without client data", async () => {
    const { container } = renderWithIntl(
      await DevelopersHub({ locale: "en", updates: [] }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Build on internet capital markets.",
      }),
    ).toBeInTheDocument();
    for (const name of [
      "Build with your agent",
      "What are you building?",
      "Why Solana",
      "What would your payments cost?",
      "Other ways to learn",
      "Solana developer update",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
    expect(container.querySelector("[data-dev-landing]")).not.toBeNull();
  });

  it("server-renders the MCP URL and commands as plain text", async () => {
    renderWithIntl(await DevelopersHub({ locale: "ja", updates: [] }), "ja");
    const card = screen.getByTestId("agent-card");
    expect(within(card).getByTestId("agent-server-url")).toHaveTextContent(
      "https://mcp.solana.com/mcp",
    );
    expect(
      within(card).getByTestId("agent-command-claudeCode").textContent,
    ).toBe(AGENT_SETUP.clients[0].command);
    expect(within(card).getByTestId("agent-command-codex").textContent).toBe(
      AGENT_SETUP.clients[1].command,
    );
    expect(
      within(card).getByRole("link", {
        name: /Cursor, VS Code and Windsurf setup/,
      }),
    ).toHaveAttribute("href", "https://mcp.solana.com");
    // No tabs and no code sample.
    expect(card.querySelector('[role="tab"], pre')).toBeNull();
  });

  it("has no Ethereum or EVM links", async () => {
    const { container } = renderWithIntl(
      await DevelopersHub({ locale: "en", updates: [] }),
    );
    expect(container.textContent).not.toMatch(/ethereum|\bEVM\b/i);
    for (const link of container.querySelectorAll("a")) {
      expect(link.getAttribute("href") ?? "").not.toMatch(
        /ethereum|evm|migrate-to-solana/i,
      );
    }
  });

  it("marks the landing dark-only", async () => {
    const { container } = renderWithIntl(
      await DevelopersHub({ locale: "en", updates: [] }),
    );
    expect(
      container
        .querySelector("[data-dev-landing]")
        ?.getAttribute("data-dev-landing"),
    ).toBe("dark");
  });

  it("links the four job cards to the job-path intros", async () => {
    renderWithIntl(await DevelopersHub({ locale: "en", updates: [] }));
    const cards = within(screen.getByTestId("job-cards")).getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("href"))).toEqual(
      JOB_PATHS.map((job) => job.href),
    );
  });

  it("prefixes docs links with the locale", async () => {
    renderWithIntl(await DevelopersHub({ locale: "ja", updates: [] }), "ja");
    const cards = within(screen.getByTestId("job-cards")).getAllByRole("link");
    expect(cards[0]).toHaveAttribute("href", "/ja/docs/payments/checkout");
    expect(
      screen.getByRole("link", {
        name: "Templates Starter apps for Next.js, mobile and programs.",
      }),
    ).toHaveAttribute("href", "/developers/templates");
  });

  it("shows every stat with a visible footnote and source link", async () => {
    renderWithIntl(await DevelopersHub({ locale: "en", updates: [] }));
    const sources = screen.getByTestId("stat-sources");
    for (const [index, stat] of HUB_STATS.entries()) {
      const tile = screen.getByTestId(`stat-${stat.id}`);
      const footnote = within(tile).getByRole("link");
      expect(footnote).toHaveTextContent(`[${index + 1}]`);
      expect(footnote).toHaveAttribute("href", `#dl-source-${stat.id}`);
      const item = sources.querySelector(`#dl-source-${stat.id}`)!;
      expect(item.querySelector("a")).toHaveAttribute("href", stat.source.url);
      expect(item.textContent).toContain("retrieved");
    }
  });

  it("server-renders the calculator defaults and the static table", async () => {
    renderWithIntl(await DevelopersHub({ locale: "en", updates: [] }));
    expect(screen.getByTestId("calc-payments")).toHaveTextContent("10,000");
    expect(screen.getByTestId("calc-card")).toHaveTextContent("$8,800");
    expect(screen.getByTestId("calc-solana")).toHaveTextContent("$10.00");
    expect(screen.getByTestId("calc-savings")).toHaveTextContent("$8,790");
    const rows = within(screen.getByTestId("calc-table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[2]).toHaveTextContent("10,000$8,800$10.00");
  });

  it("uses a native Iterable form for the newsletter", async () => {
    const { container } = renderWithIntl(
      await DevelopersHub({ locale: "en", updates: [] }),
    );
    const form = container.querySelector("#newsletter form")!;
    expect(form.getAttribute("action")).toMatch(
      /^https:\/\/links\.iterable\.com\/lists\/publicAddSubscriberForm\?publicIdString=/,
    );
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("onsubmit")).toBeNull();
    expect(
      form.querySelector('input[name="email"][type="email"]'),
    ).not.toBeNull();
    expect(form.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it("hides the updates section when the feed is empty and shows it otherwise", async () => {
    const empty = renderWithIntl(
      await DevelopersHub({ locale: "en", updates: [] }),
    );
    expect(empty.container.querySelector("#updates")).toBeNull();
    empty.unmount();

    renderWithIntl(
      await DevelopersHub({
        locale: "en",
        updates: [
          {
            kind: "Release",
            title: "Agave 3.1",
            description: "New release.",
            href: "/news/agave-3-1",
            publishedAt: "2026-10-01T00:00:00Z",
          },
        ],
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Developer updates" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agave 3\.1/ })).toHaveAttribute(
      "href",
      "/news/agave-3-1",
    );
  });

  it("has no eyebrow labels or left-border accents", async () => {
    const { container } = renderWithIntl(
      await DevelopersHub({ locale: "en", updates: [] }),
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(
      /border-l-2|border-s-2|uppercase tracking-\[0\.18em\]/,
    );
    expect(html).not.toMatch(/sendUsdc/);
  });
});

describe("/learn landing", () => {
  it("lists the ten tutorials in order with Mintlify links", async () => {
    renderWithIntl(await LearnLanding({ locale: "fr" }), "fr");
    const links = within(screen.getByTestId("learn-tutorials")).getAllByRole(
      "link",
    );
    expect(links).toHaveLength(10);
    expect(links[0]).toHaveAttribute("href", "/fr/learn/what-is-solana");
    expect(links[9]).toHaveAttribute(
      "href",
      "/fr/learn/staying-safe-on-solana",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Learn about Solana" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Courses/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });
});
