import { describe, expect, it } from "vitest";
import en from "../../../../../packages/i18n/messages/web/en/common.json";
import {
  COST_MODEL,
  HERO_CODE,
  HUB_STATS,
  JOB_PATHS,
  LEARN_ROUTES,
  MORE_USE_CASES,
  STAT_MAX_AGE_DAYS,
  WHY_REASONS,
  computeCosts,
  formatAsOf,
  formatStatValue,
  formatUsd,
  localizedHref,
  paymentsFromSliderPosition,
} from "@/data/developers/hub";
import {
  sliceTokens,
  tokenizeCode,
} from "@/app/[locale]/developers/code-tokens";

const landing = (en as { developers: { landing: Record<string, any> } })
  .developers.landing;

const DAY = 24 * 60 * 60 * 1000;

describe("developers hub stats", () => {
  it.each(HUB_STATS.map((stat) => [stat.id, stat] as const))(
    "%s was checked against its source in the last 180 days",
    (_id, stat) => {
      expect(stat.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const age =
        (Date.now() - Date.parse(`${stat.retrievedAt}T00:00:00Z`)) / DAY;
      expect(age).toBeGreaterThanOrEqual(-1);
      expect(
        age,
        `${stat.id} retrievedAt ${stat.retrievedAt} is older than ${STAT_MAX_AGE_DAYS} days; re-check ${stat.source.url}`,
      ).toBeLessThanOrEqual(STAT_MAX_AGE_DAYS);
    },
  );

  it("cites an https source and has copy for every stat", () => {
    for (const stat of HUB_STATS) {
      expect(new URL(stat.source.url).protocol).toBe("https:");
      expect(stat.source.name.length).toBeGreaterThan(0);
      expect(landing.why.stats[stat.labelKey]?.label).toBeTruthy();
      expect(stat.asOf).toMatch(/^\d{4}-(\d{2}(-\d{2})?|Q[1-4])$/);
    }
  });

  it("formats values per locale", () => {
    const supply = HUB_STATS.find((s) => s.id === "stablecoinSupply")!;
    expect(formatStatValue(supply, "en")).toBe("$16.7B");
    const uptime = HUB_STATS.find((s) => s.id === "uptime")!;
    expect(formatStatValue(uptime, "en")).toBe("30+");
    const daily = HUB_STATS.find((s) => s.id === "dailyTransactions")!;
    expect(formatStatValue(daily, "en")).toBe("120M");
    expect(formatStatValue(daily, "ja")).not.toBe("120M");
  });

  it("formats as-of dates", () => {
    expect(formatAsOf("2026-08-09", "en")).toBe("Aug 9, 2026");
    expect(formatAsOf("2026-02", "en")).toBe("February 2026");
    expect(formatAsOf("2026-Q3", "en")).toBe("Q3 2026");
  });
});

describe("cost calculator model", () => {
  it("matches the mockup defaults: 10,000 payments of $20", () => {
    const { paymentsPerMonth, averagePaymentUsd } = COST_MODEL.defaults;
    expect(
      paymentsFromSliderPosition(COST_MODEL.slider.payments.defaultPosition),
    ).toBe(paymentsPerMonth);
    const costs = computeCosts(paymentsPerMonth, averagePaymentUsd);
    expect(costs.card).toBeCloseTo(8800);
    expect(costs.solana).toBeCloseTo(10);
    expect(costs.savings).toBeCloseTo(8790);
    expect(formatUsd(costs.card, "en")).toBe("$8,800");
    expect(formatUsd(costs.solana, "en")).toBe("$10.00");
  });

  it("maps the payments slider onto 100 to 1,000,000 (log scale)", () => {
    expect(paymentsFromSliderPosition(0)).toBe(100);
    expect(paymentsFromSliderPosition(100)).toBe(1_000_000);
    expect(paymentsFromSliderPosition(25)).toBe(1000);
  });

  it("cites card pricing", () => {
    expect(COST_MODEL.card.source.url).toBe("https://stripe.com/pricing");
  });
});

describe("developers hub links", () => {
  it("points the three job cards at the job-path intros", () => {
    expect(JOB_PATHS.map((job) => job.href)).toEqual([
      "/docs/payments/checkout",
      "/docs/payments/paywall-api",
      "/docs/assets/issue-asset",
    ]);
    for (const job of JOB_PATHS) {
      expect(landing.picker.cards[job.id]).toMatchObject({
        title: expect.any(String),
        body: expect.any(String),
        cta: expect.any(String),
      });
    }
  });

  it("has copy for every secondary link, route and reason", () => {
    for (const item of MORE_USE_CASES)
      expect(landing.picker.more[item.id]).toBeTruthy();
    for (const route of LEARN_ROUTES)
      expect(landing.routes.items[route.id].title).toBeTruthy();
    for (const id of WHY_REASONS)
      expect(landing.why.reasons[id].title).toBeTruthy();
  });

  it("prefixes docs-owned links with the locale, but not templates or anchors", () => {
    expect(localizedHref("en", "/docs/payments/checkout")).toBe(
      "/docs/payments/checkout",
    );
    expect(localizedHref("ja", "/docs/payments/checkout")).toBe(
      "/ja/docs/payments/checkout",
    );
    expect(localizedHref("ar", "/developers/bootcamp")).toBe(
      "/ar/developers/bootcamp",
    );
    expect(localizedHref("ja", "/developers/templates")).toBe(
      "/developers/templates",
    );
    expect(localizedHref("ja", "#picker")).toBe("#picker");
    expect(localizedHref("ja", "https://stripe.com")).toBe(
      "https://stripe.com",
    );
  });

  it("does not use eyebrow copy keys", () => {
    expect(JSON.stringify(landing)).not.toMatch(/"eyebrow"/);
  });
});

describe("hero code sample", () => {
  it("uses the real @solana/kit + token plugin API, not a made-up helper", () => {
    expect(HERO_CODE.source).not.toMatch(/sendUsdc/);
    for (const call of [
      'from "@solana/kit"',
      'from "@solana/kit-plugin-rpc"',
      'from "@solana/kit-plugin-signer"',
      'from "@solana-program/token"',
      "createClient()",
      ".use(tokenProgram())",
      ".transferToATA({",
      ".sendTransaction();",
    ]) {
      expect(HERO_CODE.source).toContain(call);
    }
  });

  it("tokenizes losslessly so the highlighted render equals the source", () => {
    const tokens = tokenizeCode(HERO_CODE.source);
    expect(tokens.map((t) => t.value).join("")).toBe(HERO_CODE.source);
    expect(tokens).toContainEqual({ kind: "kw", value: "await" });
    expect(tokens).toContainEqual({ kind: "fn", value: "transferToATA" });
    expect(tokens).toContainEqual({ kind: "num", value: "1_000_000n" });
    expect(
      sliceTokens(tokens, 12)
        .map((t) => t.value)
        .join(""),
    ).toBe(HERO_CODE.source.slice(0, 12));
  });
});
