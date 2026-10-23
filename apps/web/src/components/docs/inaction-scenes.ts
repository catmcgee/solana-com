/**
 * The scenes on "Solana in action" (<InActionScene kind="…" />): each
 * tutorial's run on a local test network, as a few beats of two actor cards
 * and what passes between them. Every amount, code, and signature here comes
 * from that run's output (packages/docs-examples/paths/<tutorial>/*.output.txt
 * and the generated demo snippets), so keep them in step when a run changes.
 */

export type SceneIcon =
  | "wallet"
  | "shop"
  | "server"
  | "network"
  | "app"
  | "person"
  | "unknown"
  | "issuer"
  | "holders";

export type Tone = "up" | "down" | "ok" | "bad" | "warn";

export interface SceneActor {
  icon: SceneIcon;
  name: string;
  note: string;
  /** Lines under the name, as of the end of the beat. */
  values?: { text: string; tone?: Tone }[];
}

export interface ScenePacket {
  label: string;
  icon?: "coin" | "doc" | "check" | "cross" | "pause";
  /** r: left actor to right actor; l: back. */
  dir: "r" | "l";
  solid?: boolean;
  tone?: Tone;
  /** The packet is refused: it stops short and fades. */
  refused?: boolean;
}

export interface SceneBeat {
  left: SceneActor;
  right: SceneActor;
  packets: ScenePacket[];
  /** One short line. `code` spans allowed. */
  caption: string;
}

export interface SceneDef {
  label: string;
  tutorial: { href: string; title: string };
  beats: SceneBeat[];
}

export type SceneKind = "checkout" | "paywall" | "asset" | "trade";

const customer: SceneActor = {
  icon: "wallet",
  name: "Customer",
  note: "pays in USDC",
};
const shop: SceneActor = {
  icon: "shop",
  name: "Sticker shop",
  note: "order-1001",
};
const network: SceneActor = {
  icon: "network",
  name: "Solana",
  note: "local test network",
};
const client: SceneActor = {
  icon: "app",
  name: "Client",
  note: "a script with a wallet",
};
const api: SceneActor = {
  icon: "server",
  name: "Forecast API",
  note: "0.001 USDC a call",
};
const holder: SceneActor = {
  icon: "wallet",
  name: "Holder",
  note: "approved · 1,000 LSF",
};
const issuer: SceneActor = {
  icon: "issuer",
  name: "Issuer",
  note: "Lisbon Solar Fund",
};
const seller: SceneActor = {
  icon: "person",
  name: "Seller",
  note: "delivers 4 LSF",
};
const buyer: SceneActor = {
  icon: "person",
  name: "Buyer",
  note: "pays in USDC",
};

