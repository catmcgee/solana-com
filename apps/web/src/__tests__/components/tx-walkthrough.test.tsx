import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../../../packages/docs-examples/paths/defi/settle-trade/settle-walkthrough.json";
import {
  DVP_COMMIT,
  DVP_REPO,
  ELISION,
  EXCERPTS,
  githubUrl,
  type Excerpt,
} from "@/components/tx-walkthrough/excerpts";
import {
  buildModel,
  DVP_PROGRAM,
  INSTRUCTION_NAMES,
  trimmedResponse,
  type RecordedFixture,
} from "@/components/tx-walkthrough/model";
import { ROWS, STEPS } from "@/components/tx-walkthrough/steps";
import {
  STEP_MS,
  TxWalkthroughClient,
} from "@/components/tx-walkthrough/tx-walkthrough.client";

const repoRoot = path.resolve(__dirname, "../../../../..");
const recorded = fixture as unknown as RecordedFixture;
const model = buildModel(recorded);

/** The cited lines, dedented by their common indent, joined by `// …`. */
function cite(source: string, ranges: [number, number][]) {
  const lines = source.split("\n");
  const chunks = ranges.map(([a, b]) => lines.slice(a - 1, b));
  const indent = Math.min(
    ...chunks
      .flat()
      .filter((l) => l.trim())
      .map((l) => l.length - l.trimStart().length),
  );
  return chunks
    .map((c) => c.map((l) => (l.trim() ? l.slice(indent) : "")).join("\n"))
    .join(`\n${ELISION}\n`);
}

const byKind = (kind: Excerpt["source"]["kind"]) =>
  Object.values(EXCERPTS).filter((e) => e.source.kind === kind);

describe("tx-walkthrough excerpts match the sources they cite", () => {
  it.each(byKind("repo").map((e) => [e.id, e] as const))(
    "%s (tested example code in this repo)",
    (_id, e) => {
      const source = readFileSync(path.join(repoRoot, e.source.path), "utf8");
      expect(e.code).toBe(cite(source, e.ranges));
    },
  );

  it.for(byKind("github"))(
    `$id (${DVP_REPO} at the pinned commit)`,
    { timeout: 20_000 },
    async (e, ctx) => {
      const url = `https://raw.githubusercontent.com/${DVP_REPO}/${DVP_COMMIT}/${e.source.path}`;
      let source: string;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        source = await res.text();
      } catch {
        // Offline: the commit is pinned, so the source cannot change, only
        // the excerpt; it is checked on the next run with network.
        ctx.skip();
        return;
      }
      expect(e.code).toBe(cite(source, e.ranges));
      expect(githubUrl(e.source.path, e.ranges)).toContain(
        `/blob/${DVP_COMMIT}/${e.source.path}#L${e.ranges[0][0]}-L`,
      );
    },
  );

  it("every step's excerpts exist", () => {
    for (const s of STEPS)
      for (const id of s.excerpts) expect(EXCERPTS[id], id).toBeDefined();
  });

  it("DvP instruction names follow the generated client's discriminators", () => {
    const dir = path.join(
      repoRoot,
      "packages/docs-examples/paths/defi/settle-trade/dvp/generated/instructions",
    );
    for (const [n, name] of Object.entries(INSTRUCTION_NAMES[DVP_PROGRAM])) {
      const file = `${name[0].toLowerCase()}${name.slice(1)}.ts`;
      const text = readFileSync(path.join(dir, file), "utf8");
      const constName = name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      expect(text).toContain(`export const ${constName}_DISCRIMINATOR = ${n};`);
    }
  });
});

describe("tx-walkthrough model (from the recorded run)", () => {
  it("reads the transaction message", () => {
    expect(model.feePayer).toMatchObject({
      label: "Settlement agent",
      signer: true,
      writable: true,
    });
    expect(model.accounts.filter((a) => a.signer)).toHaveLength(1);
    expect(model.instructions.map((i) => i.name)).toEqual([
      "CreateIdempotent",
      "CreateIdempotent",
      "CreateIdempotent",
      "CreateIdempotent",
      "SettleDvp",
    ]);
    const settle = model.instructions[4];
    expect(settle.program.address).toBe(DVP_PROGRAM);
    expect(settle.data).toEqual([2, 0]); // SettleDvp, legAExtrasCount 0
    expect(settle.accounts).toHaveLength(13);
    expect(model.sizeBytes).toBeLessThanOrEqual(model.maxBytes);
    expect(model.messageBytes).toBe(model.sizeBytes - 1 - 64);
  });

  it("decodes the CPIs: 100 USDC out of the PDA-owned escrow, signed by the PDA", () => {
    const [cash, asset, ...closes] = model.cpis;
    expect(cash).toMatchObject({
      name: "TransferChecked",
      amount: "100",
      symbol: "USDC",
      from: { label: "USDC escrow" },
      to: { label: "Seller's USDC account" },
      authority: { label: "Trade record (PDA)" },
    });
    expect(cash.program.label).toBe("Token Program");
    expect(asset).toMatchObject({
      name: "TransferChecked",
      amount: "80",
      symbol: "fund shares",
    });
    expect(closes.map((c) => c.name)).toEqual(["CloseAccount", "CloseAccount"]);
  });

  it("reports balances that changed, with closed escrows", () => {
    const by = Object.fromEntries(
      model.balances.map((b) => [b.account.label, [b.before, b.after]]),
    );
    expect(by["USDC escrow"]).toEqual(["100", null]);
    expect(by["Seller's USDC account"]).toEqual([null, "100"]);
    expect(by["Fund share escrow"]).toEqual(["80", null]);
    expect(by["Buyer's fund share account"]).toEqual(["0", "80"]);
    expect(model.succeeded).toBe(true);
    expect(model.fee).toBeGreaterThan(0);
  });

  it("trims the response to the DvP instruction's logs", () => {
    const r = trimmedResponse(recorded, model);
    expect(r.meta.err).toBeNull();
    expect(r.meta.logMessages[0]).toBe("…");
    expect(r.meta.logMessages[1]).toBe(`Program ${DVP_PROGRAM} invoke [1]`);
    expect(r.meta.logMessages.at(-1)).toBe(`Program ${DVP_PROGRAM} success`);
  });
});

