import { expect, test, type Page } from "@playwright/test";

/**
 * /developers landing acceptance (spec §7.5): JS off × light|dark × en|ar|ja,
 * plus JS-on passes for the docs theme (light/dark shared with /docs through
 * localStorage "isDarkMode"), the docs header (search hand-off, toggle), the
 * copy buttons and hydration. /learn keeps its own light/dark toggle.
 */

const LOCALES = [
  { locale: "en", prefix: "", dir: "ltr" },
  { locale: "ar", prefix: "/ar", dir: "rtl" },
  { locale: "ja", prefix: "/ja", dir: "ltr" },
] as const;
const SCHEMES = ["light", "dark"] as const;
const DARK_BG = "rgb(10, 10, 11)";
const LIGHT_BG = "rgb(255, 255, 255)";
const MCP_URL = "https://mcp.solana.com/mcp";
const COMMANDS = {
  claudeCode: `claude mcp add --transport http solana-mcp ${MCP_URL}`,
  codex: `codex mcp add solana-mcp --url ${MCP_URL}`,
} as const;

async function backgroundOf(page: Page) {
  return page
    .locator('[data-dev-landing="docs"]')
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
          // The per-agent commands sit in a native <details>.
          await card.getByText("Add it to one agent").click();
          for (const [id, command] of Object.entries(COMMANDS)) {
            await expect(card.getByTestId(`agent-command-${id}`)).toHaveText(
              command,
            );
          }
          await expect(
            card.locator('a[href$="/developers/docs/intro/coding-with-agents"]'),
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
          await expect(cards).toHaveCount(4);
          const hrefs = await cards.evaluateAll((els) =>
            els.map((el) => el.getAttribute("href")),
          );
          expect(hrefs).toEqual([
            `${prefix}/docs/payments/checkout`,
            `${prefix}/docs/payments/paywall-api`,
            `${prefix}/docs/assets/issue-asset`,
            `${prefix}/docs/defi/settle-trade`,
          ]);

          // Stats render without footnotes or a sources list.
          await expect(page.getByTestId("stats").locator("li")).toHaveCount(4);
          await expect(page.getByTestId("stat-sources")).toHaveCount(0);

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

          // Docs links open in the same tab.
          for (const target of await cards.evaluateAll((els) =>
            els.map((el) => el.getAttribute("target")),
          )) {
            expect(target).toBeNull();
          }

          // The docs header and footer replace the solana.com chrome.
          await expect(page.locator("header.dh")).toHaveCount(1);
          await expect(page.locator("nav#navbar")).toHaveCount(0);
          await expect(
            page.locator(
              `header.dh .dh-bar nav a[href="${prefix}/docs/payments"]`,
            ),
          ).toHaveCount(1);
          const footer = page.locator("footer.df");
          await expect(
            footer.locator('a[href$="/privacy-policy"]'),
          ).toBeAttached();
          await expect(footer.locator('a[href$="/tos"]')).toBeAttached();
          // The theme switch needs JS, so it is hidden.
          await expect(page.locator(".dh-bar .dh-theme")).toBeHidden();

          expect(await invisibleElements(page)).toEqual([]);

          // The reader's preference, like the docs without JS.
          expect(await backgroundOf(page)).toBe(
            colorScheme === "dark" ? DARK_BG : LIGHT_BG,
          );
          await context.close();
        });
      }
    });
  }

  test("docs header menus work as plain <details> and links", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/developers");
    const languages = page.locator(".dh-bar .dh-lang");
    await languages.locator("summary").click();
    await expect(languages.locator('a[hreflang="ja"]')).toHaveAttribute(
      "href",
      "/ja/developers",
    );
    // The search field submits to the docs.
    const form = page.locator('.dh-bar form[role="search"]');
    await expect(form).toHaveAttribute("action", "/docs");
    await context.close();
  });

  test("solana.com header: Developers right of Ecosystem, in a new tab", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/ecosystem");
    const nav = page.locator('header nav[aria-label="Site"]');
    const links = nav.locator("ul").first().locator("a");
    await expect(links.last()).toHaveAttribute("href", "/developers");
    await expect(links.last()).toHaveAttribute("target", "_blank");
    await expect(links.nth(-2)).toHaveAttribute("href", "/ecosystem");
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
  test("follows the system theme, toggles and shares the choice with the docs", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "light" });
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
    const html = page.locator("html");
    await expect(html).toHaveClass(/\blight\b/);
    expect(await backgroundOf(page)).toBe(LIGHT_BG);

    const toggle = page.locator(".dh-bar button[data-theme-toggle]");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
    await toggle.click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
    expect(await backgroundOf(page)).toBe(DARK_BG);
    // Stored where Mintlify keeps it, so /docs opens dark too.
    expect(await page.evaluate(() => localStorage.getItem("isDarkMode"))).toBe(
      "dark",
    );

    // A reload paints dark straight away (pre-paint script).
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);

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

  test("uses a choice made in the docs", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    // What Mintlify stores after "Switch to light mode" on /docs.
    await context.addInitScript(() => {
      localStorage.setItem("isDarkMode", "light");
    });
    const page = await context.newPage();
    await page.goto("/developers");
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
    expect(await backgroundOf(page)).toBe(LIGHT_BG);
    await context.close();
  });

  test("search hands off to the docs search", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Do not load the docs; only check where the header sends the reader.
    await page.route(/\/docs(\?|$)/, (route) =>
      route.fulfill({ status: 200, body: "docs" }),
    );

    await page.goto("/developers");
    await page.locator(".dh-bar .dh-search[data-ready]").waitFor();
    await page.locator(".dh-bar .dh-search input").click();
    await expect(page).toHaveURL(/\/docs\?search=1$/);

    await page.goto("/developers");
    await page.locator(".dh-bar .dh-search[data-ready]").waitFor();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page).toHaveURL(/\/docs\?search=1$/);

    await page.goto("/developers");
    await page.locator(".dh-bar .dh-search[data-ready]").waitFor();
    await page.locator(".dh-bar .dh-search input").focus();
    await page.keyboard.type("token extensions");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/docs\?q=token%20extensions$/);
    await context.close();
  });

  test("copy buttons copy the exact strings", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto("/developers");
    const card = page.getByTestId("agent-card");
    await card.getByText("Add it to one agent").click();
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