export const SCENES: Record<SceneKind, SceneDef> = {
  checkout: {
    label: "A customer pays a shop 1 USDC, and the shop checks the payment",
    tutorial: {
      href: "/developers/docs/payments/checkout",
      title: "Build a checkout",
    },
    beats: [
      {
        left: { ...customer, values: [{ text: "−1 USDC", tone: "down" }] },
        right: {
          ...shop,
          values: [
            { text: "0 → 1 USDC", tone: "up" },
            { text: "Not verified yet" },
          ],
        },
        packets: [{ label: "1 USDC", icon: "coin", dir: "r", solid: true }],
        caption:
          "One USDC transfer, signed by the customer. Fee: 5,000 lamports.",
      },
      {
        left: {
          ...shop,
          values: [
            { text: "1 USDC" },
            { text: "Paid · ready to ship", tone: "ok" },
          ],
        },
        right: network,
        packets: [
          { label: "look up paxK…DAtJ", icon: "doc", dir: "r" },
          { label: "paid: true", icon: "check", dir: "l", tone: "ok" },
        ],
        caption:
          "The shop checks the amount, mint, recipient, and reference onchain.",
      },
    ],
  },
  paywall: {
    label: "A client calls a paid API, pays 0.001 USDC, and gets the data",
    tutorial: {
      href: "/developers/docs/payments/paywall-api",
      title: "Paywall an endpoint",
    },
    beats: [
      {
        left: client,
        right: api,
        packets: [{ label: "GET /api/forecast", icon: "doc", dir: "r" }],
        caption: "A request with no payment.",
      },
      {
        left: client,
        right: api,
        packets: [{ label: "402 · pay $0.001", dir: "l", tone: "warn" }],
        caption: "The API names its price: 1,000 base units of USDC.",
      },
      {
        left: { ...client, values: [{ text: "−0.001 USDC", tone: "down" }] },
        right: api,
        packets: [
          {
            label: "X-PAYMENT · 0.001 USDC",
            icon: "coin",
            dir: "r",
            solid: true,
          },
        ],
        caption: "The same request, with a signed USDC transfer in a header.",
      },
      {
        left: {
          ...client,
          values: [{ text: "Sunny, 24°C", tone: "ok" }],
        },
        right: { ...api, values: [{ text: "+0.001 USDC", tone: "up" }] },
        packets: [
          { label: "200 · Sunny, 24°C", icon: "check", dir: "l", tone: "ok" },
        ],
        caption: "The API settles the payment onchain, then answers.",
      },
    ],
  },
  asset: {
    label:
      "A restricted asset: a transfer to an approved investor confirms, one to an unknown account fails, and a pause blocks every transfer",
    tutorial: {
      href: "/developers/docs/assets/issue-asset",
      title: "Issue an asset",
    },
    beats: [
      {
        left: { ...holder, values: [{ text: "1,000 → 900 LSF" }] },
        right: {
          icon: "person",
          name: "Approved investor",
          note: "thawed by the issuer",
          values: [
            { text: "0 → 100 LSF", tone: "up" },
            { text: "✓ Confirmed", tone: "ok" },
          ],
        },
        packets: [
          { label: "100 LSF", icon: "coin", dir: "r", solid: true, tone: "ok" },
        ],
        caption: "The issuer approved this account, so the transfer confirms.",
      },
      {
        left: { ...holder, values: [{ text: "900 LSF" }] },
        right: {
          icon: "unknown",
          name: "Unknown account",
          note: "nobody approved it",
          values: [
            { text: "Frozen · 0 LSF" },
            { text: "✕ Account is frozen", tone: "bad" },
          ],
        },
        packets: [
          {
            label: "1 LSF",
            icon: "coin",
            dir: "r",
            tone: "bad",
            refused: true,
          },
        ],
        caption: "The token refuses it: Token-2022 error 17, nothing moves.",
      },
      {
        left: issuer,
        right: {
          icon: "holders",
          name: "Every holder",
          note: "all LSF accounts",
          values: [{ text: "✕ Transfers paused", tone: "bad" }],
        },
        packets: [{ label: "Pause", icon: "pause", dir: "r", solid: true }],
        caption:
          "A pause blocks every transfer (error 67) until the issuer resumes.",
      },
    ],
  },
  trade: {
    label:
      "Delivery versus payment: 4 LSF for 5.000704 USDC, both legs in one transaction or neither",
    tutorial: {
      href: "/developers/docs/defi/settle-trade",
      title: "Settle a trade",
    },
    beats: [
      {
        left: {
          ...seller,
          values: [{ text: "4 LSF in escrow" }, { text: "Nothing moved" }],
        },
        right: {
          ...buyer,
          values: [
            { text: "0 USDC in escrow", tone: "bad" },
            { text: "Nothing moved" },
          ],
        },
        packets: [
          {
            label: "4 LSF",
            icon: "coin",
            dir: "r",
            refused: true,
            tone: "bad",
          },
          {
            label: "USDC missing",
            icon: "cross",
            dir: "l",
            refused: true,
            tone: "bad",
          },
        ],
        caption: "The cash leg isn't funded: `SettleDvp` fails (DvP error 4).",
      },
      {
        left: {
          ...seller,
          values: [
            { text: "+5.000704 USDC", tone: "up" },
            { text: "1,000 → 996 LSF" },
          ],
        },
        right: {
          ...buyer,
          values: [
            { text: "+4 LSF", tone: "up" },
            { text: "−5.000704 USDC", tone: "down" },
          ],
        },
        packets: [
          { label: "4 LSF", icon: "coin", dir: "r", solid: true },
          { label: "5.000704 USDC", icon: "coin", dir: "l", solid: true },
        ],
        caption: "Both legs funded: one `SettleDvp` moves both at once.",
      },
    ],
  },
};
