/**
 * The visuals the Nous review backend (server/templates.ts) attaches without
 * a model call, as the docs agent's GenerativeUiTemplateService does: the
 * PR #1828 samples in ./common-visual.ts, its debugging flow, and the
 * concept-only variant a "what is X" question gets (the intro and the
 * model, no steps or setup).
 */
import type {
  AskGenerativeUi,
  AskGenerativeUiComponent,
} from "../generative-ui/types";
import {
  accountInitializationGenerativeUiFixture,
  cpiFlowGenerativeUiFixture,
  pdaDerivationGenerativeUiFixture,
  rpcRequestLifecycleGenerativeUiFixture,
  tokenLifecycleGenerativeUiFixture,
  transactionSigningGenerativeUiFixture,
} from "./common-visual";

/** Cause and fix for a failed transaction (the agent's debuggingFlow). */
export const debuggingFlowGenerativeUiFixture = {
  version: "solana-docs-ui/v1",
  kind: "answer",
  components: [
    {
      type: "answer_intro",
      title: "Debugging a failed transaction",
      body: "Find the instruction that failed in the transaction logs, read the program's error, fix the cause, then send the transaction again.",
    },
    {
      type: "concept_model",
      title: "Cause and fix",
      nodes: [
        {
          id: "transaction",
          archetype: "transaction",
          label: "Transaction",
          fields: [{ label: "status", value: "failed" }],
        },
        {
          id: "program",
          archetype: "program",
          label: "Program",
          fields: [{ label: "logs", value: "error source" }],
        },
      ],
      relationships: [
        { from: "transaction", to: "program", kind: "invokes" },
        { from: "program", to: "transaction", kind: "reads" },
      ],
    },
    {
      type: "step_flow",
      title: "Cause and fix",
      steps: [
        {
          title: "Trace the failure",
          body: "Use the transaction logs to find the instruction and program that failed.",
          result: "The transaction points to the program's error.",
          effects: [
            {
              action: "connect",
              node_id: "transaction",
              to_node_id: "program",
              kind: "invokes",
            },
            {
              action: "update",
              node_id: "transaction",
              field: "status",
              value: "failed at instruction",
            },
          ],
        },
        {
          title: "Read the program logs",
          body: "Check the program logs for the missing account or the check that failed.",
          result: "The program logs show the likely cause.",
          effects: [
            {
              action: "update",
              node_id: "program",
              field: "logs",
              value: "inspected",
            },
          ],
        },
        {
          title: "Fix and retry",
          body: "Update the client or the program, then send the transaction again.",
          result: "The transaction is ready to retry.",
          effects: [
            {
              action: "update",
              node_id: "transaction",
              field: "status",
              value: "ready to retry",
            },
          ],
        },
      ],
    },
  ],
} satisfies AskGenerativeUi;

export type TemplateVisualName =
  | "tokenLifecycle"
  | "pdaDerivation"
  | "cpiFlow"
  | "transactionSigning"
  | "rpcRequestLifecycle"
  | "accountInitialization"
  | "debuggingFlow";

const VISUALS: Record<TemplateVisualName, AskGenerativeUi> = {
  tokenLifecycle: tokenLifecycleGenerativeUiFixture,
  pdaDerivation: pdaDerivationGenerativeUiFixture,
  cpiFlow: cpiFlowGenerativeUiFixture,
  transactionSigning: transactionSigningGenerativeUiFixture,
  rpcRequestLifecycle: rpcRequestLifecycleGenerativeUiFixture,
  accountInitialization: accountInitializationGenerativeUiFixture,
  debuggingFlow: debuggingFlowGenerativeUiFixture,
};

/** The intro a concept-only visual opens with: what it is, not how to build it. */
const CONCEPT_INTROS: Partial<
  Record<TemplateVisualName, { title: string; body: string }>
> = {
  tokenLifecycle: {
    title: "Tokens",
    body: "A token is a mint account that defines it, plus token accounts that hold each owner's balance of that mint.",
  },
  pdaDerivation: {
    title: "Program derived addresses",
    body: "A PDA is an account address derived from seeds and a program ID. It has no private key, so only that program can sign for it.",
  },
  cpiFlow: {
    title: "Cross-program invocations",
    body: "A CPI lets one program call an instruction on another program while the same transaction runs.",
  },
  transactionSigning: {
    title: "Transactions",
    body: "A transaction is valid once its required signers sign it with a recent blockhash. An RPC node then sends it to the validators.",
  },
  rpcRequestLifecycle: {
    title: "RPC requests",
    body: "A client asks an RPC node to read cluster state or to submit a signed transaction.",
  },
  accountInitialization: {
    title: "Accounts",
    body: "An account is ready to use once it holds enough lamports for rent, is owned by a program, and holds that program's data.",
  },
};

/**
 * A template visual. `conceptOnly` keeps the intro (rewritten to describe
 * the concept) and the model, and drops the steps and setup callouts; the
 * debugging flow has no concept-only form.
 */
export function templateVisual(
  name: TemplateVisualName,
  conceptOnly = false,
): AskGenerativeUi {
  const visual = VISUALS[name];
  const intro = CONCEPT_INTROS[name];
  if (!conceptOnly || !intro) return visual;
  const components: AskGenerativeUiComponent[] = visual.components.flatMap(
    (component) =>
      component.type === "step_flow" || component.type === "callout"
        ? []
        : component.type === "answer_intro"
          ? [{ type: "answer_intro", ...intro }]
          : [component],
  );
  return { ...visual, components };
}
