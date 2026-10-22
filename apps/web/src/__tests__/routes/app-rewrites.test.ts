import { describe, expect, it } from "vitest";
import {
  ACCELERATE_APP_URL,
  BREAKPOINT_APP_URL,
  MEDIA_APP_URL,
  templatesAppUrl,
} from "@@/apps-urls";
import rewritesAndRedirects from "@@/rewrites-redirects";

const beforeFiles = rewritesAndRedirects.rewrites.beforeFiles;

function expectBeforeFileRewrite(
  source: string,
  destination: string,
  extra?: Record<string, unknown>,
) {
  expect(beforeFiles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source,
        destination,
        locale: false,
        ...extra,
      }),
    ]),
  );
}

function expectSourceIndex(source: string) {
  const index = beforeFiles.findIndex((rewrite) => rewrite.source === source);

  expect(index).toBeGreaterThanOrEqual(0);

  return index;
}

describe("Cross-app rewrites", () => {
  it("proxies app-owned route namespaces to their owning deployments", () => {
    expectBeforeFileRewrite("/news", `${MEDIA_APP_URL}/news`);
    expectBeforeFileRewrite("/changelog", `${MEDIA_APP_URL}/changelog`);
    expectBeforeFileRewrite(
      "/changelog/:path*",
      `${MEDIA_APP_URL}/changelog/:path*`,
    );
    expectBeforeFileRewrite(
      "/:locale/changelog/:path*",
      `${MEDIA_APP_URL}/:locale/changelog/:path*`,
    );
    expectBeforeFileRewrite(
      "/:locale/changelog",
      `${MEDIA_APP_URL}/:locale/changelog`,
    );
    expectBeforeFileRewrite(
      "/podcasts/:path*",
      `${MEDIA_APP_URL}/podcasts/:path*`,
    );
    expectBeforeFileRewrite(
      "/developers/templates/:path*",
      `${templatesAppUrl}/developers/templates/:path*`,
    );
    expectBeforeFileRewrite(
      "/accelerate/:path*",
      `${ACCELERATE_APP_URL}/accelerate/:path*`,
    );
    expectBeforeFileRewrite(
      "/breakpoint/:path*",
      `${BREAKPOINT_APP_URL}/breakpoint/:path*`,
    );
  });

  it("rewrites none of the developer docs (this app renders them)", () => {
    for (const rewrite of beforeFiles) {
      expect(rewrite.source).not.toMatch(
        /^\/(:locale[^/]*\/)?developers\/(:page|docs|cookbook)/,
      );
    }
  });

  it("keeps specific Accelerate asset rewrites before the generic fallback", () => {
    expect(expectSourceIndex("/accelerate-assets/_next/:path+")).toBeLessThan(
      expectSourceIndex("/accelerate-assets/:path+"),
    );
    expect(expectSourceIndex("/accelerate-assets/images/:path+")).toBeLessThan(
      expectSourceIndex("/accelerate-assets/:path+"),
    );
  });

  it("proxies deployed app asset prefixes through the main site", () => {
    expectBeforeFileRewrite(
      "/breakpoint-assets/:path+",
      `${BREAKPOINT_APP_URL}/breakpoint-assets/:path+`,
    );
    expectBeforeFileRewrite(
      "/media-assets/:path+",
      `${MEDIA_APP_URL}/media-assets/:path+`,
    );
    expectBeforeFileRewrite(
      "/templates-assets/:path+",
      `${templatesAppUrl}/templates-assets/:path+`,
    );
    expectBeforeFileRewrite(
      "/accelerate-assets/_next/:path+",
      `${ACCELERATE_APP_URL}/_next/:path+`,
    );
  });

  it("proxies media upload images to the media app image optimizer", () => {
    expectBeforeFileRewrite(
      "/_next/image",
      `${MEDIA_APP_URL}/media-assets/_next/image`,
      {
        has: [{ type: "query", key: "url", value: "/uploads/(.*)" }],
      },
    );
    expectBeforeFileRewrite(
      "/uploads/:path+",
      `${MEDIA_APP_URL}/media-assets/uploads/:path+`,
    );
  });

  it("proxies APIs owned by the media app", () => {
    expectBeforeFileRewrite(
      "/api/developer-updates/latest",
      `${MEDIA_APP_URL}/api/developer-updates/latest`,
    );
    expectBeforeFileRewrite(
      "/api/changelog/:path*",
      `${MEDIA_APP_URL}/api/changelog/:path*`,
    );
    expectBeforeFileRewrite(
      "/api/posts/:path*",
      `${MEDIA_APP_URL}/api/posts/:path*`,
    );
    expectBeforeFileRewrite(
      "/api/upgrades/alpenglow/:path*",
      `${MEDIA_APP_URL}/api/upgrades/alpenglow/:path*`,
    );
  });
});
