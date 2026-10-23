"use client";

import dynamic from "next/dynamic";

/**
 * The persistent podcast player, loaded after hydration: it renders nothing
 * until it reads a playing episode from localStorage, so its code doesn't
 * need to ship with the page.
 */
export const PodcastPlayer = dynamic(
  () =>
    import("@solana-com/ui-chrome/persistent-podcast-player").then(
      (m) => m.PersistentPodcastPlayer,
    ),
  { ssr: false },
);
