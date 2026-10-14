import { generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fundSol, setTokenBalance } from "../../../test/fixtures/fund";
import { fetchTx, runExample } from "../../../test/record";
import { NETWORK } from "./x402";
import {
  demoOverCap,
  demoPaid,
  demoReplay,
  demoUnpaid,
  startServer,
} from "./demo";

const out = (name: string) => new URL(`./${name}.output.txt`, import.meta.url);
const PRICE = 10_000n; // 0.01 USDC

describe("paths/payments/paywall-api (x402-style)", () => {
  let buyer: KeyPairSigner;
  let seller: KeyPairSigner;
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    buyer = await generateKeyPairSigner();
    seller = await generateKeyPairSigner();
    await fundSol(buyer.address);
    await setTokenBalance(buyer.address, 1_000_000n); // 1 USDC
    await setTokenBalance(seller.address, 0n);
    server = await startServer(seller.address, PRICE);
  });
  afterAll(() => server?.close());

  it("server: an unpaid request gets 402 with the price", async () => {
    const r = await runExample(() => demoUnpaid(server.url), {
      output: out("server"),
      signatures: "none",
    });
    expect(r.value).toBe(402);
  });

  it("server: malformed X-PAYMENT headers get 402 and the server stays up", async () => {
    const enc = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64");
    const exact = { x402Version: 1, scheme: "exact", network: NETWORK };
    const cases: string[] = [
      "!!!not base64 json!!!",
      enc(null),
      enc({ ...exact }),
      enc({ ...exact, payload: {} }),
      enc({ ...exact, payload: { transaction: 42 } }),
      enc({ ...exact, payload: { transaction: "AAAA" } }),
      enc({
        ...exact,
        payload: { transaction: Buffer.alloc(300, 7).toString("base64") },
      }),
      enc({ ...exact, scheme: "upto", payload: { transaction: "AAAA" } }),
    ];
    for (const header of cases) {
      const res = await fetch(server.url, { headers: { "X-PAYMENT": header } });
      expect(res.status, header).toBe(402);
      const body = (await res.json()) as { error: string; accepts: unknown[] };
      expect(body.accepts).toHaveLength(1);
      expect(body.error).toMatch(/malformed|unsupported/);
    }
    // Still serving.
    expect((await fetch(server.url)).status).toBe(402);
  });

  it("client: pays with a signed USDC transfer and retries; replay and over-cap are refused", async () => {
    const realFetch = globalThis.fetch;
    const headers: string[] = [];
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) => {
        const h = new Headers(init?.headers).get("x-payment");
        if (h) headers.push(h);
        return realFetch(input, init);
      });
    try {
      const r = await runExample(
        async () => {
          const paid = await demoPaid(server.url, buyer, 50_000n);
          const replay = await demoReplay(server.url, headers[0]!);
          const refused = await demoOverCap(server.url, buyer, 5_000n);
          return { paid, replay, refused };
        },
        { output: out("client") },
      );
      expect(r.value.paid.status).toBe(200);
      expect(r.value.replay).toBe(402);
      expect(r.value.refused).toBe(true);
      // The paid call and its replay; the over-cap client never signed anything.
      expect(headers).toHaveLength(2);
      expect(headers[1]).toBe(headers[0]);
      const tx = await fetchTx(r.value.paid.signature);
      expect(tx.meta?.err).toBeNull();
      expect(tx.meta!.fee).toBeGreaterThan(0n);
      const credited = tx.meta!.postTokenBalances!.find(
        (b) => b.owner === seller.address,
      );
      expect(credited?.uiTokenAmount.amount).toBe(PRICE.toString());
    } finally {
      spy.mockRestore();
    }
  });
});
