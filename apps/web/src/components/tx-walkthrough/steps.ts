/**
 * The lanes of the sequence diagram and the seven steps of the walkthrough.
 * Copy follows the docs house style: plain words, "onchain", Oxford comma.
 * Text in `backticks` renders as inline code. Numbers that come from the
 * recorded run are filled in by the panel, not written here.
 */

export type LaneId =
  | "app"
  | "wallet"
  | "network"
  | "program"
  | "token"
  | "accounts";

export interface Lane {
  id: LaneId;
  name: string;
  /** Two short lines under the name, as in the static diagram. */
  note: [string, string];
  /** Code you write: the two highlighted lanes. */
  yours?: boolean;
}

/** Same lanes, names, and notes as diagrams/transaction-flow*.svg. */
export const LANES: Lane[] = [
  {
    id: "app",
    name: "Your app",
    note: ["Your code,", "offchain"],
    yours: true,
  },
  { id: "wallet", name: "Wallet", note: ["Signs and", "pays fees"] },
  { id: "network", name: "Network", note: ["Validators", "verify and run"] },
  {
    id: "program",
    name: "Your program",
    note: ["Your code,", "onchain"],
    yours: true,
  },
  { id: "token", name: "Token Program", note: ["An existing", "program"] },
  { id: "accounts", name: "Accounts", note: ["Onchain", "state"] },
];

export const LANE_NAME = Object.fromEntries(
  LANES.map((l) => [l.id, l.name]),
) as Record<LaneId, string>;

export type StepId =
  | "build"
  | "sign"
  | "send"
  | "fee"
  | "run"
  | "cpi"
  | "result";

/**
 * One arrow of diagrams/transaction-flow.svg, at the same y, tagged with the
 * step that lights it up. Rows with from === to are work inside one lane.
 */
export interface Row {
  step: StepId;
  y: number;
  from: LaneId;
  to: LaneId;
  /** One or two lines; a second line sits under the first. */
  label: string[];
  /** A reply, drawn dashed. */
  dashed?: boolean;
  /** Grey note beside the arrow (the fee row). */
  note?: string;
}

export const ROWS: Row[] = [
  {
    step: "build",
    y: 124,
    from: "app",
    to: "app",
    label: ["build transaction", "instructions, recent blockhash"],
  },
  { step: "sign", y: 196, from: "app", to: "wallet", label: ["ask to sign"] },
  {
    step: "sign",
    y: 232,
    from: "wallet",
    to: "app",
    label: ["signature"],
    dashed: true,
  },
  {
    step: "send",
    y: 268,
    from: "app",
    to: "network",
    label: ["send transaction through RPC"],
  },
  {
    step: "fee",
    y: 288,
    from: "network",
    to: "network",
    label: ["verify signatures"],
  },
  {
    step: "fee",
    y: 340,
    from: "network",
    to: "wallet",
    label: ["charge fee"],
    note: "Charged even if the transaction fails",
  },
  {
    step: "run",
    y: 416,
    from: "network",
    to: "program",
    label: ["run instruction"],
  },
  {
    step: "run",
    y: 436,
    from: "program",
    to: "program",
    label: ["derive PDA"],
  },
  {
    step: "run",
    y: 488,
    from: "program",
    to: "accounts",
    label: ["read state"],
  },
  {
    step: "cpi",
    y: 542,
    from: "program",
    to: "token",
    label: ["transfer (CPI)", "PDA signs"],
  },
  {
    step: "cpi",
    y: 578,
    from: "token",
    to: "accounts",
    label: ["write balances"],
  },
  {
    step: "cpi",
    y: 614,
    from: "token",
    to: "program",
    label: ["OK"],
    dashed: true,
  },
  {
    step: "cpi",
    y: 650,
    from: "program",
    to: "accounts",
    label: ["write state"],
  },
  {
    step: "cpi",
    y: 686,
    from: "program",
    to: "network",
    label: ["OK"],
    dashed: true,
  },
  {
    step: "result",
    y: 742,
    from: "network",
    to: "app",
    label: ["confirmation (signature status)"],
    dashed: true,
  },
];

