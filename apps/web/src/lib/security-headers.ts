/**
 * Response security headers for every apps/web path, including the docs that
 * rewrites-redirects.ts proxies to Mintlify. next.config.ts applies them
 * through `headers()`; the docs head injection (lib/docs-edge/head-inject.ts)
 * builds its own responses in middleware and sets them itself.
 *
 * Preview (staging) deployments stay out of search engines. VERCEL_ENV is set
 * by `vercel build` and at runtime; NEXT_PUBLIC_VERCEL_ENV only when system
 * env vars are exposed. See migration/PRE_PRODUCTION.md.
 */
export function getSecurityHeaders(
  env: Record<string, string | undefined> = process.env,
): Array<{ key: string; value: string }> {
  const headers = [
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-XSS-Protection", value: "1; mode=block" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  ];
  if (
    env.VERCEL_ENV === "preview" ||
    env.NEXT_PUBLIC_VERCEL_ENV === "preview"
  ) {
    headers.push({ key: "X-Robots-Tag", value: "noindex" });
  }
  return headers;
}
