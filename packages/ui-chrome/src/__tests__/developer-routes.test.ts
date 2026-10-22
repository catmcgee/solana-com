import { describe, expect, it } from "vitest";

import {
  isDocsChromeRoute,
  isDocsPageRoute,
  isThemeRoute,
  shouldShowDevelopersNav,
  shouldShowDocsSidebarToggle,
} from "../developer-routes";

describe("developer route matching", () => {
  it("shows the developer nav on docs and nested developer routes", () => {
    expect(shouldShowDevelopersNav("/developers/templates")).toBe(true);
    expect(shouldShowDevelopersNav("/de/developers/cookbook")).toBe(true);
    expect(shouldShowDevelopersNav("/docs")).toBe(true);
    expect(shouldShowDevelopersNav("/fr/docs/rpc")).toBe(true);
    expect(shouldShowDevelopersNav("/developers/docs")).toBe(true);
    expect(shouldShowDevelopersNav("/fr/developers/docs/rpc")).toBe(true);
  });

  it("hides the developer nav on the /developers landing itself", () => {
    expect(shouldShowDevelopersNav("/developers")).toBe(false);
    expect(shouldShowDevelopersNav("/developers/")).toBe(false);
    expect(shouldShowDevelopersNav("/es/developers")).toBe(false);
    expect(shouldShowDevelopersNav("/de/developers")).toBe(false);
    expect(shouldShowDevelopersNav("/developers?ref=nav")).toBe(false);
  });

  it("does not show the developer nav on unrelated paths containing the same text", () => {
    expect(shouldShowDevelopersNav("/developership")).toBe(false);
    expect(shouldShowDevelopersNav("/data")).toBe(false);
    expect(shouldShowDevelopersNav("/de/data")).toBe(false);
    expect(shouldShowDevelopersNav("/metadata")).toBe(false);
    expect(shouldShowDevelopersNav("/news/data")).toBe(false);
  });

  it("keeps the docs sidebar toggle scoped to docs-owned routes", () => {
    expect(shouldShowDocsSidebarToggle("/docs")).toBe(true);
    expect(shouldShowDocsSidebarToggle("/fr/docs/rpc")).toBe(true);
    expect(shouldShowDocsSidebarToggle("/developers/cookbook")).toBe(true);
    expect(shouldShowDocsSidebarToggle("/developers/docs")).toBe(true);
    expect(shouldShowDocsSidebarToggle("/fr/developers/docs/rpc")).toBe(true);
    expect(shouldShowDocsSidebarToggle("/developers/payments")).toBe(false);
    expect(shouldShowDocsSidebarToggle("/data")).toBe(false);
  });

  it("keeps theme support on docs developer routes", () => {
    expect(isThemeRoute("/docs/rpc")).toBe(true);
    expect(isThemeRoute("/developers/docs/rpc")).toBe(true);
    expect(isThemeRoute("/ja/developers/docs")).toBe(true);
    expect(isThemeRoute("/developers/bootcamp/foundations")).toBe(true);
    expect(isThemeRoute("/data")).toBe(false);
    expect(isThemeRoute("/database")).toBe(false);
  });

  it("adds light/dark support to the exact /learn landing", () => {
    expect(isThemeRoute("/learn")).toBe(true);
    expect(isThemeRoute("/learn/")).toBe(true);
    expect(isThemeRoute("/fr/learn")).toBe(true);
  });

  it("leaves the /developers landing's theme to its docs chrome", () => {
    expect(isThemeRoute("/developers")).toBe(false);
    expect(isThemeRoute("/developers/")).toBe(false);
    expect(isThemeRoute("/ja/developers")).toBe(false);
    expect(isThemeRoute("/ar/developers")).toBe(false);
    expect(isThemeRoute("/developers?ref=nav")).toBe(false);
  });

  it("gives only the exact /developers landing the docs chrome", () => {
    expect(isDocsChromeRoute("/developers")).toBe(true);
    expect(isDocsChromeRoute("/developers/")).toBe(true);
    expect(isDocsChromeRoute("/ja/developers")).toBe(true);
    expect(isDocsChromeRoute("/developers?ref=nav")).toBe(true);
    expect(isDocsChromeRoute("/developers/templates")).toBe(false);
    expect(isDocsChromeRoute("/docs")).toBe(false);
    expect(isDocsChromeRoute("/developership")).toBe(false);
    expect(isDocsChromeRoute(null)).toBe(false);
  });

  it("gives the docs pages the docs chrome, not the /learn landing", () => {
    for (const path of [
      "/developers/docs",
      "/developers/docs/core/accounts",
      "/ja/developers/docs/payments",
      "/developers/cookbook/wallets/create-keypair",
      "/learn/what-is-solana",
      "/fr/learn/what-is-solana",
    ]) {
      expect(isDocsChromeRoute(path), path).toBe(true);
      expect(isDocsPageRoute(path), path).toBe(true);
    }
    expect(isDocsPageRoute("/developers")).toBe(false);
    expect(isDocsChromeRoute("/learn")).toBe(false);
    expect(isDocsChromeRoute("/developers/docsy")).toBe(false);
  });

  it("keeps /developers subpages dark-only", () => {
    expect(isThemeRoute("/developers/payments")).toBe(false);
    expect(isThemeRoute("/de/developers/defi")).toBe(false);
    expect(isThemeRoute("/developers/templates")).toBe(false);
    expect(isThemeRoute("/developership")).toBe(false);
    expect(isThemeRoute("/learning")).toBe(false);
    expect(isThemeRoute(null)).toBe(false);
  });
});
