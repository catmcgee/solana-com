#!/usr/bin/env node
/**
 * Draws the diagrams that used to be pastel PNGs (transaction format,
 * message header, compact arrays, legacy limits, payment flow, Actions
 * lifecycle, SWQoS peering) as light/dark SVG pairs in the docs palette:
 * 688px wide (the content column, so 13px labels are 13px on the page),
 * 1.5px strokes, 8px corners, purple / teal / green accents on zinc.
 *
 *   node packages/docs-tooling/scripts/draw-diagrams.mjs
 *   python3 packages/docs-tooling/scripts/embed-diagram-fonts.py
 *
 * Writes <name>-light.svg and <name>.svg next to the old PNGs. The pages
 * link the pair with `block dark:hidden` / `hidden dark:block` images.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/docs/docs-assets/assets",
);

const P = {
  light: {
    ink: "#18181b",
    muted: "#52525b",
    line: "#71717a",
    nFill: "#fafafa",
    nStroke: "#d4d4d8",
    purple: "#7c3aed",
    purpleFill: "#f3edff",
    teal: "#0f9e94",
    tealFill: "#e6f8f6",
    green: "#0a8f5a",
    greenFill: "#e3fbef",
  },
  dark: {
    ink: "#f2f2f3",
    muted: "#a1a1aa",
    line: "#8b8b94",
    nFill: "#111113",
    nStroke: "#3f3f46",
    purple: "#b78aff",
    purpleFill: "#1c1430",
    teal: "#19d3c5",
    tealFill: "#0b2422",
    green: "#14f195",
    greenFill: "#0b261b",
  },
};
const W = 688;
const SANS = "Diatype,Inter,ui-sans-serif,system-ui,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A drawing context for one mode. */
function ctx(mode) {
  const c = P[mode];
  const tone = (t) =>
    ({
      purple: [c.purple, c.purpleFill],
      teal: [c.teal, c.tealFill],
      green: [c.green, c.greenFill],
      neutral: [c.nStroke, c.nFill],
      ghost: [c.nStroke, "none"],
    })[t];
  const parts = [];
  const api = {
    c,
    box(x, y, w, h, t = "neutral", { dashed = false, rx = 8 } = {}) {
      const [s, f] = tone(t);
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}" stroke="${s}" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 4"' : ""}/>`,
      );
    },
    /** Centred lines; each line is a string or [{t, b, i, mono}] runs. */
    text(
      x,
      y,
      lines,
      {
        size = 13,
        color = c.ink,
        anchor = "middle",
        lh = 1.4,
        weight = 400,
        mono = false,
      } = {},
    ) {
      const arr = Array.isArray(lines) ? lines : [lines];
      const top = y - ((arr.length - 1) * size * lh) / 2;
      arr.forEach((ln, i) => {
        const runs = typeof ln === "string" ? [{ t: ln }] : ln;
        const spans = runs
          .map(
            (r) =>
              `<tspan${r.b ? ' font-weight="600"' : ""}${r.i ? ' font-style="italic"' : ""}${r.c ? ` fill="${r.c}"` : ""}>${esc(r.t)}</tspan>`,
          )
          .join("");
        parts.push(
          `<text x="${x}" y="${(top + i * size * lh).toFixed(1)}" dominant-baseline="central" text-anchor="${anchor}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${color}">${spans}</text>`,
        );
      });
    },
    /** Polyline with an arrow head at the end. */
    arrow(points, { dashed = false, color = c.line, head = true } = {}) {
      const d = points
        .map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`)
        .join(" ");
      parts.push(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="4 4"' : ""}${head ? ` marker-end="url(#ah-${mode})"` : ""}/>`,
      );
    },
    line(x1, y1, x2, y2, { color = c.nStroke, dashed = false } = {}) {
      parts.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5"${dashed ? ' stroke-dasharray="3 4"' : ""}/>`,
      );
    },
    raw(s) {
      parts.push(s);
    },
    svg(h, title) {
      return `<svg data-sol-type="1" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><defs><marker id="ah-${mode}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5 L8.5 5 L1 8.5" fill="none" stroke="${c.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>${parts.join("")}</svg>\n`;
    },
  };
  return api;
}

