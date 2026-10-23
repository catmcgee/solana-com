import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createKeyPairSignerFromBytes,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getU64Decoder,
} from "@solana/kit";
import { POST } from "@/app/api/devnet-airdrop/route";

const mocks = vi.hoisted(() => ({
  createSolanaRpc: vi.fn(),
  balances: new Map<string, bigint>(),
  history: new Set<string>(),
  sent: [] as string[],
  sendError: undefined as Error | undefined,
}));
vi.mock("@solana/kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@solana/kit")>()),
  createSolanaRpc: mocks.createSolanaRpc,
}));

const FAKE_HELIUS_KEY = "test-helius-key";
const FAUCET_SOL = 1_000_000_000n;

/** A throwaway keypair in solana-keygen's JSON format (test only). */
function keypairJson(): string {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const priv = privateKey
    .export({ format: "der", type: "pkcs8" })
    .subarray(-32);
  return JSON.stringify([...priv, ...pub]);
}

let faucetSecret = "";
let faucetAddress = "";

function fakeRpc() {
  return {
    getBalance: (address: string) => ({
      send: async () => ({ value: mocks.balances.get(address) ?? 0n }),
    }),
    getSignaturesForAddress: (address: string) => ({
      send: async () =>
        mocks.history.has(address) ? [{ signature: "1".repeat(88) }] : [],
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
        if (mocks.sendError) throw mocks.sendError;
        mocks.sent.push(wire);
        return "sig";
      },
    }),
    getSignatureStatuses: () => ({
      send: async () => ({
        value: [{ confirmationStatus: "confirmed", err: null }],
      }),
    }),
  };
}

/** The last transaction the route sent: its accounts and lamports moved. */
function lastTransfer() {
  const tx = getTransactionDecoder().decode(
    getBase64Encoder().encode(mocks.sent.at(-1)!),
  );
  const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (msg.version === 1) throw new Error("unexpected v1 message");
  const [ix] = msg.instructions;
  const accounts = ix!.accountIndices!.map((i) => msg.staticAccounts[i]);
  // System Program Transfer: u32 instruction index 2, then u64 lamports.
  const amount = getU64Decoder().decode(ix!.data!.subarray(4));
  return { feePayer: msg.staticAccounts[0], accounts, amount };
}

function request(body: string, contentType: string, ip: string) {
  return new Request("http://localhost/api/devnet-airdrop", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body,
  });
}
let ip = 0;
const jsonRequest = (address: unknown, from = `10.0.0.${++ip}`) =>
  request(JSON.stringify({ address }), "application/json", from);

