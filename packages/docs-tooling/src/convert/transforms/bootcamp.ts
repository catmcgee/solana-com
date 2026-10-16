/**
 * WP7: inject each bootcamp lesson's video and resources (spec §3.1).
 *
 * The Fumadocs lesson route rendered a YouTube iframe and "See the code"
 * links from the TypeScript curriculum, not from MDX. Mintlify renders MDX
 * only, so the curriculum data is written into every lesson file, in every
 * locale:
 *
 *   {/* bootcamp:video *\/}            <- idempotency marker
 *   <Frame><iframe …/></Frame>         <- client-rendered by Mintlify
 *   [Watch on YouTube](https://youtu.be/ID)   <- server HTML, works without JS
 *   … lesson body …
 *   ## Resources                       <- only when the lesson has links
 *   - [See the code](repo)
 *
 * When the marker is present the file is left alone (a later Lingo run may
 * have translated the injected labels); the transform only warns when the
 * embedded video id no longer matches the curriculum.
 *
 * Labels are English in every locale, as in the legacy route (it hard-coded
 * "See the code"). The iframe title uses the page's own (translated) title.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  developersLearnCourses,
  type DevelopersLearnLesson,
} from "../../../data/bootcamp/developers-learn-curriculum.ts";
import {
  contentStart,
  flowComment,
  hasFlowComment,
  heading,
  isJsx,
  link,
  list,
  paragraph,
  walk,
  youtubeFrame,
  youtubeId,
  youtubeWatchUrl,
} from "./_collections.ts";

export const MARKER = "bootcamp:video";

/** `developers/bootcamp/<course>/<lesson>.mdx`, optionally locale-prefixed. */
const LESSON_RE =
  /(?:^|\/)developers\/bootcamp\/([a-z0-9-]+)\/([a-z0-9-]+)\.mdx?$/;

export function lessonForPath(
  filePath: string,
): { course: string; lesson: DevelopersLearnLesson } | null | undefined {
  const m = filePath.match(LESSON_RE);
  if (!m || m[2] === "index") return undefined; // not a lesson page
  const course = developersLearnCourses.find((c) => c.slug === m[1]);
  const lesson = course?.lessons.find((l) => l.slug === m[2]);
  return lesson ? { course: m[1]!, lesson } : null;
}

/** Display label for a curriculum resource link (legacy route semantics). */
export const resourceLabel = (label: string) =>
  label === "Bootcamp repo" ? "See the code" : label;

function embeddedIds(tree: AstNode): string[] {
  const ids: string[] = [];
  walk(tree, (n) => {
    // The video-poster transform turns the iframe into an `a.sol-yt` poster.
    if (isJsx(n, "a")) {
      const id = (n.attributes as { name: string; value: unknown }[]).find(
        (a) => a.name === "data-video",
      )?.value;
      if (typeof id === "string") ids.push(id);
    }
    if (isJsx(n, "iframe")) {
      const src = (n.attributes as { name: string; value: unknown }[]).find(
        (a) => a.name === "src",
      )?.value;
      const id = typeof src === "string" ? youtubeId(src) : null;
      if (id) ids.push(id);
    }
  });
  return ids;
}

export const transform: Transform = {
  name: "bootcamp",
  order: 610,
  owner: "WP7",
  appliesTo: (_src, file) =>
    file.collection === "bootcamp" && lessonForPath(file.path) !== undefined,
  run(tree, file, ctx) {
    const found = lessonForPath(file.path);
    if (found === undefined) return;
    if (found === null) {
      ctx.warn(
        `lesson ${file.path} is not in data/bootcamp/developers-learn-curriculum.ts; no video injected`,
      );
      return;
    }
    const { lesson } = found;
    const id = lesson.video.url ? youtubeId(lesson.video.url) : null;

    if (hasFlowComment(tree, MARKER)) {
      if (id && !embeddedIds(tree).includes(id))
        ctx.warn(
          `video for ${lesson.slug} changed in the curriculum (${id}); remove the ${MARKER} block to re-inject`,
        );
      return;
    }

    const title =
      typeof file.frontmatter.title === "string" && file.frontmatter.title
        ? file.frontmatter.title
        : lesson.title;

    const top: AstNode[] = [];
    if (id) {
      top.push(
        flowComment(MARKER),
        youtubeFrame(id, `${title} video`),
        paragraph([link(youtubeWatchUrl(id), "Watch on YouTube")]),
      );
    } else if (lesson.video.url) {
      // Not a YouTube URL: the legacy route showed an "Open video" link.
      top.push(
        flowComment(MARKER),
        paragraph([link(lesson.video.url, "Open video")]),
      );
    }

    const resources = lesson.resourceLinks ?? [];
    const bottom: AstNode[] = resources.length
      ? [
          heading(2, "Resources"),
          list(resources.map((r) => [link(r.href, resourceLabel(r.label))])),
        ]
      : [];
    if (bottom.length && !top.length) top.push(flowComment(MARKER));
    if (!top.length) return; // nothing to inject (video not published yet)

    const kids = tree.children!;
    kids.splice(contentStart(tree), 0, ...top);
    kids.push(...bottom);
  },
};
