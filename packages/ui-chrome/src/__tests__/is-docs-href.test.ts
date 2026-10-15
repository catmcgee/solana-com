import { describe, expect, it } from "vitest";
import { isDocsHref } from "../url-config";

describe("isDocsHref", () => {
  it.each([
    "/docs",
    "/docs/payments/checkout",
    "/ja/docs/core/accounts",
    "/pt/docs/rpc#getbalance",
    "/developers/cookbook",
    "/developers/cookbook/tokens/create-mint",
    "/developers/bootcamp/foundations",
    "/learn/what-is-solana",
    "https://solana.com/docs/core",
  ])("treats %s as a docs link", (href) => {
    expect(isDocsHref(href)).toBe(true);
  });

  it.each([
    "/developers",
    "/learn",
    "/developers/payments",
    "/docsearch",
    "https://mcp.solana.com",
    "#picker",
  ])("treats %s as not a docs link", (href) => {
    expect(isDocsHref(href)).toBe(false);
  });
});
