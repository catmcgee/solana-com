/**
 * gen:paths (WP8b, spec §3.4 item 2 and 6).
 *
 *   tsx src/generators/paths.ts [--check] [--sync] [--init]
 *
 * Source: apps/docs/paths/paths.en.json (+ paths.<loc>.json from Lingo).
 *
 * ```jsonc
 * {
 *   "_ui": { "step": "Step", … },            // optional UI strings (Lingo translates)
 *   "checkout": {
 *     "tab": "payments", "label": "Payments", "job": "Accept dollar payments",
 *     "name": "Build a checkout", "time": "~30 min", "summary": "…",
 *     "intro": "/docs/payments/checkout",
 *     "first": 0,                             // 0-based step that is the "first win"
 *     "steps": [["/docs/payments/checkout/try-it", "Pay as a customer", "optional summary"], …],
 *     "after": { "href": "/docs/payments", "title": "…", "summary": "…" },   // optional
 *     "demo": {                              // optional run-it-yourself panel
 *       "component": "checkout",             // checkout | paywall | asset | trade (stage style)
 *       "title": "Demo Sticker Shop",
 *       "success": "…",
 *       "stage": [{ "label": "Holographic sticker", "sub": "1.00 USDC",
 *                   "states": [["todo", "Not paid yet"], ["warn", "Paid, checking…"], ["ok", "Paid and confirmed"]] }],
 *       "steps": [{ "label": "…", "description": "…",
 *                   "output": "paths/payments/checkout/pay.output.txt" }],
 *       "checks": {                          // optional second panel: refusals
 *         "title": "…",                      // kept out of the success path
 *         "steps": [{ "label": "…", "description": "…", "output": "…" }]
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * Output, per language with a source file, under snippets/paths/<lang>/<key>/:
 * - `stepper-<n>.mdx`, n = 0 (intro page, nothing current) … N (step N
 *   current). A `<div role="navigation">` with an `<ol>`; the current step's
 *   link carries `aria-current="step"`. Raw `<nav>` is dropped by Mintlify.
 * - `next-<n>.mdx`: a horizontal `<Card>` to step n+1 (n = 0 … N-1), and
 *   `next-<N>.mdx` to `after` when it is set.
 * - `card.mdx`: the path card for job pickers and hubs.
 * - `start.mdx`: the same card for the path intro, pointing at step 1
 *   (the mockup's "Start building" block under the flow).
 * - "Open tutorial in Playground": every `stepper-<n>.mdx` carries the
 *   compact button in its header row, and `playground.mdx` is the prominent
 *   block for the step that runs the code on your machine (import it at the
 *   top of that page). Both open the tutorial's whole example folder
 *   (`tutorialDir`: the folder the demo outputs live in, else the one
 *   `packages/docs-examples/paths/<domain>/<key>`), with the folder's kind
 *   from examples/playground.ts. They are server-rendered disabled (no href,
 *   greyed, tooltip); apps/docs/playground.js enables them when the kind is
 *   in its `CONFIG.enabledKinds`. A path without an example folder gets the
 *   disabled button with no source, and a warning.
 * - `demo.mdx` (when `demo` is set): the terminal panel of
 *   src/lib/terminal.ts, all server-rendered: the stage (one row per
 *   `stage` entry, one pill per progress value), the numbered steps with
 *   their descriptions, and every step's recorded output with the prompt
 *   commands and result badges from the `<stem>.run.json` next to the
 *   `<stem>.output.txt`. Without JavaScript it reads in full (final stage,
 *   all output); run-examples.js turns it into a step-by-step run. A step
 *   whose recorded output is missing (WP5 has not recorded it yet) is
 *   generated without output, the panel gets no Run controls
 *   (`data-norun`), and it is reported.
 * - `checks.mdx` (when `demo.checks` is set): a second, separate terminal
 *   panel for what the code refuses (a wrong amount, a reused payment). It
 *   has no stage and no success message, so a refusal never sits inside the
 *   demo's success state. Import it under its own heading on the page.
 * - A step's output may be a variant recording, `<stem>.<variant>.output.txt`
 *   (one slice of a run): its source file is still `<stem>.<ext>`.
 *
 * `--sync` only re-points `/snippets/paths/<lang>/` imports in locale pages;
 * `--check` runs that in memory and fails when a page would change.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../lib/paths.ts";
import { DEFAULT_LOCALE } from "../lib/locales.ts";
import {
  folderKind,
  playgroundFolderSource,
  type PlaygroundKind,
} from "../examples/playground.ts";
import { playgroundMarker } from "../examples/render.ts";
import {
  applyOutputs,
  checkInlineMarkdown,
  emptyResult,
  finish,
  header,
  isMain,
  isRecord,
  attr,
  localizeHref,
  mdInline,
  mdText,
  pageFileFor,
  parseFlags,
  printResult,
  readJson,
  resolveDocsRoot,
  sourceLanguages,
  syncPages,
  syncSnippetImports,
  uiStrings,
  type GeneratorOptions,
  type GeneratorResult,
  type Problem,
} from "./_lib.ts";
import {
  DEFAULT_TERM_LABELS,
  readRunMeta,
  renderTerminal,
  TONES,
  type TermLabels,
  type TermStageRow,
  type Tone,
} from "../lib/terminal.ts";

export const PATH_UI = {
  step: "Step",
  firstWin: "First win",
  done: "Done",
  next: "Next",
  start: "Start the tutorial",
  steps: "steps",
  demoEnv: DEFAULT_TERM_LABELS.env,
  demoRun: DEFAULT_TERM_LABELS.run,
  demoRunStep: DEFAULT_TERM_LABELS.runStep,
  demoNext: DEFAULT_TERM_LABELS.next,
  demoRunAll: DEFAULT_TERM_LABELS.runAll,
  demoAgain: DEFAULT_TERM_LABELS.again,
  demoRunning: DEFAULT_TERM_LABELS.running,
  demoSending: DEFAULT_TERM_LABELS.sending,
  demoRequesting: DEFAULT_TERM_LABELS.requesting,
  demoCalling: DEFAULT_TERM_LABELS.calling,
  demoConfirming: DEFAULT_TERM_LABELS.confirming,
  demoDone: DEFAULT_TERM_LABELS.done,
  demoCopy: DEFAULT_TERM_LABELS.copy,
  demoCopied: DEFAULT_TERM_LABELS.copied,
  demoOutput: DEFAULT_TERM_LABELS.output,
  playground: "Open tutorial in Playground",
  playgroundOff: "Not available for this tutorial yet",
  playgroundNote:
    "The files from every step of this tutorial, together in one project.",
};
export type PathUi = typeof PATH_UI;

/** Demo kinds: the stage style (styles/demo.css `[data-stage]`). */
export const DEMO_KINDS = ["checkout", "paywall", "asset", "trade"] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];

