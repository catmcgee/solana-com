/*
 * Client-only enhancement (WP8b, spec §3.4 item 6): the wallet buy-sticker payment.
 *
 * Mintlify renders JSX snippet components in the browser only, so this is an
 * optional extra. The generated snippets/paths/<lang>/checkout/demo.mdx always
 * prints the same steps and recorded outputs as static content right below
 * it, so the page reads completely without JavaScript.
 *
 * It replays output recorded on a local Surfpool network (WP5). There is no
 * wallet connection and no network call.
 *
 * Props (inlined by gen:paths): title, success, ui, steps[{ label, status?, output }].
 * Self-contained on purpose: no imports (Mintlify injects the React hooks).
 */
export const CheckoutDemo = ({
  title = "Demo",
  success = "",
  ui = {},
  steps = [],
}) => {
  const t = {
    run: "Run step",
    running: "Running…",
    reset: "Start over",
    finished: "Finished",
    badge: "Replay of a recorded run · test money",
    item: "Holographic sticker",
    notPaid: "Not paid yet",
    checking: "Paid, checking…",
    confirmed: "Paid and confirmed",
    ...ui,
  };
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const finished = steps.length > 0 && done >= steps.length;
  const last = done > 0 ? steps[done - 1] : undefined;
  const run = () => {
    if (busy || finished) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBusy(true);
    setTimeout(
      () => {
        setDone((d) => d + 1);
        setBusy(false);
      },
      reduced ? 0 : 500,
    );
  };
  const reset = () => {
    setDone(0);
    setBusy(false);
  };
  const paid = done >= 1;
  const confirmed = finished;
  const stage = (
    <div className="sol-demo-stage">
      <div className="sol-demo-shop">
        <span className="sol-demo-art" aria-hidden="true">
          ☀
        </span>
        <b>{t.item}</b>
        <span className="sol-demo-price">1.00 USDC</span>
        <span
          className="sol-demo-pill"
          data-state={confirmed ? "ok" : paid ? "pending" : "todo"}
        >
          {confirmed ? t.confirmed : paid ? t.checking : t.notPaid}
        </span>
      </div>
    </div>
  );
  return (
    <div className="sol-demo not-prose" data-demo="checkout">
      <div className="sol-demo-head">
        <span className="sol-demo-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="sol-demo-title">{title}</span>
        <span className="sol-demo-badge">{t.badge}</span>
      </div>
      <div className="sol-demo-body">
        {stage}
        <ol className="sol-demo-steps">
          {steps.map((s, i) => (
            <li
              key={i}
              data-state={
                i < done
                  ? "done"
                  : i === done
                    ? busy
                      ? "running"
                      : "current"
                    : "todo"
              }
            >
              <span className="sol-demo-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="sol-demo-step-label">{s.label}</span>
              {s.status && i < done ? (
                <span className="sol-demo-status" data-status={s.status}>
                  {s.status}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="sol-demo-console" role="log" aria-live="polite">
          {done === 0 ? (
            <span className="sol-demo-console-empty">$ _</span>
          ) : null}
          {steps.slice(0, done).map((s, i) => (
            <div key={i} className="sol-demo-console-entry">
              <div className="sol-demo-console-cmd">$ {s.label}</div>
              <pre>{s.output}</pre>
            </div>
          ))}
        </div>
        {finished && success ? (
          <div className="sol-demo-success" role="status">
            <span className="sol-demo-success-icon" aria-hidden="true">
              ✓
            </span>
            <span>{success}</span>
          </div>
        ) : null}
        <div className="sol-demo-controls">
          <button
            type="button"
            className="sol-demo-run"
            onClick={run}
            disabled={busy || finished}
            aria-busy={busy ? "true" : "false"}
          >
            {busy
              ? t.running
              : finished
                ? t.finished
                : `${t.run} ${done + 1}: ${steps[done] ? steps[done].label : ""}`}
          </button>
          {done > 0 ? (
            <button type="button" className="sol-demo-reset" onClick={reset}>
              {t.reset}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