beforeEach(async () => {
  faucetSecret = keypairJson();
  faucetAddress = (
    await createKeyPairSignerFromBytes(
      Uint8Array.from(JSON.parse(faucetSecret) as number[]),
    )
  ).address;
  vi.stubEnv("DEVNET_FAUCET_SECRET_KEY", faucetSecret);
  vi.stubEnv("HELIUS_API_KEY", FAKE_HELIUS_KEY);
  mocks.balances = new Map([[faucetAddress, FAUCET_SOL]]);
  mocks.history = new Set([faucetAddress]);
  mocks.sent = [];
  mocks.sendError = undefined;
  mocks.createSolanaRpc.mockImplementation(fakeRpc);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("devnet airdrop route", () => {
  it("sends 0.02 SOL from the faucet wallet to a new wallet over Helius devnet", async () => {
    const address = "So11111111111111111111111111111111111111112";
    const response = await POST(jsonRequest(address));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signature: expect.stringMatching(/^\w{87,88}$/),
    });
    expect(mocks.createSolanaRpc).toHaveBeenCalledWith(
      `https://devnet.helius-rpc.com/?api-key=${FAKE_HELIUS_KEY}`,
    );
    const transfer = lastTransfer();
    expect(transfer.feePayer).toBe(faucetAddress);
    expect(transfer.accounts).toEqual([faucetAddress, address]);
    expect(transfer.amount).toBe(20_000_000n);
  });

  it("uses public devnet without a Helius key", async () => {
    vi.stubEnv("HELIUS_API_KEY", "");
    const response = await POST(
      jsonRequest("Config1111111111111111111111111111111111111"),
    );
    expect(response.status).toBe(200);
    expect(mocks.createSolanaRpc).toHaveBeenCalledWith(
      "https://api.devnet.solana.com",
    );
  });

  it("accepts a form body, as curl -d sends", async () => {
    const response = await POST(
      request(
        "address=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "application/x-www-form-urlencoded",
        "10.1.0.1",
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/^\{"signature":"\w+"\}\n$/);
  });

  it("rejects missing and invalid addresses", async () => {
    for (const address of [undefined, "", "not-an-address", 42]) {
      const response = await POST(jsonRequest(address, "10.1.0.2"));
      expect(response.status).toBe(400);
    }
    expect(
      (await POST(request("{", "application/json", "10.1.0.2"))).status,
    ).toBe(400);
    expect(mocks.sent).toHaveLength(0);
  });

  it("refuses a wallet that has transaction history (409)", async () => {
    const address = "Stake11111111111111111111111111111111111111";
    mocks.history.add(address);
    const response = await POST(jsonRequest(address));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This wallet already has devnet SOL or history. Get more at https://faucet.solana.com.",
    );
    expect(mocks.sent).toHaveLength(0);
  });

  it("refuses a wallet that already holds SOL (409)", async () => {
    const address = "Vote111111111111111111111111111111111111111";
    mocks.balances.set(address, 1n);
    const response = await POST(jsonRequest(address));
    expect(response.status).toBe(409);
    expect(mocks.sent).toHaveLength(0);
  });

  it("funds each wallet once: after the transfer it has history", async () => {
    const address = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    expect((await POST(jsonRequest(address))).status).toBe(200);
    // What devnet now shows for it.
    mocks.balances.set(address, 20_000_000n);
    mocks.history.add(address);
    const again = await POST(jsonRequest(address));
    expect([409, 429]).toContain(again.status);
    expect(mocks.sent).toHaveLength(1);
  });

  it("allows a few requests per IP an hour", async () => {
    const addresses = [
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "ComputeBudget111111111111111111111111111111",
      "AddressLookupTab1e1111111111111111111111111",
      "BPFLoaderUpgradeab1e11111111111111111111111",
    ];
    const statuses = [];
    for (const address of addresses) {
      statuses.push((await POST(jsonRequest(address, "10.1.0.3"))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(mocks.sent).toHaveLength(3);
  });

  it("answers 503, pointing to faucet.solana.com, when the faucet wallet is out of SOL", async () => {
    mocks.balances.set(faucetAddress, 20_500_000n);
    const response = await POST(
      jsonRequest("SysvarC1ock11111111111111111111111111111111"),
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("https://faucet.solana.com");
    expect(text).not.toContain(faucetAddress);
    expect(mocks.sent).toHaveLength(0);
  });

  it("is off (503, pointing to faucet.solana.com) without a faucet key", async () => {
    vi.stubEnv("DEVNET_FAUCET_SECRET_KEY", "");
    const response = await POST(
      jsonRequest("11111111111111111111111111111111"),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain(
      "https://faucet.solana.com",
    );
    expect(mocks.createSolanaRpc).not.toHaveBeenCalled();
  });

  it("is off in production, where the preview faucet key is not set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEVNET_FAUCET_SECRET_KEY", undefined);
    const response = await POST(
      jsonRequest("11111111111111111111111111111111"),
    );
    expect(response.status).toBe(503);
    expect(mocks.createSolanaRpc).not.toHaveBeenCalled();
  });

  it("is off, without details, when the faucet key is malformed", async () => {
    vi.stubEnv("DEVNET_FAUCET_SECRET_KEY", "[1,2,3]");
    const response = await POST(
      jsonRequest("SysvarRecentB1ockHashes11111111111111111111"),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("1,2,3");
    expect(mocks.createSolanaRpc).not.toHaveBeenCalled();
  });

  it("returns a generic error when sending fails, never a secret or the upstream message", async () => {
    mocks.sendError = new Error(
      `HTTP 429 https://devnet.helius-rpc.com/?api-key=${FAKE_HELIUS_KEY} ${faucetSecret}`,
    );
    const response = await POST(
      jsonRequest("SysvarRent111111111111111111111111111111111"),
    );
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(FAKE_HELIUS_KEY);
    expect(text).not.toContain(faucetSecret);
    expect(text).not.toContain("HTTP 429");
    expect(text).toContain("faucet.solana.com");
  });
});
