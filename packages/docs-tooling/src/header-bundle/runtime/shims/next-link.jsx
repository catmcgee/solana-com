/**
 * Shim for `next/link` (header bundle): a plain <a>. Next.js renders the
 * same element; without its client router a click is a normal page load.
 * Used through next-intl's Link (@workspace/i18n/routing).
 */
import { forwardRef } from "react";

function toHref(href) {
  if (typeof href === "string") return href;
  if (!href) return "";
  const { pathname = "", query, hash = "" } = href;
  const search = query ? `?${new URLSearchParams(query)}` : "";
  return `${pathname}${search}${hash ? `#${String(hash).replace(/^#/, "")}` : ""}`;
}

const Link = forwardRef(function Link(
  {
    href,
    as,
    replace,
    scroll,
    shallow,
    passHref,
    prefetch,
    locale,
    legacyBehavior,
    onNavigate,
    unstable_dynamicOnHover,
    ...rest
  },
  ref,
) {
  return <a ref={ref} href={toHref(as ?? href)} {...rest} />;
});

export default Link;