export interface PathStep {
  href: string;
  title: string;
  summary?: string;
}
export interface DemoStep {
  label: string;
  description?: string;
  /**
   * Path of the recorded output, relative to packages/docs-examples. Prompt
   * commands and result badges come from the `.run.json` next to it.
   */
  output: string;
}
export interface PathDef {
  key: string;
  tab: string;
  label: string;
  job: string;
  name: string;
  time: string;
  summary?: string;
  intro: string;
  first?: number;
  steps: PathStep[];
  after?: PathStep;
  demo?: {
    component: DemoKind;
    title: string;
    success?: string;
    stage?: TermStageRow[];
    steps: DemoStep[];
    checks?: DemoChecks;
  };
}
/** A separate panel of refusals next to a demo (no stage, no success). */
export interface DemoChecks {
  title: string;
  steps: DemoStep[];
}
export interface PathsSource {
  lang: string;
  ui: PathUi;
  paths: PathDef[];
}

const KEY_RE = /^[a-z][a-z0-9-]*$/;
const PATH_FIELDS = new Set([
  "tab",
  "label",
  "job",
  "name",
  "time",
  "summary",
  "intro",
  "first",
  "steps",
  "after",
  "demo",
]);

export function pathsDir(docsRoot: string) {
  return path.join(docsRoot, "paths");
}
export const examplesRoot = path.join(repoRoot, "packages", "docs-examples");

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Validate one paths.<lang>.json. Locale files are merged over English:
 * translatable strings come from the locale, hrefs, keys, order, `first`,
 * demo components and outputs always come from English (Lingo locks them).
 */
