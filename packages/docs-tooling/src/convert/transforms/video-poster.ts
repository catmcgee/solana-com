/**
 * Inline YouTube players with a server-rendered poster (2026-10-16), the way
 * the old docs (`YoutubeIFrame`, `VideoWithChapters`) and solana.com show
 * videos: a thumbnail with a play button that becomes the player in place.
 *
 * The renderer at conversion time drew `<iframe>` client-side only, so the server HTML had an
 * empty box plus a "Watch on YouTube" link. Every YouTube iframe (bare or as
 * the only child of a `<Frame>`) becomes:
 *
 *   <a className="sol-yt" href="https://youtu.be/ID?t=S" data-video="ID"
 *      aria-label="Title"><img src="https://i.ytimg.com/vi/ID/hqdefault.jpg"
 *      alt="" noZoom /><span className="sol-yt-play" /></a>
 *
 * (one line, in a paragraph).
 *
 * `apps/docs/video-chapters.js` swaps it for the youtube-nocookie iframe
 * with `autoplay=1` on click (chapter links in `.sol-chapters` do the same at
 * their timestamp). Without JavaScript it is a plain link to the video at the
 * same start time. Playlists (`embed/videoseries?list=`) keep `data-list` and
 * use their first video's thumbnail from PLAYLIST_THUMBS (transforms never
 * fetch); an unknown playlist is left as an iframe with a warning.
 *
 * The no-JS link that earlier transforms wrote right after the player (a
 * paragraph, or a `nojs-only` div, holding only a link to the same video) is
 * removed: the poster is that link now. Styles: `styles/video.css`.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  getAttr,
  isJsx,
  jsx,
  paragraph,
  toText,
  walk,
  youtubeId,
  youtubeStart,
  youtubeWatchUrl,
} from "./_collections.ts";

/** First video of each embedded playlist (its thumbnail). */
export const PLAYLIST_THUMBS: Record<string, string> = {
  // Surfpool 101 Series (tools/surfpool/resources/video-tutorials)
  "PL0FMgRjJMRzO1FdunpMS-aUS4GNkgyr3T": "tibT9ZPb8wE",
};

const ID_RE = /^[\w-]{11}$/;
const GENERIC_TITLE = /^(youtube( video)?( player)?|video)$/i;

/** Always-present thumbnail (4:3 with letterbox bars; CSS crops to 16:9). */
export const posterThumb = (id: string) =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

interface Video {
  id: string;
  start: number;
  list?: string;
}

/** The video an iframe `src` embeds, or null when it isn't YouTube. */
export function embeddedVideo(src: string): Video | null | "unknown-list" {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) return null;
  const list = url.searchParams.get("list");
  if (url.pathname === "/embed/videoseries" && list) {
    const id = PLAYLIST_THUMBS[list];
    return id ? { id, start: 0, list } : "unknown-list";
  }
  const id = youtubeId(src);
  if (!id || !ID_RE.test(id)) return null;
  return { id, start: youtubeStart(src) };
}

export function poster(v: Video, title: string): AstNode {
  const href = v.list
    ? `https://www.youtube.com/playlist?list=${v.list}`
    : youtubeWatchUrl(v.id, v.start);
  // One line inside a paragraph (oxfmt-stable; no blank lines in the JSX).
  return paragraph([
    jsx(
      "a",
      {
        className: "sol-yt",
        href,
        "data-video": v.id,
        "data-list": v.list,
        "aria-label": title,
      },
      [
        jsx(
          "img",
          { src: posterThumb(v.id), alt: "", noZoom: true },
          [],
          false,
        ),
        jsx("span", { className: "sol-yt-play" }, [], false),
      ],
      false,
    ),
  ]);
}

/** The only YouTube iframe a node holds (itself, or a Frame's only child). */
function soleIframe(n: AstNode): AstNode | null {
  if (isJsx(n, "iframe")) return n;
  if (!isJsx(n, "Frame")) return null;
  const kids = (n.children ?? []).filter(
    (c) => !(c.type === "text" && !String(c.value).trim()),
  );
  return kids.length === 1 && isJsx(kids[0], "iframe") ? kids[0]! : null;
}

/** Ids of the videos a link points at, when `n` is only that one link. */
function soleVideoLink(n: AstNode): string | null {
  let target: AstNode | undefined = n;
  // nojs-only div -> paragraph -> link
  if (isJsx(target, "div")) {
    const cls = getAttr(target, "className");
    if (typeof cls !== "string" || !cls.split(/\s+/).includes("nojs-only"))
      return null;
    const kids = (target.children ?? []).filter(
      (c) => !(c.type === "text" && !String(c.value).trim()),
    );
    if (kids.length !== 1) return null;
    target = kids[0];
  }
  if (target?.type !== "paragraph") return null;
  const kids = (target.children ?? []).filter(
    (c) => !(c.type === "text" && !String(c.value).trim()),
  );
  if (kids.length !== 1 || kids[0]!.type !== "link") return null;
  const url = String(kids[0]!.url);
  const list = /[?&]list=([\w-]+)/.exec(url)?.[1];
  if (list && PLAYLIST_THUMBS[list]) return PLAYLIST_THUMBS[list]!;
  return youtubeId(url);
}

function containsPoster(n: AstNode, id: string): boolean {
  let found = false;
  walk(n, (c) => {
    if (isJsx(c, "a") && getAttr(c, "data-video") === id) found = true;
  });
  return found;
}

export const transform: Transform = {
  name: "video-poster",
  order: 660,
  owner: "video tutorials (2026-10-16)",
  appliesTo: (src) => src.includes("<iframe") && /youtube/i.test(src),
  run(tree, file, ctx) {
    const played = new Set<string>();
    const pageTitle =
      typeof file.frontmatter.title === "string" ? file.frontmatter.title : "";
    walk(tree, (n, parent) => {
      if (!parent) return;
      const iframe = soleIframe(n);
      if (!iframe) return;
      const src = getAttr(iframe, "src");
      if (typeof src !== "string") return;
      const v = embeddedVideo(src);
      if (v === null) return;
      if (v === "unknown-list") {
        ctx.warn(
          `${file.path}: playlist ${src} has no PLAYLIST_THUMBS entry; left as an iframe`,
        );
        return;
      }
      const own = getAttr(iframe, "title");
      const title =
        typeof own === "string" && own.trim() && !GENERIC_TITLE.test(own.trim())
          ? own.trim()
          : pageTitle || toText(iframe) || "Video";
      const kids = parent.children!;
      kids.splice(kids.indexOf(n), 1, poster(v, title));
      played.add(v.id);
    });
    if (!played.size) return;

    // Drop the no-JS watch link that follows a player (now the poster).
    walk(tree, (n) => {
      const kids = n.children;
      if (!kids) return;
      for (let i = kids.length - 1; i > 0; i--) {
        const id = soleVideoLink(kids[i]!);
        if (!id || !played.has(id)) continue;
        // The previous non-whitespace sibling must hold that video's poster.
        let j = i - 1;
        while (
          j >= 0 &&
          kids[j]!.type === "text" &&
          !String(kids[j]!.value).trim()
        )
          j--;
        if (j >= 0 && containsPoster(kids[j]!, id)) kids.splice(i, 1);
      }
    });
  },
};
