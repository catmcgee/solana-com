"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ACTOR_ICONS,
  Icon,
} from "@/components/tx-walkthrough/tx-walkthrough.client";
import {
  SCENES,
  type SceneActor,
  type SceneIcon,
  type SceneKind,
  type ScenePacket,
} from "./inaction-scenes";

/**
 * <InActionScene kind="checkout" /> on "Solana in action": one tutorial's
 * run as a short animated scene, built from the transaction walkthrough's
 * pieces (tx-walkthrough.css: actor cards, a packet on an arrow, a caption;
 * both stylesheets load with the docs, docs-styles.ts).
 * The beats play in a loop while the scene is on screen and the tab is
 * visible; the dots pick a beat and stop the loop. With reduced motion
 * nothing plays by itself and nothing slides. Children (the tutorial's
 * interactive demo) sit behind "Run the demo", hidden but in the page, so
 * the demo script (run-examples.js) still finds them.
 */
const BEAT_MS = 3_000;
const LAST_BEAT_MS = 4_200;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function InActionScene({
  kind,
  children,
}: {
  kind: SceneKind;
  children?: ReactNode;
}) {
  const scene = SCENES[kind];
  const id = useId();
  const [showDemo, setShowDemo] = useState(false);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLElement>(null);
  const beats = scene.beats;
  const beat = beats[index];
  const auto = playing && !reduced && inView;

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A tab that comes back restarts the timer from the current beat.
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const on = () => {
      if (!document.hidden) setWake((n) => n + 1);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const ms = index === beats.length - 1 ? LAST_BEAT_MS : BEAT_MS;
    const id = setTimeout(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % beats.length);
    }, ms);
    return () => clearTimeout(id);
  }, [auto, index, beats.length, wake]);

  return (
    <>
      <figure
        ref={root}
        className="txw sol-scene not-prose"
        data-kind={kind}
        aria-label={scene.label}
      >
        <div className="sol-scene-stage" aria-hidden="true">
          <div className="txw-scene" key={index}>
            <Actor actor={beat.left} />
            <div className="txw-lane">
              {beat.packets.map((p, i) => (
                <Packet key={i} packet={p} delay={i * 260} />
              ))}
              <p className="txw-caption">{inline(beat.caption)}</p>
            </div>
            <Actor actor={beat.right} />
          </div>
        </div>

        <ol className="txw-sr">
          {beats.map((b, i) => (
            <li key={i}>{b.caption.replaceAll("`", "")}</li>
          ))}
        </ol>

        <div className="sol-scene-foot">
          <div className="sol-scene-beats">
            {beats.map((b, i) => (
              <button
                key={i}
                type="button"
                className="sol-scene-dot"
                aria-label={`Step ${i + 1} of ${beats.length}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => {
                  setIndex(i);
                  setPlaying(false);
                }}
              />
            ))}
            {reduced ? null : (
              <button
                type="button"
                className="sol-scene-play"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
            )}
          </div>
          <div className="sol-scene-acts">
            {children ? (
              <button
                type="button"
                className="txw-toggle sol-scene-toggle"
                aria-expanded={showDemo}
                aria-controls={`${id}-demo`}
                onClick={() => setShowDemo((v) => !v)}
              >
                <ChevronIcon />
                Run the demo
              </button>
            ) : null}
            <a className="sol-scene-tut" href={scene.tutorial.href}>
              Tutorial: {scene.tutorial.title} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </figure>
      {children ? (
        <div className="sol-scene-demo" id={`${id}-demo`} hidden={!showDemo}>
          {children}
        </div>
      ) : null}
    </>
  );
}

function Actor({ actor }: { actor: SceneActor }) {
  return (
    <div className="txw-actor">
      <span className="txw-actor-icon">{ICONS[actor.icon]}</span>
      <span>
        <span className="txw-actor-name">{actor.name}</span>
        <span className="txw-actor-note">{actor.note}</span>
        {actor.values?.length ? (
          <span className="sol-scene-vals">
            {actor.values.map((v, i) => (
              <span key={i} className="sol-scene-val" data-tone={v.tone}>
                {v.text}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Packet({ packet: p, delay }: { packet: ScenePacket; delay: number }) {
  return (
    <div
      className="txw-arrow"
      data-dir={p.dir}
      data-dashed={p.refused || undefined}
      data-tone={p.tone}
    >
      <span
        className="txw-packet"
        data-solid={p.solid || undefined}
        data-tone={p.tone}
        data-refused={p.refused || undefined}
        style={{ animationDelay: `${delay}ms` }}
      >
        {p.icon === "coin" ? (
          <span className="txw-coin">
            {p.label.includes("USDC") ? "$" : "L"}
          </span>
        ) : p.icon ? (
          PACKET_ICONS[p.icon]
        ) : null}
        {p.label}
      </span>
    </div>
  );
}

/** `code` spans in a caption. */
function inline(text: string) {
  return text
    .split("`")
    .map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

const ICONS: Record<SceneIcon, ReactNode> = {
  wallet: ACTOR_ICONS.wallet,
  network: ACTOR_ICONS.network,
  app: ACTOR_ICONS.app,
  shop: (
    <Icon>
      <path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  ),
  server: (
    <Icon>
      <rect x="4" y="4" width="16" height="7" rx="1.5" />
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
      <path d="M8 7.5h.01M8 16.5h.01" />
    </Icon>
  ),
  person: (
    <Icon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </Icon>
  ),
  unknown: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01" />
    </Icon>
  ),
  issuer: (
    <Icon>
      <path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </Icon>
  ),
  holders: (
    <Icon>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M16 14.5c2.3 0 4 1.3 4.5 4" />
    </Icon>
  ),
};

/** Coins show $ for USDC and L for LSF (in Packet). */
const PACKET_ICONS: Record<
  Exclude<ScenePacket["icon"], "coin" | undefined>,
  ReactNode
> = {
  doc: (
    <Icon size={15}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </Icon>
  ),
  check: (
    <Icon size={15}>
      <path d="m5 12 5 5 9-10" />
    </Icon>
  ),
  cross: (
    <Icon size={15}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  ),
  pause: (
    <Icon size={15}>
      <path d="M9 6v12M15 6v12" />
    </Icon>
  ),
};

const ChevronIcon = () => (
  <Icon size={16}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
const PauseIcon = () => (
  <Icon size={14}>
    <path d="M9 6v12M15 6v12" />
  </Icon>
);
const PlayIcon = () => (
  <Icon size={14}>
    <path d="M8 5.5v13l10-6.5z" />
  </Icon>
);
