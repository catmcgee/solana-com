/** The element Radix portals render into (see shims/radix-portal.jsx). */
export const PORTAL_HOST_ID = "sol-hdr-portals";

export function portalHost() {
  return typeof document === "undefined"
    ? null
    : document.getElementById(PORTAL_HOST_ID);
}
