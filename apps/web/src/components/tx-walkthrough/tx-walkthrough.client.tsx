"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EXCERPTS, githubUrl, lineLabel, type Excerpt } from "./excerpts";
import type { AccountRef, WalkthroughModel } from "./model";
import {
  ATOMIC_NOTE,
  LANE_NAME,
  LANES,
  PROGRAM_NOTE,
  ROWS,
  STEPS,
  type LaneId,
  type Row,
  type Step,
  type StepId,
} from "./steps";

/** How long Run stays on each step. */
export const STEP_MS = 2000;

export interface TxWalkthroughClientProps {
  model: WalkthroughModel;
  /** Highlighted code for each excerpt id (plain <pre> in tests). */
  code: Record<string, ReactNode>;
  /** The trimmed getTransaction response, highlighted. */
  response: ReactNode;
  explorerUrl: string;
  rpcReferenceHref: string;
}

export function TxWalkthroughClient({
  model,
  code,
  response,
  explorerUrl,
  rpcReferenceHref,
}: TxWalkthroughClientProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const mounted = useRef(false);
  const titleId = useId();
  const last = STEPS.length - 1;
  const step = STEPS[index];

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => i + 1), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, last]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setAnnouncement(
      `Step ${index + 1} of ${STEPS.length}: ${STEPS[index].title}`,
    );
  }, [index]);

  const go = useCallback(
    (next: number) => {
      setPlaying(false);
      setIndex(Math.max(0, Math.min(last, next)));
    },
    [last],
  );

  const run = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= last) setIndex(0);
    setPlaying(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    // Leave arrow keys alone where they scroll (code, tables).
    if (target.closest("[data-txw-scroll]")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: last,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    go(keys[e.key]);
  };

  const fill = (text: string) =>
    text.replaceAll("{cash}", model.cash).replaceAll("{asset}", model.asset);

  return (
    <section
      className="txw"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      data-step={step.id}
    >
      <header className="txw-head">
        <p className="txw-eyebrow">See a transaction in action</p>
        <p className="txw-title" id={titleId}>
          Settle a trade: {model.cash} USDC for {model.asset} LSF
        </p>
        <p className="txw-lead">
          One real transaction, recorded from a test run, from the line of code
          that starts it to the balances it changes.
        </p>
      </header>

      <Diagram index={index} onPick={go} />

      <ol className="txw-flow" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className="txw-flow-item"
              aria-current={i === index ? "step" : undefined}
              data-state={stateOf(i, index)}
              onClick={() => go(i)}
            >
              <span className="txw-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="txw-flow-title">{s.title}</span>
              <LaneBadge step={s} />
            </button>
          </li>
        ))}
      </ol>

      <div
        className="txw-controls"
        role="group"
        aria-label="Walkthrough controls"
      >
        <button
          type="button"
          className="txw-btn txw-btn-run"
          onClick={run}
          aria-pressed={playing}
        >
          <span aria-hidden="true" className="txw-btn-icon">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </span>
          {playing ? "Pause" : index >= last ? "Run again" : "Run"}
        </button>
        <button
          type="button"
          className="txw-btn"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          Back
        </button>
        <div className="txw-dots">
          {STEPS.map((s, i) => (
            <button
              type="button"
              key={s.id}
              className="txw-dot"
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === index ? "step" : undefined}
              data-state={stateOf(i, index)}
              onClick={() => go(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="txw-btn"
          onClick={() => go(index + 1)}
          disabled={index === last}
        >
          Next
        </button>
        <span className="txw-count" aria-hidden="true">
          Step {index + 1} of {STEPS.length}
        </span>
      </div>

      <p className="txw-sr" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <article className="txw-panel" key={step.id}>
        <div className="txw-panel-head">
          <span className="txw-num txw-num-lg" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="txw-panel-title">{step.title}</h3>
          <LaneBadge step={step} />
        </div>
        {step.body.map((p, i) => (
          <p className="txw-body" key={i}>
            {inline(fill(p))}
          </p>
        ))}
        {step.atomic ? (
          <p className="txw-atomic">
            <strong>All or nothing.</strong> {ATOMIC_NOTE}
          </p>
        ) : null}
        <StepData
          step={step}
          model={model}
          code={code}
          response={response}
          explorerUrl={explorerUrl}
          rpcReferenceHref={rpcReferenceHref}
        />
      </article>
    </section>
  );
}

function stateOf(i: number, index: number) {
  return i === index ? "active" : i < index ? "done" : "todo";
}

/** `code` spans in copy. */
function inline(text: string) {
  return text
    .split("`")
    .map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

function LaneBadge({ step }: { step: Step }) {
  return (
    <span className="txw-badge">
      {step.lanes.map((l, i) => (
        <span key={l} data-yours={isYours(l) || undefined}>
          {i > 0 ? <span aria-hidden="true">{"\u00a0·\u00a0"}</span> : null}
          {LANE_NAME[l]}
        </span>
      ))}
    </span>
  );
}

const isYours = (l: LaneId) => Boolean(LANES.find((x) => x.id === l)?.yours);

/* ------------------------------------------------------------- Diagram */

/*
 * The geometry of diagrams/transaction-flow.svg (draw-concepts.mjs): six
 * 103px lanes 112px apart, the same rows at the same heights, and the
 * atomic box around the program's instruction. The walkthrough draws it
 * live so the current step's rows light up.
 */
const W = 688;
const H = 786;
const LANE_X = (i: number) => 64 + 112 * i;
const BOX_W = 103;
const HEAD_Y = 24.5;
const HEAD_H = 75;
const LIFE_TOP = 100;
const LIFE_BOTTOM = 762;
const ATOMIC = { x: 234.5, y: 352.5, w: 443, h: 349 };
const laneIndex = (id: LaneId) => LANES.findIndex((l) => l.id === id);
const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);

function Diagram({
  index,
  onPick,
}: {
  index: number;
  onPick: (i: number) => void;
}) {
  const step = STEPS[index];
  const active = new Set(step.lanes);
  return (
    <div className="txw-diagram">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="One transaction, step by step. Your app builds a transaction, the wallet signs it, and your app sends it to the network through RPC. The network verifies the signatures and charges the fee, then runs your program's instruction all or nothing: your program derives a PDA, reads state, calls the Token Program through a CPI that the PDA signs, and writes state. Your app then gets the confirmation."
      >
        <defs>
          {(["n", "a"] as const).map((k) => (
            <marker
              key={k}
              id={`txw-head-${k}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="10"
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path
                d="M3 1.5L8.5 5L3 8.5"
                className={k === "a" ? "txw-head-a" : "txw-head-n"}
              />
            </marker>
          ))}
        </defs>

        {LANES.map((lane, i) => (
          <path
            key={lane.id}
            className="txw-life"
            data-yours={lane.yours || undefined}
            d={`M${LANE_X(i) + 0.5} ${LIFE_TOP}V${LIFE_BOTTOM}`}
          />
        ))}

        <g className="txw-atomic-box" data-on={step.atomic || undefined}>
          <rect
            x={ATOMIC.x}
            y={ATOMIC.y}
            width={ATOMIC.w}
            height={ATOMIC.h}
            rx="8"
          />
          <text x={ATOMIC.x + 11.5} y={ATOMIC.y + 23.7}>
            Atomic: all or nothing
          </text>
        </g>

        {ROWS.map((row) => {
          const i = stepIndex(row.step);
          return (
            <RowMark
              key={row.y}
              row={row}
              state={stateOf(i, index)}
              number={
                ROWS.find((r) => r.step === row.step) === row
                  ? i + 1
                  : undefined
              }
              onPick={() => onPick(i)}
            />
          );
        })}

        {LANES.map((lane, i) => {
          const x = LANE_X(i);
          return (
            <g
              key={lane.id}
              className="txw-lane"
              data-yours={lane.yours || undefined}
              data-on={active.has(lane.id) || undefined}
            >
              <rect
                className="txw-lane-box"
                x={x - BOX_W / 2}
                y={HEAD_Y}
                width={BOX_W}
                height={HEAD_H}
                rx="8"
              />
              <text className="txw-lane-name" x={x} y={HEAD_Y + 27}>
                {lane.name}
              </text>
              <text
                className="txw-lane-note txw-lane-note-1"
                x={x}
                y={HEAD_Y + 44.7}
              >
                {lane.note[0]}
              </text>
              <text className="txw-lane-note" x={x} y={HEAD_Y + 62.7}>
                {lane.note[1]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="txw-diagram-note">{PROGRAM_NOTE}</p>
    </div>
  );
}

function RowMark({
  row,
  state,
  number,
  onPick,
}: {
  row: Row;
  state: string;
  number?: number;
  onPick: () => void;
}) {
  const x1 = LANE_X(laneIndex(row.from));
  const x2 = LANE_X(laneIndex(row.to));
  const { y } = row;
  const num = number ? <tspan className="txw-row-num">{number} </tspan> : null;
  const self = x1 === x2;
  // Self rows: a small loop to the right with the label beside it. Others:
  // a straight arrow with the label centred above it.
  const d = self
    ? `M${x1} ${y}L${x1 + 20} ${y}Q${x1 + 24} ${y} ${x1 + 24} ${y + 4}L${x1 + 24} ${y + 12}Q${x1 + 24} ${y + 16} ${x1 + 20} ${y + 16}L${x1} ${y + 16}`
    : `M${x1} ${y}L${x2} ${y}`;
  const lx = self ? x1 + 32 : (x1 + x2) / 2;
  const ly = self ? y + 12.2 : y - 9.8;
  // A second line sits under a self row, or above a straight arrow's label.
  const lines = self ? row.label : [...row.label].reverse();
  const top = Math.min(y, ly - 12) - 6;
  const bottom = self ? y + 16 + 18 * (row.label.length - 1) + 6 : y + 8;
  return (
    <g className="txw-row" data-state={state} onClick={onPick}>
      <rect
        className="txw-row-hit"
        x="0"
        y={top}
        width={W}
        height={bottom - top}
      />
      <path
        className="txw-arrow"
        data-dashed={row.dashed || undefined}
        d={d}
        markerEnd="url(#txw-head-n)"
      />
      <path
        className="txw-arrow txw-arrow-on"
        data-dashed={row.dashed || undefined}
        d={d}
        markerEnd="url(#txw-head-a)"
      />
      {lines.map((line, k) => {
        const lineY = self ? ly + 18 * k : ly - 18 * k;
        const first = self ? k === 0 : k === lines.length - 1;
        return (
          <text
            key={k}
            className="txw-row-label"
            data-sub={(self && k > 0) || undefined}
            x={lx}
            y={lineY}
            style={{ textAnchor: self ? "start" : "middle" }}
          >
            {first ? num : null}
            {line}
          </text>
        );
      })}
      {row.note ? (
        <text
          className="txw-row-label"
          data-sub
          x={x1 + 12}
          y={y + 4.2}
          style={{ textAnchor: "start" }}
        >
          {row.note}
        </text>
      ) : null}
    </g>
  );
}

/* ----------------------------------------------------------- Step data */

function StepData({
  step,
  model,
  code,
  response,
  explorerUrl,
  rpcReferenceHref,
}: {
  step: Step;
  model: WalkthroughModel;
  code: Record<string, ReactNode>;
  response: ReactNode;
  explorerUrl: string;
  rpcReferenceHref: string;
}) {
  const excerpts = step.excerpts.map((id) => (
    <CodeExcerpt key={id} excerpt={EXCERPTS[id]} node={code[id]} />
  ));
  switch (step.id) {
    case "build":
      return (
        <>
          {excerpts}
          <Block title="The transaction" note="From the recorded run">
            <dl className="txw-dl">
              <dt>Fee payer</dt>
              <dd>
                <Account a={model.feePayer} />
              </dd>
              <dt>Recent blockhash</dt>
              <dd>
                <Mono>{model.recentBlockhash}</Mono>
              </dd>
              <dt>Size</dt>
              <dd>
                {fmt(model.sizeBytes)} of {fmt(model.maxBytes)} bytes (version{" "}
                {model.version} message)
              </dd>
            </dl>
            <h4 className="txw-sub">
              Instructions ({model.instructions.length})
            </h4>
            <ol className="txw-ix">
              {model.instructions.map((ix) => (
                <li key={ix.index}>
                  <span className="txw-ix-name">
                    {ix.program.label} · <code>{ix.name}</code>
                  </span>
                  <span className="txw-ix-meta">
                    {ix.accounts.length} accounts · data [{ix.data.join(", ")}]
                  </span>
                </li>
              ))}
            </ol>
            <h4 className="txw-sub">Accounts ({model.accounts.length})</h4>
            <div className="txw-table-wrap" data-txw-scroll tabIndex={0}>
              <table className="txw-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Account</th>
                    <th scope="col">Signer</th>
                    <th scope="col">Writable</th>
                  </tr>
                </thead>
                <tbody>
                  {model.accounts.map((a) => (
                    <tr key={a.index}>
                      <td>{a.index}</td>
                      <td>
                        <Account a={a} />
                      </td>
                      <td>{a.signer ? <Flag>signer</Flag> : null}</td>
                      <td>{a.writable ? <Flag>writable</Flag> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        </>
      );
    case "sign":
      return (
        <>
          {excerpts}
          <Block title="What's signed" note="From the recorded run">
            <dl className="txw-dl">
              <dt>Signer</dt>
              <dd>
                <Account a={model.feePayer} />
              </dd>
              <dt>Signs</dt>
              <dd>The {fmt(model.messageBytes)}-byte message</dd>
              <dt>Signatures required</dt>
              <dd>{model.numRequiredSignatures}</dd>
              <dt>Signature</dt>
              <dd>
                <Mono>{model.signature}</Mono>
              </dd>
            </dl>
          </Block>
        </>
      );
    case "send":
      return <>{excerpts}</>;
    case "fee":
      return (
        <>
          <Block title="Fee" note="From the recorded run">
            <dl className="txw-dl">
              <dt>Charged</dt>
              <dd>
                {fmt(model.fee)} lamports ({sol(model.fee)} SOL)
              </dd>
              <dt>Paid by</dt>
              <dd>
                <Account a={model.feePayer} />
              </dd>
            </dl>
          </Block>
        </>
      );
    case "run": {
      const escrows = model.balances.filter((b) => b.after === null);
      return (
        <>
          <Block title="What the program reads" note="From the recorded run">
            <dl className="txw-dl">
              {escrows.map((b) => (
                <FragmentRow
                  key={b.account.address}
                  term={b.account.label}
                  value={`${b.before} ${b.symbol}`}
                />
              ))}
            </dl>
          </Block>
          {excerpts}
        </>
      );
    }
    case "cpi":
      return (
        <>
          <Block title="The CPIs it made" note="From the recorded run">
            <ol className="txw-ix">
              {model.cpis.map((c, i) => (
                <li key={i}>
                  <span className="txw-ix-name">
                    {c.program.label} · <code>{c.name}</code>
                    {c.amount ? ` · ${c.amount} ${c.symbol}` : null}
                  </span>
                  <span className="txw-ix-meta">
                    {c.name === "CloseAccount"
                      ? `closes ${c.from.label}, rent to ${c.to.label}`
                      : `${c.from.label} → ${c.to.label}`}
                    {` · signed by ${c.authority.label}`}
                  </span>
                </li>
              ))}
            </ol>
          </Block>
          {excerpts}
        </>
      );
    case "result":
      return (
        <>
          <Block title="Result" note="From the recorded run">
            <dl className="txw-dl">
              <dt>Signature</dt>
              <dd>
                <Mono>{model.signature}</Mono>
                <span className="txw-hint">From a local test run</span>
              </dd>
              <dt>Status</dt>
              <dd>
                {model.succeeded ? "Succeeded" : "Failed"} (
                <code>err: null</code>)
              </dd>
              <dt>Fee</dt>
              <dd>{fmt(model.fee)} lamports</dd>
              {model.computeUnits !== null ? (
                <>
                  <dt>Compute units</dt>
                  <dd>{fmt(model.computeUnits)}</dd>
                </>
              ) : null}
            </dl>
            <h4 className="txw-sub">Token balances</h4>
            <div className="txw-table-wrap" data-txw-scroll tabIndex={0}>
              <table className="txw-table">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Before</th>
                    <th scope="col">After</th>
                  </tr>
                </thead>
                <tbody>
                  {model.balances.map((b) => (
                    <tr key={b.account.address}>
                      <td>{b.account.label}</td>
                      <td>
                        {b.before === null ? (
                          <span className="txw-dim">new account</span>
                        ) : (
                          `${b.before} ${b.symbol}`
                        )}
                      </td>
                      <td>
                        {b.after === null ? (
                          <span className="txw-dim">closed</span>
                        ) : (
                          `${b.after} ${b.symbol}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="txw-links">
              <a
                className="txw-btn txw-btn-run"
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                View the program on Explorer
              </a>
              <a className="txw-link" href={rpcReferenceHref}>
                <code>getTransaction</code> reference
              </a>
            </div>
          </Block>
          {excerpts}
          <Block title="getTransaction response (trimmed)" flush>
            <div className="txw-code" data-txw-scroll tabIndex={0}>
              {response}
            </div>
          </Block>
        </>
      );
  }
}

function FragmentRow({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Block({
  title,
  note,
  flush,
  children,
}: {
  title: ReactNode;
  note?: string;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="txw-block" data-flush={flush || undefined}>
      <div className="txw-block-head">
        <span className="txw-block-title">{title}</span>
        {note ? <span className="txw-block-note">{note}</span> : null}
      </div>
      <div className="txw-block-body">{children}</div>
    </div>
  );
}

function CodeExcerpt({ excerpt, node }: { excerpt: Excerpt; node: ReactNode }) {
  const s = excerpt.source;
  const link =
    s.kind === "github" ? (
      <a
        className="txw-link"
        href={githubUrl(s.path, excerpt.ranges)}
        target="_blank"
        rel="noreferrer"
      >
        {lineLabel(excerpt.ranges)} on GitHub
      </a>
    ) : (
      <a className="txw-link" href={s.href}>
        from {s.page}
      </a>
    );
  return (
    <Block
      flush
      title={<span className="txw-file">{excerpt.file}</span>}
      note={undefined}
    >
      <div className="txw-code" data-txw-scroll tabIndex={0}>
        {node}
      </div>
      <div className="txw-code-source">
        {s.kind === "github" ? "solana-foundation/dvp · " : "Tested code · "}
        {link}
      </div>
    </Block>
  );
}

function Account({ a }: { a: AccountRef }) {
  return (
    <span className="txw-account">
      <span>{a.label}</span>
      <Mono title={a.address}>{short(a.address)}</Mono>
    </span>
  );
}

function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <code className="txw-mono" title={title}>
      {children}
    </code>
  );
}

function Flag({ children }: { children: ReactNode }) {
  return <span className="txw-flag">{children}</span>;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString("en-US");
const sol = (lamports: number) =>
  (lamports / 1e9).toFixed(9).replace(/\.?0+$/, "");

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12">
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12">
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}
