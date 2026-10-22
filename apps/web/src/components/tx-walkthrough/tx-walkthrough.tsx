/**
 * "See a transaction in action": one real SettleDvp transaction, stepped
 * through on a sequence diagram (Your app, Wallet, Network, the program,
 * Token Program, Accounts) with the code and data for each step.
 *
 * Server component: reads the recorded fixture at build time, derives what
 * each step shows (model.ts), and highlights the excerpts with the docs'
 * Shiki themes, so the client bundle gets only the finished view.
 *
 * Registered in the docs MDX components (components/docs/docs-components)
 * and mounted on How Solana works (apps/docs/developers/docs/core/index.mdx)
 * around the static transaction-flow diagram, which it draws live. Children
 * (that static diagram, for Mintlify and the Markdown twin) are not
 * rendered here.
 */
import { highlight } from "fumadocs-core/highlight";
import fixture from "../../../../../packages/docs-examples/paths/defi/settle-trade/settle-walkthrough.json";
import { EXCERPTS } from "./excerpts";
import {
  buildModel,
  DVP_PROGRAM,
  trimmedResponse,
  type RecordedFixture,
} from "./model";
import { TxWalkthroughClient } from "./tx-walkthrough.client";
import "./tx-walkthrough.css";

const THEMES = { light: "github-light", dark: "github-dark-dimmed" } as const;

/**
 * The recorded run is on a local Surfpool, so its signature is not on any
 * public cluster. The Explorer link goes to the DvP program on devnet, which
 * is real; swap in a devnet transaction URL once one is recorded there.
 */
export const EXPLORER_URL = `https://explorer.solana.com/address/${DVP_PROGRAM}?cluster=devnet`;
export const RPC_REFERENCE_HREF = "/developers/docs/rpc/http/gettransaction";

export async function TxWalkthrough(_props: { children?: unknown }) {
  const recorded = fixture as unknown as RecordedFixture;
  const model = buildModel(recorded);
  const code = Object.fromEntries(
    await Promise.all(
      Object.values(EXCERPTS).map(
        async (e) =>
          [
            e.id,
            await highlight(e.code, {
              lang: e.lang,
              themes: THEMES,
              defaultColor: false,
            }),
          ] as const,
      ),
    ),
  );
  const response = await highlight(
    JSON.stringify(trimmedResponse(recorded, model), null, 2),
    { lang: "json", themes: THEMES, defaultColor: false },
  );
  return (
    <TxWalkthroughClient
      model={model}
      code={code}
      response={response}
      explorerUrl={EXPLORER_URL}
      rpcReferenceHref={RPC_REFERENCE_HREF}
    />
  );
}
