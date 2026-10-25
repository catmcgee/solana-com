import "server-only";

import {
  templateVisual,
  type TemplateVisualName,
} from "../fixtures/template-visuals";
import type { AskGenerativeUi } from "../generative-ui/types";
import { wantsVisual, type VisualIntent } from "./intent";
import type { Workflow } from "./pins";

/**
 * Visuals without a model call: the docs agent's
 * GenerativeUiTemplateService needle lists, on the question (lowercased),
 * mapped to our fixtures. Debugging questions get the cause-and-fix flow; a
 * conceptual question gets the concept-only variant. The agent also matches
 * its answer plan, which names the workflow route; here the route stands
 * in for it, then the titles of the canonical pages read for the question
 * (an RPC method's page). "pda" and "cpi" match whole words ("update" is
 * not a PDA).
 */
const NEEDLES: Array<[TemplateVisualName, Array<string | RegExp>]> = [
  [
    "tokenLifecycle",
    [
      "spl-token",
      "create token",
      "create a token",
      "token mint",
      "mint account",
      "token account",
      "associated token",
    ],
  ],
  ["pdaDerivation", ["program derived address", "derive pda", /\bpdas?\b/]],
  [
    "cpiFlow",
    [
      "cross program invocation",
      /\bcpis?\b/,
      "invoke another program",
      // Ours: the empty state's plain-words question.
      "call another program",
      /\b(?:one|a) program calls? another\b/,
    ],
  ],
  [
    "transactionSigning",
    [
      "transaction signing",
      "sign transaction",
      "sign and send",
      "send a transaction",
      "signed transaction",
      "signature",
      "blockhash",
    ],
  ],
  [
    "rpcRequestLifecycle",
    [
      "rpc request",
      "rpc node",
      "getaccount",
      "get balance",
      "get latest blockhash",
      "fetch account",
      "send transaction",
    ],
  ],
  [
    "accountInitialization",
    [
      "initialize account",
      "account initialization",
      "create account",
      "rent exempt",
      "rent-exempt",
      "allocate space",
    ],
  ],
];

/**
 * Token Extensions questions: the token template draws the classic
 * `spl-token create-token`, which the answer (Token-2022) contradicts.
 */
const TOKEN_EXTENSIONS = /\btoken[- ]?2022\b|\btoken extensions?\b/i;

/** How many of the canonical pages lend their titles. */
const TITLE_PAGES = 2;

export type TemplateMatch = { name: TemplateVisualName; ui: AskGenerativeUi };

function needleMatch(text: string): TemplateVisualName | undefined {
  return NEEDLES.find(([, needles]) =>
    needles.some((needle) =>
      typeof needle === "string" ? text.includes(needle) : needle.test(text),
    ),
  )?.[0];
}

export function templateFor(
  question: string,
  intent: VisualIntent,
  workflow: Workflow | null = null,
  /** Titles of the canonical pages read for the question, best first. */
  titles: string[] = [],
): TemplateMatch | null {
  if (!wantsVisual(intent)) return null;
  if (intent === "debugging") {
    return { name: "debuggingFlow", ui: templateVisual("debuggingFlow") };
  }
  if (TOKEN_EXTENSIONS.test(question)) return null;
  // Titles are hyphenated ("Cross-program invocation"); needles are not.
  const name =
    needleMatch(question.toLowerCase()) ??
    workflow?.visual ??
    needleMatch(
      titles.slice(0, TITLE_PAGES).join("\n").toLowerCase().replace(/-/g, " "),
    );
  return name
    ? { name, ui: templateVisual(name, intent === "conceptual") }
    : null;
}