export interface Step {
  id: StepId;
  title: string;
  /** The lanes this step happens in, for the badge. */
  lanes: LaneId[];
  body: string[];
  /** Excerpt ids (excerpts.ts), shown in order. */
  excerpts: string[];
  /** Inside the atomic box: the program's instruction (steps 5 and 6). */
  atomic?: boolean;
}

export const STEPS: Step[] = [
  {
    id: "build",
    title: "Your app builds the transaction",
    lanes: ["app"],
    body: [
      "A buyer and a seller agreed a trade: {cash} USDC for {asset} fund shares. Each has already moved its side into an escrow account that the DvP program controls. Now the settlement agent's app asks the program to settle.",
      "The generated client turns the call into an instruction: the program's address, every account the program will read or write, and a few bytes of data. `send()` puts it in a transaction message after four `createAccounts` instructions that make sure each receiving token account exists. The message names the fee payer, lists every account once with what it may do (sign, be written to), and carries a recent blockhash, so the transaction expires if it isn't processed soon.",
    ],
    excerpts: ["build", "message"],
  },
  {
    id: "sign",
    title: "The wallet signs",
    lanes: ["app", "wallet"],
    body: [
      "Only the fee payer signs this transaction: the settlement agent. Its private key signs the message bytes, and the first signature becomes the transaction's ID.",
      "The buyer and the seller don't sign here. They agreed to the terms when the trade was created and funded, and the program enforces those terms.",
    ],
    excerpts: ["sign"],
  },
  {
    id: "send",
    title: "Sent to the network",
    lanes: ["app", "network"],
    body: [
      "The app sends the signed transaction to an RPC node, which forwards it to the validators scheduled to produce the next blocks.",
    ],
    excerpts: ["send"],
  },
  {
    id: "fee",
    title: "The network checks it and charges the fee",
    lanes: ["network", "wallet"],
    body: [
      "A validator checks the signature, that the blockhash is recent, and that the fee payer can pay, then charges the fee to the fee payer.",
      "The fee is charged even if the transaction fails: the validator did the work of processing it.",
    ],
    excerpts: [],
  },
  {
    id: "run",
    title: "Your program runs",
    lanes: ["network", "program", "accounts"],
    body: [
      "The validator loads the DvP program and only the accounts the transaction listed. The program reads the trade record and checks it: the signer is the trade's settlement agent, the trade hasn't expired, and each escrow holds at least its agreed amount. If a check fails, the program returns an error, such as `LegNotFunded`, and nothing changes.",
      "The escrows belong to the trade record, a program-derived address (PDA) with no private key. To sign for them, the program derives the record's address again from its seeds.",
    ],
    excerpts: ["checks", "seeds"],
    atomic: true,
  },
  {
    id: "cpi",
    title: "CPI to the Token Program",
    lanes: ["program", "token", "accounts"],
    body: [
      "The DvP program can't change token balances itself: the Token Program owns every token account. So it makes a cross-program invocation (CPI). It calls `TransferChecked` to move {cash} USDC from the USDC escrow to the seller, and signs as the trade record with the seeds from the last step.",
      "The Token Program checks that signature, moves the tokens, and writes the new balances. The {asset} fund shares goes to the buyer the same way, through Token-2022. Then the program closes both escrows and the trade record, and returns OK.",
    ],
    excerpts: ["cpi", "invoke"],
    atomic: true,
  },
  {
    id: "result",
    title: "Your app gets the result",
    lanes: ["network", "app"],
    body: [
      "Every check passed, so every change is kept. The app already has the signature, so it waits for the network to confirm it. Then `getTransaction` returns the result: status, fee, logs, and token balances before and after.",
    ],
    excerpts: ["result"],
  },
];

export const ATOMIC_NOTE =
  "Steps 5 and 6 are all or nothing. If anything in the transaction fails, every change is rolled back, and only the fee from step 4 is kept.";

export const PROGRAM_NOTE =
  "Here, your program is the DvP program from solana-foundation/dvp.";
