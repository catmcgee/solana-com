import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/devnet-airdrop/route";

const mocks = vi.hoisted(() => ({
  createSolanaRpc: vi.fn(),
  requestAirdrop: vi.fn(),
  getSignatureStatuses: vi.fn(),
}));
vi.mock("@solana/kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@solana/kit")>()),
  createSolanaRpc: mocks.createSolanaRpc,
}));

const SIGNATURE = "5".repeat(88);
const FAKE_KEY = "test-key";

function request(body: string, contentType: string, ip: string) {
  return new Request("http://localhost/api/devnet-airdrop", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body,
  });
}
const jsonRequest = (address: unknown, ip = "1.1.1.1") =>
  request(JSON.stringify({ address }), "application/json", ip);

beforeEach(() => {
  vi.stubEnv("HELIUS_API_KEY", FAKE_KEY);
  mocks.createSolanaRpc.mockReturnValue({
    requestAirdrop: mocks.requestAirdrop,
    getSignatureStatuses: mocks.getSignatureStatuses,
  });
  mocks.requestAirdrop.mockReturnValue({
    send: () => Promise.resolve(SIGNATURE),
  });
  mocks.getSignatureStatuses.mockReturnValue({
    send: () =>
      Promise.resolve({
        value: [{ confirmationStatus: "confirmed", err: null }],
      }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("devnet airdrop route", () => {
  it("airdrops 1 SOL through Helius devnet and returns the signature", async () => {
    const address = "So11111111111111111111111111111111111111112";
    const response = await POST(jsonRequest(address, "10.0.0.1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signature: SIGNATURE });
    expect(mocks.createSolanaRpc).toHaveBeenCalledWith(
      `https://devnet.helius-rpc.com/?api-key=${FAKE_KEY}`,
    );
    expect(mocks.requestAirdrop).toHaveBeenCalledWith(address, 1_000_000_000n);
  });

  it("accepts a form body, as curl -d sends", async () => {
    const response = await POST(
      request(
        "address=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "application/x-www-form-urlencoded",
        "10.0.0.2",
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      `${JSON.stringify({ signature: SIGNATURE })}\n`,
    );
  });

  it("rejects missing and invalid addresses", async () => {
    for (const address of [undefined, "", "not-an-address", 42]) {
      const response = await POST(jsonRequest(address, "10.0.0.3"));
      expect(response.status).toBe(400);
    }
    expect(
      (await POST(request("{", "application/json", "10.0.0.3"))).status,
    ).toBe(400);
    expect(mocks.requestAirdrop).not.toHaveBeenCalled();
  });

  it("allows one airdrop per address a day", async () => {
    const address = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    expect((await POST(jsonRequest(address, "10.0.0.4"))).status).toBe(200);
    const again = await POST(jsonRequest(address, "10.0.0.5"));
    expect(again.status).toBe(429);
    expect((await again.json()).error).toContain("faucet.solana.com");
    expect(mocks.requestAirdrop).toHaveBeenCalledTimes(1);
  });

  it("allows a few airdrops per IP an hour", async () => {
    const addresses = [
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "ComputeBudget111111111111111111111111111111",
      "Stake11111111111111111111111111111111111111",
      "Vote111111111111111111111111111111111111111",
    ];
    const statuses = [];
    for (const address of addresses) {
      statuses.push((await POST(jsonRequest(address, "10.0.0.6"))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(mocks.requestAirdrop).toHaveBeenCalledTimes(3);
  });

  it("is off (503, pointing to faucet.solana.com) without a key", async () => {
    vi.stubEnv("HELIUS_API_KEY", "");
    const response = await POST(
      jsonRequest("11111111111111111111111111111111"),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain(
      "https://faucet.solana.com",
    );
    expect(mocks.createSolanaRpc).not.toHaveBeenCalled();
  });

  it("is off in production, where the preview key is not set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("HELIUS_API_KEY", undefined);
    const response = await POST(
      jsonRequest("11111111111111111111111111111111"),
    );
    expect(response.status).toBe(503);
    expect(mocks.createSolanaRpc).not.toHaveBeenCalled();
  });

  it("returns a generic error when Helius fails, never the upstream message", async () => {
    mocks.requestAirdrop.mockReturnValue({
      send: () =>
        Promise.reject(
          new Error(
            `HTTP 429 https://devnet.helius-rpc.com/?api-key=${FAKE_KEY}`,
          ),
        ),
    });
    const response = await POST(
      jsonRequest("SysvarRent111111111111111111111111111111111", "10.0.0.7"),
    );
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(text).toContain("faucet.solana.com");
  });
});
