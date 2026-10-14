/**
 * WP7: convert the video-guide components to Mintlify built-ins (spec §3.1).
 * No custom component survives, and everything except the embedded player
 * is in the server HTML, so the pages read fully without JavaScript.
 *
 * | Legacy                         | Mintlify                                   |
 * | ------------------------------ | ------------------------------------------ |
 * | SectionHeading                 | `## title` (+ description / link line)     |
 * | CourseHero                     | `<Card cta arrow>` with subtext + facts    |
 * | CourseList                     | `<Columns cols={2}>` of `<Card>`           |
 * | CourseFacts                    | `**Label:** value · …` paragraph           |
 * | NextUp                         | `<Card title="Next up: …" horizontal>`     |
 * | VideoWithChapters              | `<Frame><iframe/></Frame>` + watch link +  |
 * |                                | ordered list of timestamp links            |
 * | VideoChapterList               | `<Columns cols={2}>` of thumbnail `<Card>` |
 * | ProjectCardGrid                | `<Columns cols={3}>` of thumbnail `<Card>` |
 *
 * `modal` is dropped: cards open the video on YouTube. Thumbnails are the
 * always-present `mqdefault.jpg` (16:9). `Embed` is left to WP2's embed.ts.
 */
import type { AstNode, ConvertContext, Transform } from "../../types.ts";
import {
  formatTime,
  getAttr,
  heading,
  isJsx,
  jsx,
  link,
  list,
  paragraph,
  replaceChild,
  strong,
  text,
  walk,
  youtubeFrame,
  youtubeId,
  youtubeStart,
  youtubeThumb,
  youtubeWatchUrl,
} from "./_collections.ts";

export const COMPONENTS = [
  "SectionHeading",
  "CourseHero",
  "CourseList",
  "CourseFacts",
  "NextUp",
  "VideoWithChapters",
  "VideoChapterList",
  "ProjectCardGrid",
] as const;

interface Course {
  title: string;
  href: string;
  subtext?: string;
  videos?: number;
  projects?: number;
  chapters?: number;
  runtime?: string;
  level?: string;
}

