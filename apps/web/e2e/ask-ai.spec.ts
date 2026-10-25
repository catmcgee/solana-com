import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Ask AI and the docs search, see ask-ai.config.ts. On /developers and the
 * docs, Ask AI is the docs' own panel (components/docs/ask) and Inkeep is
 * the search; the solana.com pages keep Inkeep's chat. /api/ask/* and
 * /api/inkeep/* are mocked, so this runs without the agent or
 * INKEEP_API_KEY; with ASK_MOCK=0 or INKEEP_MOCK=0 those requests go to
 * the server (ASK_SOLANA_MOCK=1 serves canned answers there).
 */

const MOCK = process.env.INKEEP_MOCK !== "0";
const ASK_MOCK = process.env.ASK_MOCK !== "0";
const DOCS_PAGES = [
  "/developers",
  "/developers/docs",
  "/developers/docs/quickstart",
  "/developers/cookbook",
  "/learn/introduction-to-solana-tokens",
];
const SITE_PAGES = ["/", "/enterprise"];
const ANSWER = "Accounts store state onchain.";
const ASK_ANSWER = "A mint account defines a token.";
const CODE_PAGE = "/developers/cookbook/wallets/create-keypair";
const DOCS_PAGE = "/developers/docs/core/accounts";

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function watchErrors(page: Page, errors: string[]) {
  page.on("console", (m) => {
    // Headless Chromium has no WebGL for the home page's hero scene.
    if (m.type() !== "error" || /UnicornScene|WebGL/.test(m.text())) return;
    // Without the key, /api/inkeep/* answers 503.
    if (!MOCK && /status of 503|inkeep/i.test(m.text())) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
}

async function setup(page: Page) {
  const errors: string[] = [];
  const chats: string[] = [];
  const asks: Record<string, unknown>[] = [];
  watchErrors(page, errors);
  await page.addInitScript(() =>
    localStorage.setItem(
      "cookie_consent",
      JSON.stringify({ value: false, timeToExpire: Date.now() + 1e10 }),
    ),
  );
  if (ASK_MOCK) {
    await page.route("**/api/ask/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/session"))
        return route.fulfill({ json: { session_token: "e2e-session" } });
      if (url.endsWith("/feedback")) return route.fulfill({ status: 204 });
      if (url.endsWith("/chat")) {
        asks.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({
          headers: { "content-type": "text/event-stream" },
          body:
            sse("status", { stage: "searching_docs" }) +
            sse("delta", { text: `### Summary response\n${ASK_ANSWER}` }) +
            sse("done", {
              run_id: 1,
              conversation_id: 2,
              citations: [
                { title: "Accounts", url: "/developers/docs/core/accounts" },
              ],
            }),
        });
      }
      return route.fulfill({ status: 404, json: {} });
    });
  }
  if (!MOCK) return { errors, chats, asks };
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
  return { errors, chats, asks };
}