describe("TxWalkthroughClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const code = Object.fromEntries(
    Object.values(EXCERPTS).map((e) => [e.id, <pre key={e.id}>{e.code}</pre>]),
  );
  const renderIt = () =>
    render(
      <TxWalkthroughClient
        model={model}
        code={code}
        response={<pre>response</pre>}
        explorerUrl={`https://explorer.solana.com/address/${DVP_PROGRAM}?cluster=devnet`}
        rpcReferenceHref="/developers/docs/rpc/http/gettransaction"
      />,
    );
  const panelTitle = () =>
    screen.getByRole("heading", { level: 3 }).textContent;

  it("renders all seven steps from the fixture with Next", () => {
    renderIt();
    expect(STEPS).toHaveLength(7);
    expect(panelTitle()).toBe(STEPS[0].title);
    expect(screen.getByText(/getSettleDvpInstruction\(/)).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next" });
    for (let i = 1; i < STEPS.length; i++) {
      fireEvent.click(next);
      expect(panelTitle()).toBe(STEPS[i].title);
      expect(
        screen.getByText(`Step ${i + 1} of 7: ${STEPS[i].title}`),
      ).toBeInTheDocument();
    }
    expect(next).toBeDisabled();
    // Result: the recorded signature, balances, and links.
    expect(screen.getAllByText(model.signature).length).toBeGreaterThan(0);
    expect(screen.getAllByText("closed")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "View the program on Explorer" }),
    ).toHaveAttribute(
      "href",
      `https://explorer.solana.com/address/${DVP_PROGRAM}?cluster=devnet`,
    );
    expect(
      screen.getByRole("link", { name: "getTransaction reference" }),
    ).toHaveAttribute("href", "/developers/docs/rpc/http/gettransaction");
  });

  it("shows the recorded transaction and CPIs on their steps", () => {
    renderIt();
    expect(
      screen.getByText(`${model.sizeBytes} of 1,232 bytes`, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(model.recentBlockhash)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Step 4:/ }));
    expect(
      screen.getByText(`${model.fee.toLocaleString("en-US")} lamports`, {
        exact: false,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Step 6:/ }));
    expect(
      screen.getByText("USDC escrow → Seller's USDC account", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/All or nothing/).length).toBeGreaterThan(0);
  });

  it("lights the transaction-flow rows of the current step; a row click picks its step", () => {
    const { container } = renderIt();
    for (const s of STEPS)
      expect(
        ROWS.some((r) => r.step === s.id),
        s.id,
      ).toBe(true);
    const rows = container.querySelectorAll(".txw-row");
    expect(rows).toHaveLength(ROWS.length);
    const active = () =>
      [...rows].filter((r) => r.getAttribute("data-state") === "active").length;
    expect(active()).toBe(1); // build transaction
    fireEvent.click(rows[ROWS.findIndex((r) => r.step === "cpi")]);
    expect(panelTitle()).toBe(STEPS[5].title);
    expect(active()).toBe(ROWS.filter((r) => r.step === "cpi").length);
    // The fee and the confirmation sit outside the atomic box.
    expect(STEPS.filter((s) => s.atomic).map((s) => s.id)).toEqual([
      "run",
      "cpi",
    ]);
  });

  it("moves with the arrow keys, Home, and End", () => {
    const { container } = renderIt();
    const section = container.querySelector("section")!;
    fireEvent.keyDown(section, { key: "ArrowRight" });
    expect(panelTitle()).toBe(STEPS[1].title);
    fireEvent.keyDown(section, { key: "End" });
    expect(panelTitle()).toBe(STEPS[6].title);
    fireEvent.keyDown(section, { key: "ArrowLeft" });
    expect(panelTitle()).toBe(STEPS[5].title);
    fireEvent.keyDown(section, { key: "Home" });
    expect(panelTitle()).toBe(STEPS[0].title);
  });

  it("Run plays every step and stops at the end; Pause stops it", () => {
    vi.useFakeTimers();
    renderIt();
    const run = screen.getByRole("button", { name: "Run" });
    fireEvent.click(run);
    expect(run).toHaveAttribute("aria-pressed", "true");
    for (let i = 1; i < STEPS.length; i++) {
      act(() => {
        vi.advanceTimersByTime(STEP_MS);
      });
      expect(panelTitle()).toBe(STEPS[i].title);
    }
    act(() => {
      vi.advanceTimersByTime(STEP_MS * 2);
    });
    expect(panelTitle()).toBe(STEPS[6].title);
    expect(screen.getByRole("button", { name: "Run again" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    expect(panelTitle()).toBe(STEPS[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      vi.advanceTimersByTime(STEP_MS * 3);
    });
    expect(panelTitle()).toBe(STEPS[0].title);
  });

  it("marks the current step for assistive tech", () => {
    renderIt();
    const dots = within(
      screen.getByRole("group", { name: "Walkthrough controls" }),
    ).getAllByRole("button", { name: /^Step \d:/ });
    expect(dots).toHaveLength(7);
    expect(dots[0]).toHaveAttribute("aria-current", "step");
    fireEvent.click(dots[3]);
    expect(dots[3]).toHaveAttribute("aria-current", "step");
    expect(dots[0]).not.toHaveAttribute("aria-current");
  });
});
