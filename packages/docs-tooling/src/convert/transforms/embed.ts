/**
 * `<Embed url [modal]>` (legacy MarkdownEmbed) -> a static iframe in a
 * `<Frame>`.
 *
 *   <Embed url="https://youtu.be/Bqs95tFcRIU" />
 *
 * becomes
 *
 *   <Frame>
 *     <iframe src="https://www.youtube-nocookie.com/embed/Bqs95tFcRIU" title="YouTube video player" allow="…" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen className="w-full aspect-video" />
 *   </Frame>
 *
 *   <div className="nojs-only">
 *     [https://www.youtube.com/watch?v=Bqs95tFcRIU](https://www.youtube.com/watch?v=Bqs95tFcRIU)
 *   </div>
 *
 * - YouTube URLs (youtu.be, watch?v=, embed/, v/) use the privacy-enhanced
 *   youtube-nocookie.com player. `modal` (thumbnail + modal player) is
 *   dropped: the video is embedded inline.
 * - The YouTube player needs JavaScript, so a `nojs-only` link to the video
 *   follows the frame (shown only when JavaScript is off; see
 *   migration/setup-nojs-fallback.css). The link text is the URL itself, so
 *   it needs no translation in locale pages.
 * - Whimsical boards keep their legacy 380x180 iframe. Any other URL becomes
 *   a plain link, as the legacy component rendered the bare URL.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  type Jsx,
  NOJS_CLASS,
  attr,
  flow,
  isBlankText,
  isJsx,
  paragraph,
  replaceNodes,
  strAttr,
  text,
} from "./_wp2.ts";

export const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

export function youtubeId(url: string): string | undefined {
  if (
    !/^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(
      url,
    )
  )
    return undefined;
  return /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|.*[?&]v=))([\w-]{6,})/.exec(
    url,
  )?.[1];
}

function link(url: string): AstNode {
  return { type: "link", url, title: null, children: [text(url)] };
}

/** The `<Frame><iframe/></Frame>` + no-JS link for a YouTube video id. */
export function youtubeFrame(
  id: string,
  title = "YouTube video player",
): AstNode[] {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  return [
    flow(
      "Frame",
      [],
      [
        flow(
          "iframe",
          [
            attr("src", `https://www.youtube-nocookie.com/embed/${id}`),
            attr("title", title),
            attr("allow", YOUTUBE_ALLOW),
            attr("referrerPolicy", "strict-origin-when-cross-origin"),
            attr("allowFullScreen", true),
            attr("className", "w-full aspect-video"),
          ],
          [],
        ),
      ],
    ),
    flow("div", [attr("className", NOJS_CLASS)], [paragraph([link(watch)])]),
  ];
}

function convert(el: Jsx, warn: (m: string) => void): AstNode[] {
  const url = (strAttr(el, "url") ?? "").trim();
  const id = youtubeId(url);
  if (id) return youtubeFrame(id);
  if (/^(https:\/\/)?whimsical\.com\/embed\//i.test(url)) {
    const width = strAttr(el, "width") ?? "380";
    const height = strAttr(el, "height") ?? "180";
    return [
      flow(
        "Frame",
        [],
        [
          flow(
            "iframe",
            [
              attr("src", url),
              attr("title", "Whimsical board"),
              attr("width", width),
              attr("height", height),
            ],
            [],
          ),
        ],
      ),
      flow("div", [attr("className", NOJS_CLASS)], [paragraph([link(url)])]),
    ];
  }
  warn(`<Embed url="${url}"> is not a YouTube/Whimsical URL; emitted a link`);
  return url ? [paragraph([link(url)])] : [];
}

export const transform: Transform = {
  name: "embed",
  order: 260,
  owner: "WP2",
  appliesTo: (source) => source.includes("<Embed"),
  run(tree, _file, ctx) {
    replaceNodes(tree, (node) => {
      if (isJsx(node, "Embed") && node.type === "mdxJsxFlowElement")
        return convert(node, ctx.warn);
      // `<Embed …/>` alone in a paragraph (inline form).
      if (node.type === "paragraph") {
        const kids = (node.children ?? []).filter((c) => !isBlankText(c));
        if (kids.length === 1 && isJsx(kids[0], "Embed"))
          return convert(kids[0] as Jsx, ctx.warn);
      }
      if (isJsx(node, "Embed"))
        ctx.warn("inline <Embed> inside text was left unconverted");
      return undefined;
    });
  },
};
