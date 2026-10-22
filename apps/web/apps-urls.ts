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

// Docs: rendered by this app (Fumadocs, src/app/[locale]/developers/docs).

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
console.log("templatesAppUrl", templatesAppUrl);
console.log("ACCELERATE_APP_URL", ACCELERATE_APP_URL);
console.log("BREAKPOINT_APP_URL", BREAKPOINT_APP_URL);