interface VideoItem {
  title: string;
  href?: string;
  subtext?: string;
  duration?: string;
  section?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function need<T>(v: unknown, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v as T;
}

/** Mintlify's heading slug (github-slugger style) for the id check. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

/** "Beginner · 11 videos · 2 hr 58 min" (legacy pill order). */
export function courseFacts(c: Course): AstNode[] {
  const parts: AstNode[][] = [];
  if (c.level) parts.push([strong(c.level)]);
  if (c.videos)
    parts.push([text(`${c.videos} ${c.videos === 1 ? "video" : "videos"}`)]);
  if (c.projects)
    parts.push([
      text(`${c.projects} ${c.projects === 1 ? "project" : "projects"}`),
    ]);
  if (c.chapters)
    parts.push([
      text(`${c.chapters} ${c.chapters === 1 ? "chapter" : "chapters"}`),
    ]);
  if (c.runtime) parts.push([text(c.runtime)]);
  return joinParts(parts);
}

function joinParts(parts: AstNode[][]): AstNode[] {
  const out: AstNode[] = [];
  parts.forEach((p, i) => {
    if (i) out.push(text(" · "));
    out.push(...p);
  });
  // Merge adjacent text nodes so the printed markdown is stable.
  return out.reduce<AstNode[]>((acc, n) => {
    const last = acc[acc.length - 1];
    if (last?.type === "text" && n.type === "text")
      last.value = String(last.value) + String(n.value);
    else acc.push({ ...n });
    return acc;
  }, []);
}

function courseCard(c: Course, extra: Record<string, string | true> = {}) {
  const body: AstNode[] = [];
  if (c.subtext) body.push(paragraph([text(c.subtext)]));
  const facts = courseFacts(c);
  if (facts.length) body.push(paragraph(facts));
  return jsx(
    "Card",
    {
      title: need<string>(c.title, "course.title"),
      href: need<string>(c.href, "course.href"),
      ...extra,
    },
    body,
  );
}

/** Thumbnail card for one video (or a draft entry without `href`). */
function videoCard(item: VideoItem, eyebrow: string | undefined, img: boolean) {
  const id = item.href ? youtubeId(item.href) : null;
  const href = item.href
    ? id
      ? youtubeWatchUrl(id, youtubeStart(item.href))
      : item.href
    : undefined;
  const body: AstNode[] = [];
  if (eyebrow) body.push(paragraph([strong(eyebrow)]));
  if (item.subtext) body.push(paragraph([text(item.subtext)]));
  return jsx(
    "Card",
    {
      title: need<string>(item.title, "title"),
      href,
      img: img && id ? youtubeThumb(id) : undefined,
    },
    body,
  );
}

/** Split items into `### section` headings + Columns runs. */
function videoGrid(
  items: VideoItem[],
  cols: number,
  card: (item: VideoItem, i: number) => AstNode,
): AstNode[] {
  const out: AstNode[] = [];
  let run: AstNode[] = [];
  const flush = () => {
    if (run.length) out.push(jsx("Columns", { cols }, run));
    run = [];
  };
  items.forEach((item, i) => {
    if (item.section) {
      flush();
      out.push(heading(3, item.section));
    }
    run.push(card(item, i));
  });
  flush();
  return out;
}

export function convertComponent(
  node: AstNode,
  ctx: Pick<ConvertContext, "warn">,
): AstNode[] {
  const name = node.name as (typeof COMPONENTS)[number];
  switch (name) {
    case "SectionHeading": {
      const title = need<string>(str(getAttr(node, "title")), "title");
      const id = str(getAttr(node, "id"));
      if (id && id !== slug(title))
        ctx.warn(
          `SectionHeading id "${id}" differs from the Mintlify anchor "${slug(title)}"`,
        );
      const out = [heading(2, title)];
      const description = str(getAttr(node, "description"));
      if (description) out.push(paragraph([text(description)]));
      const l = getAttr(node, "link") as
        | { label: string; href: string }
        | undefined;
      if (l) out.push(paragraph([link(l.href, `${l.label} →`)]));
      return out;
    }
    case "CourseHero": {
      const course = need<Course>(getAttr(node, "course"), "course");
      const cta = str(getAttr(node, "cta")) ?? "Start the course";
      return [courseCard(course, { icon: "circle-play", cta, arrow: true })];
    }
    case "CourseList": {
      const courses = need<Course[]>(getAttr(node, "courses"), "courses");
      return [
        jsx(
          "Columns",
          { cols: 2 },
          courses.map((c) => courseCard(c)),
        ),
      ];
    }
    case "CourseFacts": {
      const facts = need<{ label: string; value: string; href?: string }[]>(
        getAttr(node, "facts"),
        "facts",
      );
      const parts = facts.map((f) => [
        strong(`${f.label}:`),
        text(" "),
        f.href ? link(f.href, f.value) : text(f.value),
      ]);
      return [paragraph(joinParts(parts))];
    }
    case "NextUp": {
      const title = need<string>(str(getAttr(node, "title")), "title");
      const href = need<string>(str(getAttr(node, "href")), "href");
      return [
        jsx("Card", {
          title: `Next up: ${title}`,
          href,
          icon: "arrow-right",
          horizontal: true,
        }),
      ];
    }
    case "VideoWithChapters": {
      const id = need<string>(str(getAttr(node, "videoId")), "videoId");
      const title = need<string>(str(getAttr(node, "title")), "title");
      const chapters = need<{ title: string; start: number }[]>(
        getAttr(node, "chapters"),
        "chapters",
      );
      return [
        youtubeFrame(id, title),
        paragraph([link(youtubeWatchUrl(id), `Watch ${title} on YouTube`)]),
        paragraph([strong("Chapters")]),
        list(
          chapters.map((c) => [
            link(
              youtubeWatchUrl(id, c.start),
              `${formatTime(c.start)} ${c.title}`,
            ),
          ]),
          true,
        ),
      ];
    }
    case "VideoChapterList":
    case "ProjectCardGrid": {
      const isList = name === "VideoChapterList";
      if (getAttr(node, "playlistId") !== undefined)
        throw new Error(
          `${name} playlistId needs a network fetch; list the videos statically`,
        );
      const items = need<VideoItem[]>(
        getAttr(node, isList ? "chapters" : "projects"),
        isList ? "chapters" : "projects",
      );
      const label = str(getAttr(node, "label"));
      const timestamps = getAttr(node, "timestamps") === true;
      return videoGrid(items, isList ? 2 : 3, (item, i) => {
        const time =
          timestamps && item.href
            ? formatTime(youtubeStart(item.href))
            : undefined;
        const head = [
          label ? `${label} ${i + 1}` : undefined,
          time ?? item.duration,
        ].filter(Boolean);
        return videoCard(
          item,
          head.length ? head.join(" · ") : undefined,
          !timestamps,
        );
      });
    }
    default:
      return [node];
  }
}

export const transform: Transform = {
  name: "video-guides",
  order: 620,
  owner: "WP7",
  appliesTo: (src) => COMPONENTS.some((c) => src.includes(`<${c}`)),
  run(tree, _file, ctx) {
    walk(tree, (n, parent) => {
      if (!parent || !isJsx(n)) return;
      if (!(COMPONENTS as readonly string[]).includes(n.name as string)) return;
      if (n.type !== "mdxJsxFlowElement") {
        ctx.error(`${String(n.name)} used inline; expected a block element`);
        return;
      }
      replaceChild(parent, n, convertComponent(n, ctx));
    });
  },
};
