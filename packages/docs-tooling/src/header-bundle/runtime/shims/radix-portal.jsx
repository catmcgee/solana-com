/**
 * Wrapper for `@radix-ui/react-portal` (header bundle). Radix portals the
 * language menu and the mobile sheet into document.body by default; here
 * they go into the header's own portal host inside #sol-hdr, so the header
 * CSS (every rule scoped to #sol-hdr) applies to them and nothing leaks into
 * Mintlify. An explicit `container` prop still wins. The markup the portal
 * renders is unchanged.
 */
import { forwardRef } from "react";
import * as Real from "sol-header:real-portal";
import { portalHost } from "../portal-host.js";

export * from "sol-header:real-portal";

export const Portal = forwardRef(function Portal(props, ref) {
  return (
    <Real.Portal
      {...props}
      container={props.container ?? portalHost()}
      ref={ref}
    />
  );
});

export const Root = Portal;
