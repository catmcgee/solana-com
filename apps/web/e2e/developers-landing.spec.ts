import { expect, test, type Page } from "@playwright/test";

/**
 * /developers landing acceptance (spec §7.5): JS off × light|dark × en|ar|ja,
 * plus a JS-on pass for the theme toggle and hydration.
 */

const LOCALES = [
  { locale: "en", prefix: "", dir: "ltr" },
  { locale: "ar", prefix: "/ar", dir: "rtl" },
  { locale: "ja", prefix: "/ja", dir: "ltr" },
] as const;
const SCHEMES = ["light", "dark"] as const;

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
      const backgrounds: Record<string, string> = {};

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

          // Hero code is rendered in full, not typed.
          await expect(
            page.locator("[data-dev-landing] pre code").first(),
          ).toContainText(".transferToATA({");

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

          backgrounds[colorScheme] = await backgroundOf(page);
          await context.close();
        });
      }

      test("light and dark backgrounds differ", async () => {
        test.skip(
          Object.keys(backgrounds).length < 2,
          "needs both scheme runs in the same worker",
        );
        expect(backgrounds.light).not.toBe(backgrounds.dark);
      });
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
  test("theme toggle persists and the page hydrates cleanly", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
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
    const dark = await backgroundOf(page);

    await page
      .getByRole("button", { name: /toggle/i })
      .first()
      .click();
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
    // The landing background transitions over 300 ms.
    await expect.poll(() => backgroundOf(page)).not.toBe(dark);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
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
});
