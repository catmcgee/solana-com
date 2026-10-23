import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Search and Ask AI (components/docs/ask-ai.client.tsx, inkeep.client.tsx,
 * docs-search.client.tsx), see ask-ai.config.ts.
 *
 * - Without INKEEP=1 (a build without INKEEP_API_KEY): the Fumadocs search
 *   dialog and, on the docs, the Ask AI menu.
 * - With INKEEP=1 (a build with INKEEP_API_KEY set to any value): Inkeep's
 *   modal against a mocked /api/inkeep/*.
 */

const INKEEP = process.env.INKEEP === "1";
const PAGES = [
  "/",
  "/developers",
  "/developers/docs",
  "/developers/docs/core",
  "/enterprise",
];
const ANSWER = "Accounts store state onchain.";
const CODE_PAGE = "/developers/cookbook/wallets/create-keypair";

async function setup(page: Page) {
  const errors: string[] = [];
  const chats: string[] = [];
  page.on("console", (m) => {
    // Headless Chromium has no WebGL for the home page's hero scene.
    if (m.type() === "error" && !/UnicornScene|WebGL/.test(m.text()))
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() =>
    localStorage.setItem(
      "cookie_consent",
      JSON.stringify({ value: false, timeToExpire: Date.now() + 1e10 }),
    ),
  );
  await page.route("**/api/inkeep/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/v1/challenge")) {
      const salt = "s4lt";
      return route.fulfill({
        json: {
          algorithm: "SHA-256",
          challenge: createHash("sha256").update(`${salt}7`).digest("hex"),
          salt,
          signature: "sig",
          maxnumber: 100,
        },
      });
    }
    if (url.includes("/v1/chat/completions")) {
      chats.push(route.request().postData() ?? "");
      const chunk = (delta: object, finish: string | null = null) =>
        `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      return route.fulfill({
        headers: { "content-type": "text/event-stream" },
        body:
          chunk({ role: "assistant", content: ANSWER }) +
          chunk({}, "stop") +
          "data: [DONE]\n\n",
      });
    }
    if (url.includes("/search/graphql"))
      return route.fulfill({
        json: { data: { search: { searchHits: [], searchQuery: "" } } },
      });
    return route.fulfill({ json: {} });
  });
  return { errors, chats };
}

const pill = (page: Page) => page.getByRole("button", { name: "Ask AI" });
const chatInput = (page: Page) =>
  page.getByPlaceholder("How do I get started?");

test.describe("without Inkeep", () => {
  test.skip(INKEEP, "build without INKEEP_API_KEY");

  for (const path of PAGES) {
    test(`${path} loads; the pill only on the docs`, async ({ page }) => {
      const { errors } = await setup(page);
      await page.goto(path);
      await page.waitForLoadState("load");
      const docs = path.startsWith("/developers/docs");
      await expect(pill(page)).toHaveCount(docs ? 1 : 0);
      expect(await page.locator("inkeep-portal").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test("the pill opens the menu, which searches", async ({ page }) => {
    const { errors } = await setup(page);
    await page.goto("/developers/docs/core");
    await pill(page).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      /Ask Claude/,
      /Ask ChatGPT/,
      /Search the docs/,
    ]);
    await page.getByRole("menuitem", { name: /Search the docs/ }).click();
    await expect(page.locator("dialog.docs-search")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a code block's Ask button opens the menu", async ({ page }) => {
    await setup(page);
    await page.goto(CODE_PAGE);
    const ask = page.getByRole("button", { name: "Ask Assistant" }).first();
    await ask.scrollIntoViewIfNeeded();
    await ask.click();
    await expect(page.getByRole("menu", { name: "Ask AI" })).toBeVisible();
  });

  for (const path of ["/developers/docs/core", "/enterprise"]) {
    test(`${path}: search opens the Fumadocs dialog and finds pages`, async ({
      page,
    }) => {
      const { errors } = await setup(page);
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.keyboard.press("Control+k");
      const dialog = page.locator("dialog.docs-search");
      await expect(dialog).toBeVisible();
      await dialog.locator("input").fill("account");
      await expect(
        dialog.locator(".docs-search-results a").first(),
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe("with Inkeep", () => {
  test.skip(!INKEEP, "build with INKEEP_API_KEY");

  for (const path of PAGES) {
    test(`${path}: the pill opens Inkeep chat, which answers`, async ({
      page,
    }) => {
      const { errors } = await setup(page);
      await page.goto(path);
      await expect(pill(page)).toBeVisible();
      // Nothing of Inkeep before it is opened.
      expect(await page.locator("inkeep-portal").count()).toBe(0);
      await pill(page).click();
      await chatInput(page).fill("What is an account?");
      await chatInput(page).press("Enter");
      await expect(page.getByText(ANSWER)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(chatInput(page)).toBeHidden();
      await expect(pill(page)).toBeFocused();
      expect(errors).toEqual([]);
    });
  }

  test("Ctrl+/ opens the chat", async ({ page }) => {
    await setup(page);
    await page.goto("/developers/docs/core");
    await pill(page).waitFor();
    await page.keyboard.press("Control+/");
    await expect(chatInput(page)).toBeVisible();
  });

  test("a code block's Ask button asks about its code", async ({ page }) => {
    const { chats } = await setup(page);
    await page.goto(CODE_PAGE);
    const ask = page.getByRole("button", { name: "Ask Assistant" }).first();
    await ask.scrollIntoViewIfNeeded();
    await ask.click();
    await expect(page.getByText(ANSWER)).toBeVisible();
    expect(chats[0]).toContain("Explain this code from");
  });

  for (const path of ["/developers/docs/core", "/enterprise"]) {
    test(`${path}: Ctrl+K opens Inkeep search`, async ({ page }) => {
      await setup(page);
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.keyboard.press("Control+k");
      await expect(
        page.getByPlaceholder("Search", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("dialog.docs-search")).toHaveCount(0);
    });
  }

  test("?q= on arrival opens Inkeep search with the query", async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/developers/docs?q=accounts");
    await expect(page.locator("inkeep-portal input").first()).toHaveValue(
      "accounts",
    );
    expect(new URL(page.url()).search).toBe("");
  });
});
