import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Inkeep search and Ask AI, see ask-ai.config.ts. /api/inkeep/* is mocked,
 * so this runs without INKEEP_API_KEY; with INKEEP_MOCK=0 the requests go to
 * the server (a deployment without the key answers 503, and the panels
 * still open).
 */

const MOCK = process.env.INKEEP_MOCK !== "0";
const DOCS_PAGES = [
  "/developers",
  "/developers/docs",
  "/developers/docs/quickstart",
  "/developers/cookbook",
  "/learn/introduction-to-solana-tokens",
];
const SITE_PAGES = ["/", "/enterprise"];
const ANSWER = "Accounts store state onchain.";
const CODE_PAGE = "/developers/cookbook/wallets/create-keypair";

async function setup(page: Page) {
  const errors: string[] = [];
  const chats: string[] = [];
  page.on("console", (m) => {
    // Headless Chromium has no WebGL for the home page's hero scene.
    if (m.type() !== "error" || /UnicornScene|WebGL/.test(m.text())) return;
    // Without the key, /api/inkeep/* answers 503.
    if (!MOCK && /status of 503|inkeep/i.test(m.text())) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() =>
    localStorage.setItem(
      "cookie_consent",
      JSON.stringify({ value: false, timeToExpire: Date.now() + 1e10 }),
    ),
  );
  if (!MOCK) return { errors, chats };
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

/** Inkeep's open modal (cxkit renders it in an open shadow root). */
const modal = (page: Page) => page.locator(".ikp-modal__content:visible");

for (const path of [...DOCS_PAGES, ...SITE_PAGES]) {
  test(`${path}: Ask AI opens Inkeep's chat, Escape closes it`, async ({
    page,
  }) => {
    const { errors } = await setup(page);
    await page.goto(path);
    await page.waitForLoadState("load");
    const button = page.getByRole("button", { name: "Ask AI", exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator("textarea").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const path of DOCS_PAGES) {
  test(`${path}: the search field opens Inkeep's search`, async ({ page }) => {
    const { errors } = await setup(page);
    // The header shows the field from 1440px wide, the icon below.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await page.locator(".dh-bar .dh-search[data-ready]").waitFor();
    await page.locator(".dh-bar .dh-search input").fill("fees");
    await page.keyboard.press("Enter");
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator("input").first()).toHaveValue("fees");
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(modal(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator(".dh-search-icon").click();
    await expect(modal(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("the site header's search opens Inkeep's search", async ({ page }) => {
  const { errors } = await setup(page);
  await page.goto("/enterprise");
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(modal(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a code block's Ask button asks Inkeep's chat about its code", async ({
  page,
}) => {
  test.skip(!MOCK, "needs the mocked chat");
  const { chats } = await setup(page);
  await page.goto(CODE_PAGE);
  await page.waitForLoadState("load");
  const ask = page.getByRole("button", { name: "Ask Assistant" }).first();
  await ask.scrollIntoViewIfNeeded();
  await ask.click();
  await expect(page.getByText(ANSWER)).toBeVisible();
  expect(chats[0]).toContain("Explain this code from");
});