const diagrams = {
  "docs/core/transactions/tx_format": {
    title: "A transaction: a compact array of signatures, then the message",
    draw(d) {
      d.box(8, 12, 330, 64, "purple");
      d.text(173, 44, [
        "Compact array of signatures",
        [{ t: "64 bytes × number of signatures", c: d.c.muted }],
      ]);
      d.box(350, 12, 330, 64, "teal");
      d.text(515, 44, [
        "Message",
        [{ t: "header, accounts, blockhash, instructions", c: d.c.muted }],
      ]);
      return 88;
    },
  },
  "docs/core/transactions/message_header": {
    title: "The message header: three u8 counts",
    draw(d) {
      d.box(234, 8, 220, 56, "teal");
      d.text(344, 36, ["Header", [{ t: "3 bytes", c: d.c.muted }]]);
      d.arrow([
        [344, 64],
        [344, 104],
      ]);
      const cols = [
        ["Required signatures", "(signer accounts)"],
        ["Read-only accounts", "that sign"],
        ["Read-only accounts", "that do not sign"],
      ];
      cols.forEach((t, i) => {
        const x = 8 + i * 226;
        d.box(x, 110, 220, 84, "purple");
        d.text(x + 110, 152, [t[0], t[1], [{ t: "u8", c: d.c.muted }]], {
          lh: 1.45,
        });
      });
      return 204;
    },
  },
  "docs/core/transactions/compact_array_format": {
    title: "Compact array format: a compact-u16 length, then the items",
    draw(d) {
      d.box(8, 12, 236, 64, "teal");
      d.text(126, 44, [
        "Array length",
        [{ t: "compact-u16 encoding", c: d.c.muted }],
      ]);
      for (let i = 0; i < 6; i++) {
        const x = 252 + i * 72;
        d.box(x, 12, 64, 64, i < 4 ? "neutral" : "ghost", { dashed: i >= 4 });
        d.text(x + 32, 44, "item", { color: i < 4 ? d.c.ink : d.c.muted });
      }
      return 88;
    },
  },
  "docs/core/transactions/compat_array_of_account_addresses": {
    title:
      "Account addresses: signers first, then non-signers; writable before read-only",
    draw(d) {
      d.box(184, 8, 320, 56, "teal");
      d.text(344, 36, [
        "Compact array of account addresses",
        [{ t: "32 bytes × number of accounts", c: d.c.muted }],
      ]);
      d.arrow([
        [344, 64],
        [344, 100],
      ]);
      [
        ["Accounts that sign", "32 bytes × signers"],
        ["Accounts that do not sign", "32 bytes × non-signers"],
      ].forEach((t, i) => {
        const x = 8 + i * 340;
        d.box(x, 106, 332, 56, "purple");
        d.text(x + 166, 134, [t[0], [{ t: t[1], c: d.c.muted }]]);
        d.box(x, 170, 162, 40, "ghost", { dashed: true });
        d.text(x + 81, 190, "Writable", { color: d.c.muted, size: 12.5 });
        d.box(x + 170, 170, 162, 40, "ghost", { dashed: true });
        d.text(x + 251, 190, "Read-only", { color: d.c.muted, size: 12.5 });
      });
      return 220;
    },
  },
  "docs/core/transactions/compact_array_of_ixs": {
    title:
      "Compact array of instructions and the three parts of each instruction",
    draw(d) {
      d.box(204, 8, 280, 48, "teal");
      d.text(344, 32, "Compact array of instructions");
      d.arrow([
        [344, 56],
        [344, 88],
      ]);
      for (let i = 0; i < 5; i++) {
        const x = 54 + i * 118;
        d.box(x, 94, 110, 44, i < 3 ? "neutral" : "ghost", { dashed: i >= 3 });
        d.text(x + 55, 116, "Instruction", {
          size: 12.5,
          color: i < 3 ? d.c.ink : d.c.muted,
        });
      }
      d.arrow([
        [109, 138],
        [109, 160],
        [344, 160],
        [344, 182],
      ]);
      [
        ["Program ID index", "u8"],
        ["Account address indexes", "compact array · len × u8"],
        ["Instruction data", "compact array · len × u8"],
      ].forEach((t, i) => {
        const x = 8 + i * 226;
        d.box(x, 188, 220, 60, "purple");
        d.text(x + 110, 218, [t[0], [{ t: t[1], c: d.c.muted }]]);
      });
      return 258;
    },
  },
  "docs/core/transactions/issues_with_legacy_txs": {
    title:
      "Legacy transaction size limits: 1,232 bytes for signatures and message",
    draw(d) {
      d.box(8, 10, 300, 64, "purple");
      d.text(158, 42, [
        [{ t: "Signatures", b: true }],
        [{ t: "up to 19 · 64 bytes each", c: d.c.muted }],
      ]);
      d.box(316, 10, 364, 64, "teal");
      d.text(498, 42, [
        [{ t: "Message", b: true }, { t: ": metadata + accounts" }],
        [{ t: "up to 35 accounts · 32 bytes each", c: d.c.muted }],
      ]);
      d.arrow(
        [
          [8, 92],
          [680, 92],
        ],
        { head: true, color: d.c.line },
      );
      d.arrow(
        [
          [680, 92],
          [8, 92],
        ],
        { head: true, color: d.c.line },
      );
      d.box(289, 80, 110, 24, "green", { rx: 12 });
      d.text(344, 92, "1,232 bytes", {
        size: 12.5,
        color: d.c.green,
        weight: 600,
      });
      return 112;
    },
  },
  "docs/payments/payment-flow": {
    title:
      "A wallet holds one token account per token; sending 10 USDG moves it between USDG token accounts",
    draw(d) {
      // Sender column
      d.box(8, 8, 270, 40, "neutral");
      d.text(24, 28, "Sender’s wallet", { anchor: "start", weight: 600 });
      d.line(28, 48, 28, 300);
      const acct = (y, lines, t = "neutral", dashed = false) => {
        d.line(28, y + 28, 44, y + 28);
        d.box(
          44,
          y,
          234,
          lines.length > 1 ? 56 + (lines.length - 2) * 18 : 40,
          t,
          { dashed },
        );
        d.text(
          58,
          y + (lines.length > 1 ? 28 + ((lines.length - 2) * 18) / 2 : 20),
          lines.map((l, i) =>
            i ? [{ t: l, c: d.c.muted }] : [{ t: l, b: true }],
          ),
          { anchor: "start", size: 12.5, lh: 1.45 },
        );
      };
      acct(
        60,
        ["USDG token account", "Before: 100 USDG", "After: 90 USDG"],
        "purple",
      );
      acct(144, ["USDC token account", "Balance: 50 USDC"]);
      acct(208, ["PYUSD token account", "Balance: 200 PYUSD"]);
      acct(272, ["More token accounts…"], "ghost", true);
      // Receiver column
      d.box(410, 8, 270, 40, "neutral");
      d.text(426, 28, "Receiver’s wallet", { anchor: "start", weight: 600 });
      d.line(430, 48, 430, 88);
      d.line(430, 88, 446, 88);
      d.box(446, 60, 234, 74, "teal");
      d.text(
        460,
        97,
        [
          [{ t: "USDG token account", b: true }],
          [{ t: "Before: 45 USDG", c: d.c.muted }],
          [{ t: "After: 55 USDG", c: d.c.muted }],
        ],
        { anchor: "start", size: 12.5, lh: 1.45 },
      );
      d.arrow([
        [278, 97],
        [440, 97],
      ]);
      d.text(359, 84, "Send 10 USDG", { size: 12.5, color: d.c.muted });
      return 320;
    },
  },
  "docs/action-execution-and-lifecycle": {
    title:
      "Solana Actions: execution and lifecycle between the user, the Action client, the Action provider and Solana",
    draw(d) {
      const lanes = [
        ["User", 52, "purple"],
        ["Action client", 268, "purple"],
        ["Action provider", 498, "teal"],
        ["Solana", 636, "green"],
      ];
      const top = 8;
      const msgs = [
        [0, 1, ["Scans a QR code, clicks", "a link or a button"]],
        [1, 2, ["GET request for metadata"]],
        [2, 1, ["Metadata and available", "Actions"]],
        [1, 0, ["Shows the Action UI"]],
        [0, 1, ["Chooses an Action"]],
        [1, 2, ["POST request with", "the wallet’s public key"]],
        [2, 1, ["Serialized transaction"]],
        [1, 0, ["Shows transaction details"]],
        [0, 1, ["Approves the transaction"]],
        [1, 3, ["Signs and sends", "the transaction"]],
      ];
      const rowH = 42;
      const y0 = top + 36 + 24;
      const bottom = y0 + msgs.length * rowH;
      lanes.forEach(([name, x, t]) => {
        d.box(x - 50, top, 100, 32, t);
        d.text(x, top + 16, name, { size: 12.5, weight: 500 });
        d.line(x, top + 32, x, bottom, { dashed: true });
      });
      msgs.forEach(([a, b, label], i) => {
        const y = y0 + i * rowH + 22;
        const xa = lanes[a][1];
        const xb = lanes[b][1];
        const dir = Math.sign(xb - xa);
        d.arrow(
          [
            [xa + dir * 2, y],
            [xb - dir * 4, y],
          ],
          { dashed: b < a },
        );
        const mid = b === 3 ? (xa + lanes[2][1]) / 2 : (xa + xb) / 2;
        d.text(
          mid,
          y - 11 - ((label.length - 1) * 12 * 1.3) / 2,
          label.map((l) => [{ t: l }]),
          { size: 12, lh: 1.3 },
        );
      });
      return bottom + 8;
    },
  },
  "guides/stake-weighted-qos-guide/peered-RPCs-guide": {
    title: "RPC nodes peering with a staked validator for stake-weighted QoS",
    draw(d) {
      d.box(40, 92, 180, 96, "purple", { rx: 12 });
      d.text(130, 140, "Validator", { weight: 600 });
      d.text(130, 210, "--staked-nodes-overrides", {
        mono: true,
        size: 12,
        color: d.c.muted,
      });
      for (let i = 0; i < 4; i++) {
        const y = 14 + i * 64;
        d.box(468, y, 140, 44, "teal");
        d.text(538, y + 22, "RPC node");
        d.arrow([
          [468, y + 22],
          [226, 116 + i * 16],
        ]);
      }
      d.text(538, 284, "--rpc-send-transaction-tpu-peer HOST:PORT", {
        mono: true,
        size: 12,
        color: d.c.muted,
      });
      return 300;
    },
  },
};

for (const [name, def] of Object.entries(diagrams)) {
  for (const mode of ["light", "dark"]) {
    const d = ctx(mode);
    const h = def.draw(d);
    const file = path.join(
      assets,
      `${name}${mode === "light" ? "-light" : ""}.svg`,
    );
    writeFileSync(file, d.svg(h, def.title));
  }
}
console.log(
  `draw-diagrams: ${Object.keys(diagrams).length} diagram pair(s) written`,
);