export function parsePaths(
  raw: unknown,
  file: string,
  problems: Problem[],
  english?: PathsSource,
): PathsSource {
  const err = (message: string) =>
    problems.push({ level: "error", file, message });
  const out: PathsSource = {
    lang: DEFAULT_LOCALE,
    ui: { ...PATH_UI },
    paths: [],
  };
  if (!isRecord(raw)) {
    err("must be a JSON object of path definitions");
    return out;
  }
  out.ui = uiStrings(PATH_UI, english?.ui, raw._ui);
  if (english) {
    out.paths = english.paths.map((en) =>
      mergePath(en, raw[en.key], file, problems),
    );
    for (const k of Object.keys(raw))
      if (
        k !== "_ui" &&
        k !== "$schema" &&
        !english.paths.some((p) => p.key === k)
      )
        problems.push({
          level: "warn",
          file,
          message: `"${k}" is not in paths.en.json; ignored`,
        });
    return out;
  }
  for (const [key, v] of Object.entries(raw)) {
    if (key === "_ui" || key === "$schema") continue;
    const at = (m: string) => err(`${key}: ${m}`);
    if (!KEY_RE.test(key)) at("key must be kebab-case ([a-z][a-z0-9-]*)");
    if (!isRecord(v)) {
      at("must be an object");
      continue;
    }
    for (const f of Object.keys(v))
      if (!PATH_FIELDS.has(f)) at(`unknown field "${f}"`);
    for (const f of ["tab", "job", "name", "time", "intro"] as const)
      if (!str(v[f])) at(`"${f}" must be a non-empty string`);
    if (str(v.intro) && !v.intro.startsWith("/"))
      at(`"intro" must be a root-relative href`);
    const steps = parseSteps(v.steps, at);
    if (!steps.length) at(`"steps" must list at least one [href, title]`);
    const first = v.first;
    if (
      first !== undefined &&
      (!Number.isInteger(first) ||
        (first as number) < 0 ||
        (first as number) >= steps.length)
    )
      at(`"first" must be a step index (0-${steps.length - 1})`);
    let after: PathStep | undefined;
    if (v.after !== undefined) {
      const a = v.after;
      if (!isRecord(a) || !str(a.href) || !str(a.title))
        at(`"after" must be { href, title, summary? }`);
      else
        after = {
          href: a.href,
          title: a.title,
          summary: str(a.summary) ? a.summary : undefined,
        };
    }
    if (typeof v.summary === "string") {
      const bad = checkInlineMarkdown(v.summary);
      if (bad) at(`"summary" ${bad}`);
    }
    out.paths.push({
      key,
      tab: String(v.tab ?? ""),
      label: str(v.label) ? v.label : String(v.name ?? key),
      job: String(v.job ?? ""),
      name: String(v.name ?? ""),
      time: String(v.time ?? ""),
      summary: str(v.summary) ? v.summary : undefined,
      intro: String(v.intro ?? ""),
      first: typeof first === "number" ? first : undefined,
      steps,
      after,
      demo: parseDemo(v.demo, at),
    });
  }
  return out;
}

function parseSteps(v: unknown, at: (m: string) => void): PathStep[] {
  if (!Array.isArray(v)) return [];
  const out: PathStep[] = [];
  v.forEach((s, i) => {
    if (
      !Array.isArray(s) ||
      s.length < 2 ||
      s.length > 3 ||
      !s.every((x) => typeof x === "string")
    ) {
      at(`steps[${i}] must be [href, title] or [href, title, summary]`);
      return;
    }
    const [href, title, summary] = s as string[];
    if (!href!.startsWith("/")) at(`steps[${i}] href must be root-relative`);
    if (summary) {
      const bad = checkInlineMarkdown(summary);
      if (bad) at(`steps[${i}] summary ${bad}`);
    }
    out.push({ href: href!, title: title!, summary: summary || undefined });
  });
  return out;
}

function parseDemo(v: unknown, at: (m: string) => void): PathDef["demo"] {
  if (v === undefined) return undefined;
  if (!isRecord(v)) {
    at(`"demo" must be an object`);
    return undefined;
  }
  const kind = v.component;
  if (typeof kind !== "string" || !DEMO_KINDS.includes(kind as DemoKind)) {
    at(`demo.component must be one of ${DEMO_KINDS.join(", ")}`);
    return undefined;
  }
  if (!str(v.title)) at(`demo.title must be a non-empty string`);
  for (const f of Object.keys(v))
    if (
      !["component", "title", "success", "stage", "steps", "checks"].includes(f)
    )
      at(`demo: unknown field "${f}"`);
  const steps = parseDemoSteps(v.steps, "demo.steps", at);
  const stage = parseStage(v.stage, steps.length, at);
  let checks: DemoChecks | undefined;
  if (v.checks !== undefined) {
    const c = v.checks;
    if (!isRecord(c) || !str(c.title))
      at(`demo.checks must be { title, steps }`);
    else {
      for (const f of Object.keys(c))
        if (!["title", "steps"].includes(f))
          at(`demo.checks: unknown field "${f}"`);
      checks = {
        title: c.title,
        steps: parseDemoSteps(c.steps, "demo.checks.steps", at),
      };
    }
  }
  return {
    component: kind as DemoKind,
    title: String(v.title ?? ""),
    success: str(v.success) ? v.success : undefined,
    ...(stage ? { stage } : {}),
    steps,
    ...(checks ? { checks } : {}),
  };
}

