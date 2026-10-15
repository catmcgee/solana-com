/**
 * Shim for `next/dynamic` (header bundle). Its only use in the header is
 * InkeepSearchBar's `ssr: false` Inkeep modal, which on solana.com renders
 * nothing until the Inkeep chunk loads. In the docs the search button opens
 * Mintlify's search instead (see ../adapter.js), so the loader is never
 * called and the component renders nothing, as before the chunk loads.
 * (@inkeep/cxkit-react is external in the build: it is never downloaded.)
 */
export default function dynamic() {
  return function DynamicNotLoaded() {
    return null;
  };
}