/** Inkeep's open modal (cxkit renders it in an open shadow root). */
const modal = (page: Page) => page.locator(".ikp-modal__content:visible");
/** The Ask AI panel: docked (a landmark) or a dialog. */
const docked = (page: Page) =>
  page.getByRole("complementary", { name: "Ask AI" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Ask AI" });
const composer = (page: Page) => page.locator("[data-ask-composer]");

for (const path of DOCS_PAGES) {
  test(`${path}: Ask AI docks the docs' panel and answers`, async ({
    page,
  }) => {
    test.skip(!ASK_MOCK, "needs the mocked agent");
    const { errors, asks } = await setup(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await page.waitForLoadState("load");
    const button = page.getByRole("button", { name: "Ask AI", exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(docked(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-ask", "docked");
    await expect(composer(page)).toBeFocused();
    await composer(page).fill("What is a mint?");
    await composer(page).press("Enter");
    await expect(docked(page).getByText(ASK_ANSWER).first()).toBeVisible();
    await expect(
      docked(page).getByRole("navigation", { name: "Sources" }),
    ).toBeVisible();
    expect(asks[0]).toMatchObject({ message: "What is a mint?" });
    // Not Inkeep's chat.
    await expect(modal(page)).toHaveCount(0);
    await docked(page).getByRole("button", { name: "Close" }).click();
    await expect(docked(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const path of SITE_PAGES) {
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

test("Ask AI overlays narrower screens, expands to full screen, and Escape steps back", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(DOCS_PAGE);
  await page.waitForLoadState("load");
  const button = page.getByRole("button", { name: "Ask AI", exact: true });
  await button.click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-ask", "overlay");
  await dialog(page)
    .getByRole("link", { name: "Expand to full screen" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-ask", "fullscreen");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-ask", "overlay");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  // ⌘I / Ctrl+I toggles it.
  await page.keyboard.press("ControlOrMeta+i");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+i");
  await expect(dialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Ctrl-click on Expand opens the conversation full screen in a new tab", async ({
  page,
  context,
}) => {
  test.skip(!ASK_MOCK, "needs the mocked agent");
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${DOCS_PAGE}?view=x#rent`);
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await composer(page).fill("What is a mint?");
  await composer(page).press("Enter");
  await expect(docked(page).getByText(ASK_ANSWER).first()).toBeVisible();
  const expand = docked(page).getByRole("link", {
    name: "Expand to full screen",
  });
  await expect(expand).toHaveAttribute(
    "href",
    new RegExp(`^${DOCS_PAGE}\\?view=x&ask=full&askThread=\\w+#rent$`),
  );
  // The new tab's errors count too, from its first script.
  context.once("page", (tab) => watchErrors(tab, errors));
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    expand.click({ modifiers: ["ControlOrMeta"] }),
  ]);
  // The new tab: full screen, the same thread, and a clean URL.
  await expect(dialog(tab)).toBeVisible();
  await expect(dialog(tab).getByText("What is a mint?")).toBeVisible();
  await expect(dialog(tab).getByText(ASK_ANSWER).first()).toBeVisible();
  await expect(tab).toHaveURL(new RegExp(`${DOCS_PAGE}\\?view=x#rent$`));
  // This tab stays as it was.
  await expect(page.locator("html")).toHaveAttribute("data-ask", "docked");
  await expect(dialog(page)).toHaveCount(0);
  // Escape in the new tab docks the panel there; a reload keeps the thread.
  await tab.keyboard.press("Escape");
  await expect(tab.locator("html")).toHaveAttribute("data-ask", "docked");
  await tab.reload();
  await expect(docked(tab).getByText(ASK_ANSWER).first()).toBeVisible();
  // A plain click still expands in place.
  await expand.click();
  await expect(page.locator("html")).toHaveAttribute("data-ask", "fullscreen");
  await expect(dialog(page).getByText(ASK_ANSWER).first()).toBeVisible();
  expect(context.pages()).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("phones open Ask AI from the header as a full-screen sheet", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(DOCS_PAGE);
  await page.waitForLoadState("load");
  // The floating launcher is for wider screens.
  await expect(page.locator("[data-ask-launcher]")).toBeHidden();
  await page.locator(".dh-tools [data-docs-ask-open]").click();
  await expect(dialog(page)).toBeVisible();
  const box = await dialog(page).boundingBox();
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  expect(errors).toEqual([]);
});

test("the page actions menu asks about this page", async ({ page }) => {
  const { errors, asks } = await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DOCS_PAGE);
  await page.waitForLoadState("load");
  await page.locator('summary[aria-label="More actions"]').click();
  await page.getByRole("menuitem", { name: /^Ask AI/ }).click();
  await expect(docked(page).getByText("This page: Accounts")).toBeVisible();
  await expect(composer(page)).toBeFocused();
  expect(asks).toEqual([]);
  await composer(page).fill("What is rent?");
  await composer(page).press("Enter");
  await expect(docked(page).getByText(ASK_ANSWER).first()).toBeVisible();
  expect(String(asks[0]?.message)).toContain("“Accounts”");
  expect(asks[0]?.page_url).toBe(
    "https://solana.com/developers/docs/core/accounts",
  );
  expect(errors).toEqual([]);
});

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

test("Ask AI in the docs search hands the query to the panel", async ({
  page,
}) => {
  test.skip(!ASK_MOCK, "needs the mocked agent");
  const { asks, chats } = await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DOCS_PAGE);
  await page.locator(".dh-bar .dh-search[data-ready]").waitFor();
  await page.locator(".dh-bar .dh-search input").fill("fees");
  await page.keyboard.press("Enter");
  await expect(modal(page)).toBeVisible();
  await modal(page)
    .getByRole("button", { name: "Ask AI", exact: true })
    .first()
    .click();
  await expect(modal(page)).toHaveCount(0);
  await expect(docked(page).getByText(ASK_ANSWER).first()).toBeVisible();
  expect(asks[0]).toMatchObject({ message: "fees" });
  expect(chats).toEqual([]);
});

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

test("a code block's Ask button asks the docs' panel about its code", async ({
  page,
}) => {
  test.skip(!ASK_MOCK, "needs the mocked agent");
  const { asks, chats } = await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(CODE_PAGE);
  await page.waitForLoadState("load");
  const ask = page
    .getByRole("button", { name: "Ask AI about this code" })
    .first();
  await ask.scrollIntoViewIfNeeded();
  await ask.click();
  await expect(docked(page).getByText(ASK_ANSWER).first()).toBeVisible();
  expect(String(asks[0]?.message)).toContain("Explain this code from");
  expect(chats).toEqual([]);
});
