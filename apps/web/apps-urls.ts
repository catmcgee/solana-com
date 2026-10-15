import { withRelatedProject } from "@vercel/related-projects";

// Media app URLs
const vercelMediaUrl = withRelatedProject({
  projectName: "solana-com-media",
  defaultHost: "https://solana-com-media.vercel.app",
});
const developmentMediaUrl = "http://localhost:3002";

export const MEDIA_APP_URL =
  process.env.NEXT_PUBLIC_MEDIA_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? vercelMediaUrl
    : developmentMediaUrl);

// Docs: hosted by Mintlify (decisions.md). The retired `solana-com-docs`
// Vercel project is no longer a rewrite target.
//
// Mintlify is root-hosted on its free Hobby plan, so Mintlify file paths equal
// public paths and only the origin changes between environments. Override with
// MINTLIFY_ORIGIN (e.g. a branch preview, or `http://localhost:3003` for
// `pnpm --filter @workspace/docs-tooling mint:dev`).
//
// NOTE: to self-host later, upgrade to Mintlify Enterprise and deploy its
// static export to a Vercel project, then change ONLY this origin. See the
// MINTLIFY block in rewrites-redirects.ts for the full recommendation.
const defaultMintlifyOrigin = "https://solana-f31f4a8d.mintlify.site";

export const MINTLIFY_ORIGIN = (
  process.env.MINTLIFY_ORIGIN || defaultMintlifyOrigin
).replace(/\/+$/, "");

/** @deprecated The docs app is Mintlify now; use MINTLIFY_ORIGIN. */
export const DOCS_APP_URL = MINTLIFY_ORIGIN;

// Templates app URLs
const vercelTemplatesUrl = withRelatedProject({
  projectName: "templates",
  defaultHost: "https://solana-templates.vercel.app",
});
const developmentTemplatesUrl = "http://localhost:3001";

export const templatesAppUrl =
  process.env.NEXT_PUBLIC_TEMPLATES_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? vercelTemplatesUrl
    : developmentTemplatesUrl);

// Accelerate app URLs
const vercelAccelerateUrl = withRelatedProject({
  projectName: "solana-com-accelerate",
  defaultHost: "https://solana-com-accelerate.vercel.app",
});
const developmentAccelerateUrl = "http://localhost:3004";

export const ACCELERATE_APP_URL =
  process.env.NEXT_PUBLIC_ACCELERATE_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? vercelAccelerateUrl
    : developmentAccelerateUrl);

// Breakpoint app URLs
const vercelBreakpointUrl = withRelatedProject({
  projectName: "solana-com-breakpoint-2",
  defaultHost: "https://solana-com-breakpoint-2.vercel.app",
});
const developmentBreakpointUrl = "http://localhost:3005";

export const BREAKPOINT_APP_URL =
  process.env.NEXT_PUBLIC_BREAKPOINT_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? vercelBreakpointUrl
    : developmentBreakpointUrl);

console.log("MEDIA_APP_URL", MEDIA_APP_URL);
console.log("MINTLIFY_ORIGIN", MINTLIFY_ORIGIN);
console.log("templatesAppUrl", templatesAppUrl);
console.log("ACCELERATE_APP_URL", ACCELERATE_APP_URL);
console.log("BREAKPOINT_APP_URL", BREAKPOINT_APP_URL);