function parseDemoSteps(
  v: unknown,
  where: string,
  at: (m: string) => void,
): DemoStep[] {
  const steps: DemoStep[] = [];
  if (!Array.isArray(v) || !v.length) {
    at(`${where} must be a non-empty array`);
    return steps;
  }
  v.forEach((s, i) => {
    if (!isRecord(s) || !str(s.label) || !str(s.output)) {
      at(`${where}[${i}] must be { label, output, description? }`);
      return;
    }
    if (path.isAbsolute(s.output) || s.output.split("/").includes(".."))
      at(`${where}[${i}].output must be relative to packages/docs-examples`);
    if (typeof s.description === "string") {
      const bad = checkInlineMarkdown(s.description);
      if (bad) at(`${where}[${i}].description ${bad}`);
    }
    for (const f of Object.keys(s))
      if (!["label", "output", "description"].includes(f))
        at(`${where}[${i}]: unknown field "${f}"`);
    steps.push({
      label: s.label,
      output: s.output,
      description: str(s.description) ? s.description : undefined,
    });
  });
  return steps;
}

const STAGE_TONES = ["todo", ...TONES];

function parseStage(
  v: unknown,
  steps: number,
  at: (m: string) => void,
): TermStageRow[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    at(`demo.stage must be an array of { label, sub?, states }`);
    return undefined;
  }
  return v.flatMap((r, i) => {
    if (!isRecord(r) || !str(r.label) || !Array.isArray(r.states)) {
      at(`demo.stage[${i}] must be { label, sub?, states }`);
      return [];
    }
    if (r.states.length !== steps + 1)
      at(
        `demo.stage[${i}].states needs ${steps + 1} entries (before step 1, then after each step)`,
      );
    const states = r.states.flatMap((st, j) => {
      if (
        !Array.isArray(st) ||
        st.length !== 2 ||
        !STAGE_TONES.includes(st[0]) ||
        !str(st[1])
      ) {
        at(
          `demo.stage[${i}].states[${j}] must be [${STAGE_TONES.join("|")}, text]`,
        );
        return [];
      }
      return [[st[0], st[1]] as [Tone | "todo", string]];
    });
    return [
      {
        label: r.label,
        ...(str(r.sub) ? { sub: r.sub } : {}),
        states,
      },
    ];
  });
}

function mergePath(
  en: PathDef,
  raw: unknown,
  file: string,
  problems: Problem[],
): PathDef {
  if (raw === undefined) return en;
  if (!isRecord(raw)) {
    problems.push({
      level: "error",
      file,
      message: `${en.key}: must be an object`,
    });
    return en;
  }
  const s = (v: unknown, fallback: string) => (str(v) ? v : fallback);
  const so = (v: unknown, fallback?: string) => (str(v) ? v : fallback);
  const steps = en.steps.map((st, i) => {
    const t = Array.isArray(raw.steps) ? raw.steps[i] : undefined;
    return Array.isArray(t)
      ? {
          href: st.href,
          title: s(t[1], st.title),
          summary: so(t[2], st.summary),
        }
      : st;
  });
  const ra = isRecord(raw.after) ? raw.after : {};
  const rd = isRecord(raw.demo) ? raw.demo : {};
  const rds = Array.isArray(rd.steps) ? rd.steps : [];
  const rc = isRecord(rd.checks) ? rd.checks : {};
  const mergeSteps = (list: DemoStep[], raw: unknown[]) =>
    list.map((d, i) => {
      const t = isRecord(raw[i]) ? (raw[i] as Record<string, unknown>) : {};
      return {
        ...d,
        label: s(t.label, d.label),
        description: so(t.description, d.description),
      };
    });
  return {
    ...en,
    label: s(raw.label, en.label),
    job: s(raw.job, en.job),
    name: s(raw.name, en.name),
    time: s(raw.time, en.time),
    summary: so(raw.summary, en.summary),
    steps,
    after: en.after && {
      href: en.after.href,
      title: s(ra.title, en.after.title),
      summary: so(ra.summary, en.after.summary),
    },
    demo: en.demo && {
      ...en.demo,
      title: s(rd.title, en.demo.title),
      success: so(rd.success, en.demo.success),
      steps: mergeSteps(en.demo.steps, rds),
      ...(en.demo.checks
        ? {
            checks: {
              title: s(rc.title, en.demo.checks.title),
              steps: mergeSteps(
                en.demo.checks.steps,
                Array.isArray(rc.steps) ? rc.steps : [],
              ),
            },
          }
        : {}),
    },
  };
}

