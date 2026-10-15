import { expect, test, type Page } from "@playwright/test";

/**
 * /developers landing acceptance (spec §7.5): JS off × light|dark × en|ar|ja,
 * plus JS-on passes for the dark-only theme, the copy buttons and hydration.
 * /developers is dark only (no theme toggle); /learn keeps light and dark.
 */

const LOCALES = [
  { locale: "en", prefix: "", dir: "ltr" },
  { locale: "ar", prefix: "/ar", dir: "rtl" },
  { locale: "ja", prefix: "/ja", dir: "ltr" },
] as const;
const SCHEMES = ["light", "dark"] as const;
const DARK_BG = "rgb(10, 10, 11)";
const MCP_URL = "https://mcp.solana.com/mcp";
const COMMANDS = {
  claudeCode: `claude mcp add --transport http solana-mcp ${MCP_URL}`,
  codex: `codex mcp add solana-mcp --url ${MCP_URL}`,
} as const;

async function backgroundOf(page: Page) {
  return page
    .locator("[data-dev-landing]")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function invisibleElements(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-dev-landing] *"))
      .filter((el) => getComputedStyle(el).opacity === "0")
      .map((el) => el.outerHTML.slice(0, 120)),
  );
}

test.describe("without JavaScript", () => {
  for (const { locale, prefix, dir } of LOCALES) {
    test.describe(`${locale}`, () => {
      for (const colorScheme of SCHEMES) {
        test(`${colorScheme}: renders every section`, async ({ browser }) => {
          const context = await browser.newContext({
            javaScriptEnabled: false,
            colorScheme,
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          const response = await page.goto(`${prefix}/developers`);
          expect(response?.status()).toBe(200);

          await expect(page.locator("html")).toHaveAttribute("dir", dir);
          await expect(page.locator("h1")).toHaveCount(1);
          await expect(page.locator("h1")).not.toBeEmpty();

          // Agent card: URL and commands are visible text; the copy buttons
          // need JS, so they are hidden and disabled.
          const card = page.getByTestId("agent-card");
          await expect(card.getByTestId("agent-server-url")).toHaveText(
            MCP_URL,
          );
          for (const [id, command] of Object.entries(COMMANDS)) {
            await expect(card.getByTestId(`agent-command-${id}`)).toHaveText(
              command,
            );
          }
          await expect(
            card.locator('a[href="https://mcp.solana.com"]'),
          ).toBeVisible();
          const buttons = card.locator("button");
          await expect(buttons).toHaveCount(3);
          for (const button of await buttons.all()) {
            await expect(button).toBeHidden();
            await expect(button).toBeDisabled();
          }

          // No Ethereum / EVM links.
          await expect(
            page.locator(
              '[data-dev-landing] a[href*="ethereum"], [data-dev-landing] a[href*="evm"]',
            ),
          ).toHaveCount(0);

          const cards = page.getByTestId("job-cards").getByRole("link");
          await expect(cards).toHaveCount(3);
          const hrefs = await cards.evaluateAll((els) =>
            els.map((el) => el.getAttribute("href")),
          );
          expect(hrefs).toEqual([
            `${prefix}/docs/payments/checkout`,
            `${prefix}/docs/payments/paywall-api`,
            `${prefix}/docs/assets/issue-asset`,
          ]);

          // Stats with visible footnotes and external sources.
          await expect(page.getByTestId("stats").locator("li")).toHaveCount(4);
          const sources = page.getByTestId("stat-sources").locator("a");
          await expect(sources).toHaveCount(4);
          for (const href of await sources.evaluateAll((els) =>
            els.map((el) => el.getAttribute("href") ?? ""),
          )) {
            expect(href).toMatch(/^https:\/\//);
          }

          // Calculator defaults and static table are server-rendered.
          await expect(page.getByTestId("calc-card")).not.toBeEmpty();
          await expect(
            page.getByTestId("calc-table").locator("tbody tr"),
          ).toHaveCount(3);
          await expect(
            page.locator('[data-dev-landing] input[type="range"]'),
          ).toHaveCount(0);

          // Newsletter is a native form.
          const form = page.locator("#newsletter form");
          await expect(form).toHaveAttribute("action", /links\.iterable\.com/);
          await expect(form).toHaveAttribute("method", "post");
          await expect(form.locator('input[name="email"]')).toHaveCount(1);

          // In-page jump is a real anchor.
          await expect(page.locator('a[href="#picker"]')).toHaveCount(1);
          await expect(page.locator("#picker")).toHaveCount(1);

          // Shared footer links are present (the ui-chrome Footer is not a
          // <footer> element, so match its legal links).
          await expect(
            page.locator('a[href$="/privacy-policy"]').first(),
          ).toBeAttached();
          await expect(page.locator('a[href$="/tos"]').first()).toBeAttached();

          expect(await invisibleElements(page)).toEqual([]);

          // Dark only, whatever the reader's preference.
          expect(await backgroundOf(page)).toBe(DARK_BG);
          await context.close();
        });
      }
    });
  }

  test("header has a noscript link list with every language", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/developers");
    const nav = page.locator('header nav[aria-label="Site"]');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[href="/docs"]')).toHaveCount(1);
    await expect(nav.locator('a[hreflang="ja"]')).toHaveAttribute(
      "href",
      "/ja/developers",
    );
    await context.close();
  });

  test("/learn renders its tutorials", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/learn");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByTestId("learn-tutorials").getByRole("link"),
    ).toHaveCount(10);
    await context.close();
  });
});

test.describe("with JavaScript", () => {
  test("stays dark with a light preference, has no toggle, hydrates cleanly", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    // A stored light choice (from /learn or the docs) must not apply here.
    await context.addInitScript(() => {
      localStorage.setItem("theme", "light");
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydrat|did not match|server rendered/i.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/developers");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.locator("html")).not.toHaveClass(/\blight\b/);
    expect(await backgroundOf(page)).toBe(DARK_BG);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe(DARK_BG);
    await expect(page.getByRole("button", { name: /toggle/i })).toHaveCount(0);
    // The stored preference is left alone for the light/dark pages.
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(
      "light",
    );

    // Calculator sliders appear after hydration and update the result.
    const range = page
      .locator('[data-dev-landing] input[type="range"]')
      .first();
    await expect(range).toBeVisible();
    await range.fill("100");
    await expect(page.getByTestId("calc-payments")).toHaveText(/1,000,000/);

    expect(errors).toEqual([]);
    await context.close();
  });

  test("copy buttons copy the exact strings", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto("/developers");
    const card = page.getByTestId("agent-card");
    const targets = [
      { name: "Copy the server URL", text: MCP_URL },
      { name: "Copy the Claude Code command", text: COMMANDS.claudeCode },
      { name: "Copy the Codex command", text: COMMANDS.codex },
    ];
    for (const { name, text } of targets) {
      const button = card.getByRole("button", { name });
      await expect(button).toBeEnabled();
      await button.click();
      await expect(button).toHaveText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        text,
      );
    }
    await context.close();
  });

  test("/learn keeps its theme toggle", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/learn");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page
      .getByRole("button", { name: /toggle/i })
      .first()
      .click();
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
    await context.close();
  });
});
