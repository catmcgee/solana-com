import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";

const mocks = vi.hoisted(() => ({
  isBot: false as boolean | "throw",
  createSolanaRpc: vi.fn(),
  balances: new Map<string, string>(),
  sent: [] as string[],
  status: "confirmed" as string | null,
}));

vi.mock("botid/server", () => ({
  checkBotId: async () => {
    if (mocks.isBot === "throw") throw new Error("x-vercel-oidc-token missing");
    return { isBot: mocks.isBot };
  },
}));
vi.mock("@solana/kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@solana/kit")>()),
  createSolanaRpc: mocks.createSolanaRpc,
}));

/** A throwaway keypair in solana-keygen's JSON format (test only). */
function keypairJson(): string {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const priv = privateKey
    .export({ format: "der", type: "pkcs8" })
    .subarray(-32);
  return JSON.stringify([...priv, ...pub]);
}

const SIG_STATUS = () => ({
  value: [
    mocks.status ? { confirmationStatus: mocks.status, err: null } : null,
  ],
});

function fakeRpc() {
  let n = 0;
  return {
    getTokenAccountBalance: () => ({
      send: async () => {
        // First read is the payer's token account, the second the payee's.
        const amount = [...mocks.balances.values()][n++] ?? "0";
        return { value: { amount } };
      },
    }),
    getLatestBlockhash: () => ({
      send: async () => ({
        value: {
          blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
          lastValidBlockHeight: 100n,
        },
      }),
    }),
    sendTransaction: (wire: string) => ({
      send: async () => {
        mocks.sent.push(wire);
        return "sig";
      },
    }),
    getSignatureStatuses: () => ({ send: async () => SIG_STATUS() }),
  };
}

/** Instructions in the last transaction the route sent. */
function lastInstructions() {
  const tx = getTransactionDecoder().decode(
    getBase64Encoder().encode(mocks.sent.at(-1)!),
  );
  const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (msg.version === 1) throw new Error("unexpected v1 message");
  return msg.instructions;
}

let ip = 0;
function post(path: string) {
  ip++;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": `10.0.0.${ip}` },
  });
}

async function routes() {
  vi.resetModules();
  const checkout = await import("@/app/api/demo/checkout/route");
  const paywall = await import("@/app/api/demo/paywall-call/route");
  return { checkout: checkout.POST, paywall: paywall.POST };
}

beforeEach(() => {
  vi.stubEnv("DEMO_PAYER_SECRET_KEY", keypairJson());
  vi.stubEnv("DEMO_PAYEE_SECRET_KEY", keypairJson());
  vi.stubEnv("HELIUS_API_KEY", "test-key");
  mocks.isBot = false;
  mocks.status = "confirmed";
  mocks.sent = [];
  mocks.balances = new Map([
    ["payer", "10000000"],
    ["payee", "0"],
  ]);
  mocks.createSolanaRpc.mockImplementation(fakeRpc);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("demo transfer routes", () => {
  it("checkout sends 1 USDC on Helius devnet and returns the signature and time", async () => {
    const { checkout } = await routes();
    const res = await checkout(post("/api/demo/checkout"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.signature).toBe("string");
    expect(body.signature.length).toBeGreaterThan(80);
    expect(typeof body.ms).toBe("number");
    expect(Object.keys(body).sort()).toEqual(["ms", "signature"]);
    expect(mocks.createSolanaRpc).toHaveBeenCalledWith(
      "https://devnet.helius-rpc.com/?api-key=test-key",
    );
    // Create the shop's token account if needed, then the transfer.
    const ixs = lastInstructions();
    expect(ixs).toHaveLength(2);
    // TransferChecked (12), 1_000_000 base units, 6 decimals.
    const data = ixs[1].data!;
    expect(data[0]).toBe(12);
    expect(
      new DataView(data.buffer, data.byteOffset).getBigUint64(1, true),
    ).toBe(1_000_000n);
    expect(data[9]).toBe(6);
  });

  it("uses the public devnet RPC without a Helius key, and charges 0.001 USDC a call", async () => {
    vi.stubEnv("HELIUS_API_KEY", "");
    const { paywall } = await routes();
    const res = await paywall(post("/api/demo/paywall-call"));
    expect(res.status).toBe(200);
    expect(mocks.createSolanaRpc).toHaveBeenCalledWith(
      "https://api.devnet.solana.com",
    );
    const data = lastInstructions()[1].data!;
    expect(
      new DataView(data.buffer, data.byteOffset).getBigUint64(1, true),
    ).toBe(1_000n);
  });

  it("moves the payee's USDC back in the same transaction when the payer runs low", async () => {
    mocks.balances = new Map([
      ["payer", "500000"],
      ["payee", "9500000"],
    ]);
    const { checkout } = await routes();
    expect((await checkout(post("/api/demo/checkout"))).status).toBe(200);
    const ixs = lastInstructions();
    // Payee ATA, payer ATA, the transfer back, then the payment.
    expect(ixs).toHaveLength(4);
    const back = ixs[2].data!;
    expect(
      new DataView(back.buffer, back.byteOffset).getBigUint64(1, true),
    ).toBe(9_500_000n);
  });

  it("answers unfunded when the wallets don't hold enough USDC between them", async () => {
    mocks.balances = new Map([
      ["payer", "100"],
      ["payee", "100"],
    ]);
    const { checkout } = await routes();
    const res = await checkout(post("/api/demo/checkout"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unfunded" });
    expect(mocks.sent).toHaveLength(0);
  });

  it("answers unconfigured without the wallet keys, and never reads the RPC", async () => {
    vi.stubEnv("DEMO_PAYER_SECRET_KEY", "");
    const { checkout } = await routes();
    const res = await checkout(post("/api/demo/checkout"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unconfigured" });
    expect(mocks.createSolanaRpc).not.toHaveBeenCalled();
  });

  it("rate-limits each IP to a few checkouts a minute", async () => {
    const { checkout } = await routes();
    const req = () =>
      new Request("http://localhost/api/demo/checkout", {
        method: "POST",
        headers: { "x-forwarded-for": "192.0.2.1" },
      });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await checkout(req())).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
    expect(mocks.sent).toHaveLength(5);
  });

  it("refuses bots, and fails closed when BotId can't run", async () => {
    const { checkout } = await routes();
    for (const isBot of [true, "throw"] as const) {
      mocks.isBot = isBot;
      const res = await checkout(post("/api/demo/checkout"));
      expect(res.status).toBe(403);
    }
    expect(mocks.sent).toHaveLength(0);
  });

  it("never sends the RPC error text, which can carry the keyed URL", async () => {
    mocks.createSolanaRpc.mockImplementation(() => ({
      ...fakeRpc(),
      getLatestBlockhash: () => ({
        send: async () => {
          throw new Error(
            "fetch failed: https://devnet.helius-rpc.com/?api-key=test-key",
          );
        },
      }),
    }));
    const { checkout } = await routes();
    const res = await checkout(post("/api/demo/checkout"));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("test-key");
  });
});