/** All path sources (EN first), validated. */
export function loadPaths(
  docsRoot: string,
  problems: Problem[],
): PathsSource[] {
  const dir = pathsDir(docsRoot);
  const enFile = path.join(dir, "paths.en.json");
  if (!existsSync(enFile)) {
    problems.push({
      level: "error",
      file: "paths/paths.en.json",
      message:
        "missing (WP8a owns it; `--init` writes the seed from src/generators/seed/)",
    });
    return [];
  }
  const en = parsePaths(readJson(enFile), "paths/paths.en.json", problems);
  const out = [en];
  for (const lang of sourceLanguages(dir, "paths").slice(1)) {
    const rel = `paths/paths.${lang}.json`;
    const loc = parsePaths(
      readJson(path.join(dir, `paths.${lang}.json`)),
      rel,
      problems,
      en,
    );
    loc.lang = lang;
    out.push(loc);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const GEN = "paths.ts";
const hdr = (lang: string) =>
  header(GEN, [`paths/paths.${lang}.json`], "gen:paths");

/** Pages of a path in order: intro (index 0), then steps 1..N. */
export function pathPages(p: PathDef) {
  return [p.intro, ...p.steps.map((s) => s.href)];
}

export function renderStepper(
  docsRoot: string,
  src: PathsSource,
  p: PathDef,
  current: number,
  pg?: TutorialSource,
): string {
  const { ui, lang } = src;
  const label = `${p.name} · ${p.time}`;
  const items = p.steps.map((s, i) => {
    const n = i + 1;
    const state = n < current ? "done" : n === current ? "current" : "todo";
    const href = localizeHref(docsRoot, s.href, lang);
    const marks: string[] = [];
    if (state === "done")
      marks.push(
        `<span className="sol-stepper-done">${mdText(ui.done)}</span>`,
      );
    if (p.first === i)
      marks.push(
        `<span className="sol-stepper-first">${mdText(ui.firstWin)}</span>`,
      );
    const aria = state === "current" ? ` aria-current="step"` : "";
    const first = p.first === i ? ` data-first="true"` : "";
    // Visually hidden separators so the accessible name reads
    // "Step 1, Done: Title" rather than "Step 1DoneTitle".
    const sep = (t: string) => `<span className="sol-vh">${t}</span>`;
    return `<li data-state="${state}"${first}><a href="${href}"${aria}><span className="sol-stepper-n">${mdText(`${ui.step} ${n}`)}${marks.map((m) => sep(", ") + m).join("")}${sep(": ")}</span><span className="sol-stepper-t">${mdText(s.title)}</span></a></li>`;
  });
  return `${hdr(lang)}
<div className="sol-stepper not-prose" data-path="${p.key}">
<div className="sol-stepper-head">${tutorialButton(ui, pg)}</div>
<div className="sol-stepper-nav" role="navigation" ${attr("aria-label", label)}>
<ol>
${items.join("\n")}
</ol>
</div>
</div>
`;
}

/** What "Open tutorial in Playground" opens (repo-relative, posix). */
export interface TutorialSource {
  open: string;
  kind: PlaygroundKind;
}

/**
 * A path's example folder, relative to packages/docs-examples: the one
 * folder its demo outputs live in when that is a `paths/<domain>/<tutorial>`
 * folder, else the single `paths/<domain>/<key>` folder. Undefined when
 * neither exists (or the key matches folders in two domains).
 */
export function tutorialDir(p: PathDef, root = examplesRoot) {
  const isDir = (rel: string) => {
    const abs = path.join(root, rel);
    return existsSync(abs) && statSync(abs).isDirectory();
  };
  const demoDirs = new Set(
    (p.demo?.steps ?? []).map((s) => path.posix.dirname(s.output)),
  );
  const demoDir = [...demoDirs][0];
  if (
    demoDirs.size === 1 &&
    demoDir &&
    /^paths\/[^/]+\/[^/]+$/.test(demoDir) &&
    isDir(demoDir)
  )
    return demoDir;
  if (!isDir("paths")) return undefined;
  const hits = readdirSync(path.join(root, "paths"))
    .sort()
    .map((d) => `paths/${d}/${p.key}`)
    .filter(isDir);
  return hits.length === 1 ? hits[0] : undefined;
}

/** The "Open tutorial in Playground" target of a path, if it has a folder. */
export function tutorialSource(
  p: PathDef,
  root = examplesRoot,
): TutorialSource | undefined {
  const dir = tutorialDir(p, root);
  if (!dir) return undefined;
  const open = `packages/docs-examples/${dir}`;
  return {
    open,
    kind: /^[\w\-/.]+$/.test(open) ? folderKind(path.join(root, dir)) : "other",
  };
}

/**
 * The "Open tutorial in Playground" button, server-rendered DISABLED: no
 * href, greyed, `aria-disabled`, tooltip in `data-tip` (styles/playground.css
 * draws it and the icon). `data-pg-open`/`data-pg-kind` are the folder and
 * its kind; apps/docs/playground.js turns the button into a link when the
 * kind is enabled, using the localized `data-pg-label`/`data-pg-off`.
 * Without JavaScript it stays disabled, so it never links to a folder the
 * playground cannot import.
 */
export function tutorialButton(
  ui: PathUi,
  pg: TutorialSource | undefined,
  variant: "compact" | "block" = "compact",
) {
  const off = `${ui.playground}: ${ui.playgroundOff.charAt(0).toLowerCase()}${ui.playgroundOff.slice(1)}`;
  const attrs = [
    `className="sol-pg-btn sol-pg-tut"`,
    `data-variant="${variant}"`,
    ...(pg
      ? [attr("data-pg-open", pg.open), attr("data-pg-kind", pg.kind)]
      : [`data-pg-kind="inline"`]),
    attr("data-pg-label", ui.playground),
    attr("data-pg-off", off),
    attr("data-tip", off),
    attr("aria-label", off),
    `aria-disabled="true"`,
    `role="link"`,
    `tabIndex="0"`,
  ];
  return `<a ${attrs.join(" ")}><span className="sol-pg-label">${mdText(ui.playground)}</span></a>`;
}

/**
 * `playground.mdx`: the prominent "Open tutorial in Playground" block for
 * the top of the step that runs the tutorial on your machine.
 */
export function renderPlaygroundBlock(
  src: PathsSource,
  p: PathDef,
  pg: TutorialSource | undefined,
) {
  const { ui, lang } = src;
  return `${hdr(lang)}
<div className="sol-pg-tutorial not-prose" data-path="${p.key}">
<p className="sol-pg-tutorial-text">${mdText(ui.playgroundNote)}</p>
${tutorialButton(ui, pg, "block")}
</div>
`;
}

function nextCard(docsRoot: string, src: PathsSource, p: PathDef, n: number) {
  const { ui, lang } = src;
  const target = n < p.steps.length ? p.steps[n]! : p.after!;
  const body =
    target.summary !== undefined
      ? mdInline(target.summary)
      : n < p.steps.length
        ? mdText(`${p.name} · ${ui.step} ${n + 1}/${p.steps.length}`)
        : "";
  return `${hdr(lang)}
<Card ${attr("title", `${ui.next}: ${target.title}`)} href="${localizeHref(docsRoot, target.href, lang)}" icon="arrow-right" horizontal>
${body}
</Card>
`;
}

/**
 * Path card (job pickers, hubs). Mirrors the mockup's `.pcard`: kicker, title,
 * summary, numbered steps with the first win starred, and a primary CTA. The
 * numbers and the star are drawn by styles/stepper.css; the "First win" text
 * stays in the markup for screen readers and readers without CSS.
 */
export function renderCard(
  docsRoot: string,
  src: PathsSource,
  p: PathDef,
  target: "intro" | "step1" = "intro",
) {
  const { ui, lang } = src;
  const intro = localizeHref(
    docsRoot,
    target === "intro" ? p.intro : p.steps[0]!.href,
    lang,
  );
  const steps = p.steps
    .map((s, i) => {
      const first = p.first === i;
      const mark = first
        ? ` <span className="sol-pcard-first">${mdText(ui.firstWin)}</span>`
        : "";
      return `<li${first ? ` data-first="true"` : ""}>[${mdText(s.title)}](${localizeHref(docsRoot, s.href, lang)})${mark}</li>`;
    })
    .join("");
  return `${hdr(lang)}
<div className="sol-pcard not-prose" data-path="${p.key}">
<div className="sol-pcard-main">
<p className="sol-pcard-k">${mdText(`${p.job} · `)}<span className="sol-nowrap">${mdText(`${p.steps.length} ${ui.steps} · ${p.time}`)}</span></p>
<p className="sol-pcard-title">[${mdText(p.name)}](${intro})</p>
${p.summary ? `<p className="sol-pcard-desc">${mdInline(p.summary)}</p>\n` : ""}<ol className="sol-pcard-steps">${steps}</ol>
</div>
<p className="sol-pcard-cta">[${mdText(`${ui.start} →`)}](${intro})</p>
</div>
`;
}

/**
 * styles/paths-sidebar.css: marks each path's sidebar group (styled as a
 * numbered path box by styles/stepper.css) with the first-win star on the
 * right step. Generated so the star follows `first` in paths.en.json.
 */
export function renderSidebarCss(en: PathsSource) {
  const rules = en.paths
    .filter((p) => p.first !== undefined)
    .map((p) => {
      // Laid out the way oxfmt formats CSS, so the committed file stays
      // byte-identical after `oxfmt .`.
      return `:is(#sidebar-content, #mobile-nav)
  li[data-group-tag][id$="${p.intro}"]
  > ul
  > li:nth-child(${p.first! + 1})
  > a::after {
  content: "\\2605";
}`;
    });
  return `/* GENERATED by packages/docs-tooling/src/generators/paths.ts from paths/paths.en.json. Do not edit: change the source and run \`pnpm --filter @workspace/docs-tooling gen:paths\`. */
/* First-win star (★) on each path's sidebar step. Box, numbers and states:
 * styles/stepper.css ("sidebar path box"). */
${rules.join("\n")}
`;
}

export function readDemoOutput(rel: string, root = examplesRoot) {
  const abs = path.join(root, rel);
  return existsSync(abs)
    ? readFileSync(abs, "utf8").replace(/\s+$/, "")
    : undefined;
}

export function renderDemo(
  src: PathsSource,
  p: PathDef,
  problems: Problem[],
  outputsRoot = examplesRoot,
) {
  const d = p.demo!;
  return renderPanel(src, problems, outputsRoot, {
    file: `snippets/paths/${src.lang}/${p.key}/demo.mdx`,
    id: `paths/${p.key}/demo`,
    kind: d.component,
    title: d.title,
    steps: d.steps,
    stage: d.stage,
    success: d.success,
    // The marker names the tutorial folder; checks share the demo's.
    markerSteps: d.steps,
  });
}

/** `checks.mdx`: the refusals panel, kept apart from the demo's success. */
export function renderChecks(
  src: PathsSource,
  p: PathDef,
  problems: Problem[],
  outputsRoot = examplesRoot,
) {
  const d = p.demo!;
  const c = d.checks!;
  return renderPanel(src, problems, outputsRoot, {
    file: `snippets/paths/${src.lang}/${p.key}/checks.mdx`,
    id: `paths/${p.key}/checks`,
    kind: d.component,
    title: c.title,
    steps: c.steps,
    markerSteps: d.steps,
  });
}

function renderPanel(
  src: PathsSource,
  problems: Problem[],
  outputsRoot: string,
  t: {
    file: string;
    id: string;
    kind: string;
    title: string;
    steps: DemoStep[];
    stage?: TermStageRow[];
    success?: string;
    markerSteps: DemoStep[];
  },
) {
  const { ui, lang } = src;
  const { file } = t;
  const outputs = t.steps.map((s) => readDemoOutput(s.output, outputsRoot));
  const missing = t.steps.filter((_, i) => outputs[i] === undefined);
  for (const s of missing)
    problems.push({
      level: "warn",
      file,
      message: `no recorded output at packages/docs-examples/${s.output} (WP5); demo generated without it and without Run controls`,
    });
  const steps = t.steps.map((s, i) => {
    const errors: string[] = [];
    const meta =
      outputs[i] === undefined
        ? undefined
        : readRunMeta(path.join(outputsRoot, s.output), errors, s.output);
    for (const message of errors)
      problems.push({ level: "error", file, message });
    return {
      title: s.label,
      description: s.description,
      output: outputs[i] ?? "",
      meta,
    };
  });
  const labels: TermLabels = {
    env: ui.demoEnv,
    run: ui.demoRun,
    runStep: ui.demoRunStep,
    next: ui.demoNext,
    runAll: ui.demoRunAll,
    again: ui.demoAgain,
    running: ui.demoRunning,
    sending: ui.demoSending,
    requesting: ui.demoRequesting,
    calling: ui.demoCalling,
    confirming: ui.demoConfirming,
    done: ui.demoDone,
    copy: ui.demoCopy,
    copied: ui.demoCopied,
    output: ui.demoOutput,
    step: ui.step,
  };
  let panel = renderTerminal({
    id: t.id,
    kind: t.kind,
    title: t.title,
    labels,
    steps,
    stage: t.stage,
    success: t.success,
  });
  if (missing.length)
    panel = panel.replace(
      /^<div className="sol-term /,
      '<div data-norun="" className="sol-term ',
    );
  return `${hdr(lang).trimEnd()}\n\n${demoMarker(t.markerSteps, outputsRoot)}\n${panel}\n`;
}

const STEP_SOURCE_EXTS = [".ts", ".js", ".rs", ".py"];

/**
 * The hidden "Open in Playground" marker before a demo terminal
 * (examples/playground.ts): the folder its steps run from, when they all
 * share one folder and each has a source file `<stem>.{ts,js,rs,py}` next to
 * its recorded output. Without one the marker has no source and
 * playground.js keeps the terminal's control disabled.
 */
export function demoMarker(steps: DemoStep[], outputsRoot = examplesRoot) {
  const dirs = new Set(steps.map((s) => path.posix.dirname(s.output)));
  const sources = steps.map((s) => {
    const stem = s.output.replace(/\.output\.txt$/, "");
    // `<stem>.<variant>.output.txt` is a slice of `<stem>.<ext>`'s run.
    const variant = stem.replace(/(?<=\/[^/.]+)\.[^/.]+$/, "");
    for (const base of variant === stem ? [stem] : [stem, variant]) {
      const ext = STEP_SOURCE_EXTS.find((e) =>
        existsSync(path.join(outputsRoot, base + e)),
      );
      if (ext) return `packages/docs-examples/${base}${ext}`;
    }
    return undefined;
  });
  const dir = [...dirs][0];
  const pg =
    dirs.size === 1 && dir && sources.every(Boolean)
      ? playgroundFolderSource(dir, sources as string[], outputsRoot)
      : undefined;
  return playgroundMarker(
    pg && { ...pg, open: `packages/docs-examples/${pg.open}` },
  );
}

/** Every generated file for every language. */
export function buildPathOutputs(
  docsRoot: string,
  sources: PathsSource[],
  problems: Problem[],
  outputsRoot = examplesRoot,
) {
  const files = new Map<string, string>();
  for (const src of sources) {
    for (const p of src.paths) {
      const dir = path.join(docsRoot, "snippets", "paths", src.lang, p.key);
      const pg = tutorialSource(p, outputsRoot);
      if (!pg && src === sources[0])
        problems.push({
          level: "warn",
          file: "paths/paths.en.json",
          message: `${p.key}: no example folder packages/docs-examples/paths/<domain>/${p.key}; "Open tutorial in Playground" is generated without a source`,
        });
      for (let n = 0; n <= p.steps.length; n++)
        files.set(
          path.join(dir, `stepper-${n}.mdx`),
          renderStepper(docsRoot, src, p, n, pg),
        );
      files.set(
        path.join(dir, "playground.mdx"),
        renderPlaygroundBlock(src, p, pg),
      );
      for (let n = 0; n < p.steps.length; n++)
        files.set(
          path.join(dir, `next-${n}.mdx`),
          nextCard(docsRoot, src, p, n),
        );
      if (p.after)
        files.set(
          path.join(dir, `next-${p.steps.length}.mdx`),
          nextCard(docsRoot, src, p, p.steps.length),
        );
      files.set(path.join(dir, "card.mdx"), renderCard(docsRoot, src, p));
      files.set(
        path.join(dir, "start.mdx"),
        renderCard(docsRoot, src, p, "step1"),
      );
      if (p.demo) {
        files.set(
          path.join(dir, "demo.mdx"),
          renderDemo(src, p, problems, outputsRoot),
        );
        if (p.demo.checks)
          files.set(
            path.join(dir, "checks.mdx"),
            renderChecks(src, p, problems, outputsRoot),
          );
      }
    }
  }
  if (sources[0])
    files.set(
      path.join(docsRoot, "styles", "paths-sidebar.css"),
      renderSidebarCss(sources[0]),
    );
  return files;
}

/** Warn about path pages that do not exist yet (WP8a writes them). */
function checkPages(docsRoot: string, en: PathsSource, problems: Problem[]) {
  for (const p of en.paths)
    for (const href of [...pathPages(p), ...(p.after ? [p.after.href] : [])])
      if (!pageFileFor(docsRoot, href))
        problems.push({
          level: "warn",
          file: "paths/paths.en.json",
          message: `${p.key}: page ${href} does not exist yet`,
        });
}

export interface PathsOptions extends GeneratorOptions {
  /** Root for recorded demo outputs (defaults to packages/docs-examples). */
  outputsRoot?: string;
}

export function runPaths(opts: PathsOptions = {}): GeneratorResult {
  const docsRoot = resolveDocsRoot(opts);
  const check = Boolean(opts.check);
  const r = emptyResult();
  const sources = loadPaths(docsRoot, r.problems);
  if (!sources.length || r.problems.some((p) => p.level === "error"))
    return finish(r, check);
  checkPages(docsRoot, sources[0]!, r.problems);
  const files = buildPathOutputs(
    docsRoot,
    sources,
    r.problems,
    opts.outputsRoot,
  );
  applyOutputs(
    docsRoot,
    files,
    [path.join(docsRoot, "snippets", "paths")],
    check,
    r,
  );
  // `--check` always verifies imports in memory; only `--sync` writes.
  if (opts.sync || check)
    syncPages(
      docsRoot,
      (s) => s.includes("/snippets/paths/"),
      (tree, file) => syncSnippetImports(tree, "paths", file.lang, docsRoot),
      check,
      r,
    );
  return finish(r, check);
}

const SEED_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "seed",
);

/** Write the seed source when it does not exist (never overwrites). */
export function initPaths(docsRoot: string): string | undefined {
  const dest = path.join(pathsDir(docsRoot), "paths.en.json");
  if (existsSync(dest)) return undefined;
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    readFileSync(path.join(SEED_DIR, "paths.en.json"), "utf8"),
  );
  return dest;
}

if (isMain(import.meta.url)) {
  const f = parseFlags(process.argv.slice(2));
  if (f.init) {
    const w = initPaths(resolveDocsRoot({}));
    console.log(
      w ? `wrote seed ${w}` : "paths.en.json exists; not overwritten",
    );
  }
  const r = runPaths({ check: f.check, sync: f.sync });
  printResult("gen:paths", r, f.check);
  process.exit(r.ok ? 0 : 1);
}
