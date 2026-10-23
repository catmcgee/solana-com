import { expect, test, type Page } from "@playwright/test";

/**
 * Ask AI against a mocked /api/docs-chat (see ask-ai.config.ts): the pill,
 * the panel, an answer with links to the docs, follow-ups, close and reopen,
 * keyboard use, a code block's Ask button, and failed or empty answers, on
 * the docs, /developers and solana.com pages, at desktop and phone sizes in
 * light and dark.
 */

const PAGES = [
  "/",
  "/developers",
  "/developers/docs",
  "/developers/docs/core",
  "/enterprise",
];
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const SCHEMES = ["light", "dark"] as const;

const ANSWER = [
  "Accounts store state onchain. See [Accounts](/developers/docs/core/accounts).",
  "",
  "- Every account has an `owner` program.",
  "",
  "```ts",
  'import { address } from "@solana/kit";',
  "```",
].join("\n");

function sse(parts: object[]) {
  return (
    parts.map((p) => `data: ${JSON.stringify(p)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function answer(text: string) {
  return sse([
    { type: "start", messageId: `m${Math.random()}` },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "t1",
      toolName: "search",
      input: { query: "accounts", limit: 4 },
    },
    {
      type: "tool-output-available",
      toolCallId: "t1",
      output: [
        {
          doc: { url: "/developers/docs/core/accounts", title: "Accounts" },
          content: "…",
        },
      ],
    },
    { type: "finish-step" },
    { type: "start-step" },
    { type: "text-start", id: "x" },
    ...text.match(/[\s\S]{1,20}/g)!.map((delta) => ({
      type: "text-delta",
      id: "x",
      delta,
    })),
    { type: "text-end", id: "x" },
    { type: "finish-step" },
    { type: "finish" },
  ]);
}

const STREAM = {
  "content-type": "text/event-stream",
  "x-vercel-ai-ui-message-stream": "v1",
};

type Mode = "ok" | "503" | "500" | "empty" | "network";

async function setup(
  page: Page,
  {
    scheme = "light",
    mode = "ok",
    banner = false,
  }: { scheme?: string; mode?: Mode; banner?: boolean } = {},
) {
  const requests: { messages: unknown[]; locale: string }[] = [];
  const errors: string[] = [];
  page.on("console", (m) => {
    // Headless Chromium has no WebGL for the home page's hero scene.
    if (m.type() === "error" && !/UnicornScene|WebGL/.test(m.text()))
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(
    ({ scheme, banner }) => {
      localStorage.setItem("isDarkMode", String(scheme === "dark"));
      localStorage.setItem("theme", scheme);
      if (!banner)
        localStorage.setItem(
          "cookie_consent",
          JSON.stringify({ value: false, timeToExpire: Date.now() + 1e10 }),
        );
    },
    { scheme, banner },
  );
  await page.route("**/api/docs-chat", async (route) => {
    requests.push(route.request().postDataJSON());
    if (mode === "ok")
      return route.fulfill({
        status: 200,
        headers: STREAM,
        body: answer(ANSWER),
      });
    if (mode === "empty")
      return route.fulfill({
        status: 200,
        headers: STREAM,
        body: sse([{ type: "start" }, { type: "finish" }]),
      });
    if (mode === "network") return route.abort("failed");
    return route.fulfill({
      status: Number(mode),
      contentType: "text/html",
      body: "<!DOCTYPE html><h1>Internal Server Error</h1>",
    });
  });
  return { requests, errors };
}

const panel = (page: Page) => page.locator("aside.docs-chat");
const pill = (page: Page) => page.getByRole("button", { name: "Ask AI" });

async function ask(page: Page, question: string) {
  const input = panel(page).getByRole("textbox", { name: "Message" });
  await input.fill(question);
  await input.press("Enter");
}

for (const path of PAGES) {
  for (const size of SIZES) {
    for (const scheme of SCHEMES) {
      test(`${path} ${size.name} ${scheme}: open, ask, follow up, close, reopen`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        const { requests, errors } = await setup(page, { scheme });
        await page.goto(path);
        await expect(pill(page)).toBeVisible();
        // Nothing of the chat loads before it is opened.
        expect(await panel(page).count()).toBe(0);

        await pill(page).click();
        await expect(panel(page)).toBeVisible();
        await expect(page.getByText("What do you want to know?")).toBeVisible();
        const box = (await panel(page).boundingBox())!;
        expect(box.width).toBe(Math.min(416, size.width));
        expect(box.x + box.width).toBe(size.width);

        await ask(page, "What is an account?");
        const prose = panel(page).locator(".prose").first();
        await expect(prose).toContainText("Every account has an owner program");
        await expect(
          prose.getByRole("link", { name: "Accounts" }),
        ).toHaveAttribute("href", "/developers/docs/core/accounts");
        expect(requests[0]!.locale).toBe("en");

        await ask(page, "And rent?");
        await expect(panel(page).locator(".prose")).toHaveCount(2);
        expect(requests[1]!.messages).toHaveLength(3);

        await panel(page).getByRole("button", { name: "Close" }).click();
        await expect(panel(page)).toBeHidden();
        await expect(pill(page)).toBeFocused();

        await pill(page).click();
        await expect(panel(page)).toBeVisible();
        await expect(panel(page).locator(".prose")).toHaveCount(2);
        expect(errors).toEqual([]);
      });
    }
  }
}

test("keyboard: Ctrl+/ opens, Escape closes, focus returns to the pill", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/developers/docs/core");
  await pill(page).waitFor();
  await page.keyboard.press("Control+/");
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByRole("textbox", { name: "Message" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(pill(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+/");
  await expect(panel(page)).toBeVisible();
});

test("a code block's Ask button asks about its code", async ({ page }) => {
  const { requests } = await setup(page);
  await page.goto("/developers/cookbook/wallets/create-keypair");
  const button = page.getByRole("button", { name: "Ask Assistant" }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(".prose")).toContainText("Every account");
  const message = JSON.stringify(requests[0]!.messages[0]);
  expect(message).toContain("Explain this code from");
  expect(message).toContain("data-client");
  // A second block, with the chat loaded.
  await panel(page).getByRole("button", { name: "Close" }).click();
  await button.click();
  await expect(panel(page).locator(".prose")).toHaveCount(2);
});

for (const [mode, text] of [
  ["503", "isn't available right now"],
  ["500", "couldn't answer just now"],
  ["network", "Couldn't reach Ask AI"],
  ["empty", "No answer came back"],
] as const) {
  test(`a ${mode} answer says what happened`, async ({ page }) => {
    await setup(page, { mode });
    await page.goto("/developers/docs/core");
    await pill(page).click();
    await ask(page, "hello");
    await expect(panel(page)).toContainText(text);
    await expect(panel(page)).not.toContainText("<");
  });
}

test("the pill and panel stay clear of the cookie banner on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { banner: true });
  await page.goto("/enterprise");
  const banner = page.locator("[data-ask-ai-avoid]").first();
  await expect(banner).toBeVisible();
  const bannerTop = (await banner.boundingBox())!.y;
  await expect
    .poll(async () => {
      const b = (await pill(page).boundingBox())!;
      return b.y + b.height;
    })
    .toBeLessThanOrEqual(bannerTop);
  await pill(page).click();
  const input = panel(page).getByRole("textbox", { name: "Message" });
  await expect(input).toBeVisible();
  const box = (await input.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bannerTop);
  // Dismissing the banner drops the pill back to the corner.
  await panel(page).getByRole("button", { name: "Close" }).click();
  await banner.getByRole("button", { name: /accept/i }).click();
  await expect
    .poll(async () => {
      const b = (await pill(page).boundingBox())!;
      return Math.round(844 - (b.y + b.height));
    })
    .toBe(16);
});

test("the panel starts under the site header", async ({ page }) => {
  await setup(page);
  await page.goto("/enterprise");
  await pill(page).click();
  const header = (await page.locator("header.sticky").boundingBox())!;
  await expect
    .poll(async () => Math.round((await panel(page).boundingBox())!.y))
    .toBe(Math.round(header.y + header.height));
});

test("the pill stays above the podcast player", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "solana:persistent-podcast-player",
      JSON.stringify({
        currentEpisode: {
          id: "e",
          slug: "e",
          podcastSlug: "p",
          title: "Episode",
          audioUrl: "data:audio/mp3;base64,",
        },
        podcastTitle: "Podcast",
        podcastSlug: "p",
        isPlaying: false,
      }),
    ),
  );
  await setup(page);
  await page.goto("/enterprise");
  const player = page.locator("[data-ask-ai-avoid]").first();
  await expect(player).toBeVisible();
  const playerTop = (await player.boundingBox())!.y;
  await expect
    .poll(async () => {
      const b = (await pill(page).boundingBox())!;
      return b.y + b.height <= playerTop;
    })
    .toBe(true);
  await pill(page).click();
  const input = panel(page).getByRole("textbox", { name: "Message" });
  await expect(input).toBeVisible();
  const box = (await input.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(playerTop);
});
