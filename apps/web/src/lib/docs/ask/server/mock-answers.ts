import "server-only";

import {
  accountInitializationGenerativeUiFixture,
  cpiFlowGenerativeUiFixture,
  pdaDerivationGenerativeUiFixture,
  rpcRequestLifecycleGenerativeUiFixture,
  tokenLifecycleGenerativeUiFixture,
  transactionSigningGenerativeUiFixture,
} from "../fixtures/common-visual";
import type { AskGenerativeUi } from "../generative-ui/types";
import { CONCEPTUAL_CODE_PROMPT } from "./followups";

/**
 * Canned answers for the review mock (./mock-agent.ts), written in the
 * agent's format (`### Summary response`, then `### Indepth response`) and
 * checked against the docs they link to. Routing is by keyword, like a
 * very small agent: a fenced code block → explain the code; a page → the
 * page's own summary and sections; a topic → that topic's answer and
 * visual; anything else → the closest docs pages. Follow-up turns get a
 * short answer about the conversation's topic.
 */

export type MockTopicId =
  | "createToken"
  | "fees"
  | "pda"
  | "cpi"
  | "token"
  | "transaction"
  | "rpc"
  | "account";

type CodeSample = { label: string; language: string; code: string };

type MockTopic = {
  id: MockTopicId;
  /** For follow-ups: "Building on the {label} answer". */
  label: string;
  match: RegExp;
  answer: string;
  visual: AskGenerativeUi | null;
  /** Code for "Show me the code" follow-ups, first is the default. */
  code: CodeSample[];
  /** Short follow-up answer: the usual next step, with a docs link. */
  next: string;
  searchQueries: string[];
  /** Cited first when the search index has them. */
  preferredUrls: string[];
};

export type MockCitation = {
  title: string;
  url: string;
  breadcrumbs?: string[];
};

export type MockCodeFollowups = {
  prompt: string;
  buttons: Array<{
    type: "show_code";
    label: string;
    language: string;
    message: string;
  }>;
};

export type MockPlan = {
  /** Topic remembered for the conversation's follow-ups (null: none). */
  topic: MockTopicId | null;
  /** Answer text; may need the citations (general answers). */
  render: (citations: MockCitation[]) => string;
  visual: AskGenerativeUi | null;
  codeFollowups: MockCodeFollowups | null;
  searchQueries: string[];
  preferredUrls: string[];
};

export type MockPage = {
  title: string;
  path: string;
  description?: string;
  headings: string[];
  breadcrumbs?: string[];
};

/** The docs agent's question after a conceptual answer, with code buttons. */
const FOLLOWUP_PROMPT = CONCEPTUAL_CODE_PROMPT;

const fence = (language: string, code: string) =>
  `\`\`\`${language}\n${code.trim()}\n\`\`\``;

const PDA_TS = `
import { type Address, getProgramDerivedAddress } from "@solana/kit";

const programAddress = "11111111111111111111111111111111" as Address;
const [pda, bump] = await getProgramDerivedAddress({
  programAddress,
  seeds: ["vault"],
});

console.log(\`PDA: \${pda}, bump: \${bump}\`);`;

const PDA_RUST = `
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

let program_id = Pubkey::from_str("11111111111111111111111111111111")?;
let (pda, bump) = Pubkey::find_program_address(&[b"vault"], &program_id);

println!("PDA: {pda}, bump: {bump}");`;

const CPI_NATIVE = `
use solana_program::{program::invoke_signed, system_instruction};

// Move lamports out of a PDA vault the program owns the seeds for.
let transfer = system_instruction::transfer(vault.key, recipient.key, amount);
invoke_signed(
    &transfer,
    &[vault.clone(), recipient.clone(), system_program.clone()],
    &[&[b"vault", user.key.as_ref(), &[bump]]],
)?;`;

const CPI_ANCHOR = `
use anchor_lang::system_program::{transfer, Transfer};

let user_key = ctx.accounts.user.key();
let signer_seeds: &[&[&[u8]]] = &[&[b"vault", user_key.as_ref(), &[bump]]];
let cpi_context = CpiContext::new(
    ctx.accounts.system_program.to_account_info(),
    Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.recipient.to_account_info(),
    },
)
.with_signer(signer_seeds);
transfer(cpi_context, amount)?;`;

const MINT_TS = `
import { getMintToInstruction } from "@solana-program/token";

const mintTo = getMintToInstruction({
  mint: mintAddress,
  token: tokenAccountAddress,
  mintAuthority, // a TransactionSigner
  amount: 100_000_000n, // 100 tokens at 6 decimals
});`;

const MINT_RUST = `
use spl_token::instruction::mint_to;

let instruction = mint_to(
    &spl_token::id(),
    &mint,
    &token_account,
    &mint_authority.pubkey(),
    &[],
    100_000_000, // 100 tokens at 6 decimals
)?;`;

const TX_TS = `
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(payer, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  (m) => appendTransactionMessageInstruction(instruction, m),
);
const transaction = await signTransactionMessageWithSigners(message);`;

const TX_RUST = `
use solana_sdk::{signature::Signer, transaction::Transaction};

let blockhash = client.get_latest_blockhash()?;
let transaction = Transaction::new_signed_with_payer(
    &[instruction],
    Some(&payer.pubkey()),
    &[&payer],
    blockhash,
);
let signature = client.send_and_confirm_transaction(&transaction)?;`;

const ACCOUNT_TS = `
import { getCreateAccountInstruction } from "@solana-program/system";

const space = 165n;
const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
const createAccount = getCreateAccountInstruction({
  payer,
  newAccount, // a TransactionSigner for the new address
  lamports,
  space,
  programAddress: ownerProgram,
});`;

const ACCOUNT_RUST = `
use solana_sdk::{signature::Signer, system_instruction};

let space = 165;
let lamports = client.get_minimum_balance_for_rent_exemption(space)?;
let instruction = system_instruction::create_account(
    &payer.pubkey(),
    &new_account.pubkey(),
    lamports,
    space as u64,
    &owner_program_id,
);`;

const RPC_TS = `
import { address, createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const { value: lamports } = await rpc
  .getBalance(address("<ADDRESS>"))
  .send();`;

const FEES_TS = `
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";

const computeBudget = [
  getSetComputeUnitLimitInstruction({ units: 200_000 }),
  getSetComputeUnitPriceInstruction({ microLamports: 10_000n }),
];`;

const TOPICS: MockTopic[] = [
  {
    id: "createToken",
    label: "token creation",
    match:
      /\b(create|creating|make|launch|issue)\b[^.?!]*\btokens?\b|token[- ]?extensions?|token-?2022|spl-token/i,
    answer: `### Summary response
Create the mint with the \`spl-token\` CLI, create a token account for your wallet, then mint the starting supply into it. The classic Token Program covers most tokens; use Token Extensions (Token-2022) only when you need an extension such as on-chain metadata.

### Indepth response
**On devnet, from the CLI**

${fence(
  "bash",
  `
solana config set --url devnet
solana airdrop 2
spl-token create-token
spl-token create-account <MINT_ADDRESS>
spl-token mint <MINT_ADDRESS> 100`,
)}

What each step creates:

1. \`create-token\` creates the **mint account**. It stores decimals (9 by default), the supply and the mint authority, which is your wallet.
2. \`create-account\` creates your **associated token account**, the account that holds your balance of this mint.
3. \`mint\` adds 100 tokens to the supply and to your token account in one instruction.

To store a name, symbol and URI on the mint itself, create a Token-2022 mint with the metadata extension instead (\`spl-token create-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb --enable-metadata\`), then run \`spl-token initialize-metadata\`. [Quickstart: create a token with the CLI](/developers/docs/tokens/quickstart) walks through both.`,
    visual: tokenLifecycleGenerativeUiFixture,
    code: [],
    next: "To send some to another wallet, run `spl-token transfer <MINT_ADDRESS> 10 <RECIPIENT_WALLET_ADDRESS> --fund-recipient`, which also creates the recipient's token account (add `--allow-unfunded-recipient` when that wallet holds no SOL). [Quickstart: create a token with the CLI](/developers/docs/tokens/quickstart) covers the transfer.",
    searchQueries: ["create token", "token quickstart"],
    preferredUrls: [
      "/developers/docs/tokens/quickstart",
      "/developers/docs/tokens/basics/create-mint",
      "/developers/docs/tokens/basics/create-token-account",
      "/developers/docs/tokens/extensions/metadata",
    ],
  },
  {
    id: "fees",
    label: "fees",
    match:
      /\bfees?\b|priorit(y|ization)|compute unit price|lamports per signature/i,
    answer: `### Summary response
Every transaction pays a base fee of 5,000 lamports per signature. You can add an optional prioritization fee, priced per compute unit, to be scheduled sooner when blocks are busy. The fee payer is charged before the transaction runs, and the fee is kept even if it fails.

### Indepth response
| Part | How it's calculated | Where it goes |
| --- | --- | --- |
| Base fee | 5,000 lamports × signatures, including precompile signatures | 50% burned, 50% to the block's validator |
| Prioritization fee | compute unit price (micro-lamports) × compute unit limit ÷ 1,000,000, rounded up | 100% to the validator |

For one signature, a 200,000 CU limit and a price of 10,000 micro-lamports per CU:

- base fee: 5,000 lamports
- prioritization fee: 10,000 × 200,000 ÷ 1,000,000 = 2,000 lamports
- total: 7,000 lamports (0.000007 SOL)

The prioritization fee is charged on the **limit** you request, not on what the transaction uses, so set the limit just above what a simulation consumes. Set both with Compute Budget instructions at the start of the transaction:

${fence("ts", FEES_TS)}

To see what other transactions paid recently:

${fence(
  "bash",
  `
curl https://api.devnet.solana.com -s -X POST -H "Content-Type: application/json" -d '
  {"jsonrpc": "2.0", "id": 1, "method": "getRecentPrioritizationFees", "params": []}
'`,
)}

Creating accounts also needs a rent-exempt deposit. That isn't a fee: you get it back when the account is closed. See [Rent](/developers/docs/core/rent).`,
    visual: null,
    code: [{ label: "TypeScript", language: "typescript", code: FEES_TS }],
    next: "To pick a compute unit price, check `getRecentPrioritizationFees` for the accounts your transaction writes to, then set the limit just above what a simulation uses. [How to add priority fees](/developers/cookbook/transactions/add-priority-fees) has a complete example.",
    searchQueries: ["fees", "priority fees"],
    preferredUrls: [
      "/developers/docs/core/fees",
      "/developers/docs/core/fees/fee-structure",
      "/developers/cookbook/transactions/add-priority-fees",
    ],
  },
  {
    id: "pda",
    label: "PDA",
    match:
      /\bpdas?\b|program[- ]derived|\bderiv(e|ed|ation)\b|\bbump\b|\bseeds?\b/i,
    answer: `### Summary response
A program derived address (PDA) is an account address computed from a list of seeds and a program ID. It's derived to fall off the Ed25519 curve, so no private key exists for it: only the program it was derived from can sign for it, with \`invoke_signed\`.

Programs use PDAs for accounts they control at predictable addresses, such as one vault per user.

### Indepth response
**How the address is found**

1. Pick seeds that identify the account, for example \`"vault"\` and the user's address. Use up to 16 seeds of at most 32 bytes each.
2. \`findProgramAddress\` hashes the seeds, the program ID and a one-byte **bump** with SHA-256. It starts the bump at 255 and counts down until the result is off the curve.
3. The first bump that works is the **canonical bump**. Store it and always derive with it, so the same seeds can't map to a second address.

| | Keypair account | PDA |
| --- | --- | --- |
| Address | On the Ed25519 curve | Off the curve |
| Private key | Yes | No |
| Signs in a CPI | Only if it signed the transaction | Yes, with \`invoke_signed\` |

Deriving a PDA only computes an address. The account exists once your program creates it, usually with a CPI to the System Program signed with the same seeds and bump.

**Derive one in TypeScript**

${fence("ts", PDA_TS)}

Or from the CLI:

${fence("bash", "solana find-program-derived-address 11111111111111111111111111111111 string:vault")}

${FOLLOWUP_PROMPT}`,
    visual: pdaDerivationGenerativeUiFixture,
    code: [
      { label: "TypeScript", language: "typescript", code: PDA_TS },
      { label: "Rust", language: "rust", code: PDA_RUST },
    ],
    next: "A PDA has no account until your program creates one. The usual next step is a CPI to the System Program's `create_account`, signed with `invoke_signed` and the same seeds plus the bump. [CPIs with PDA signers](/developers/docs/core/cpi/cpi-with-pda) walks through it.",
    searchQueries: ["pda", "program derived address"],
    preferredUrls: [
      "/developers/docs/core/pda",
      "/developers/docs/core/pda/pda-derivation",
      "/developers/docs/core/pda/pda-accounts",
      "/developers/docs/core/cpi/cpi-with-pda",
    ],
  },
  {
    id: "cpi",
    label: "CPI",
    match:
      /\bcpis?\b|cross[- ]program|\bcalls? (another|other)\b|\binvoke(_signed)?\b/i,
    answer: `### Summary response
A cross-program invocation (CPI) is one program calling an instruction on another program while it runs, for example your program calling the Token Program to move tokens. Use \`invoke\` when every required signer already signed the transaction, and \`invoke_signed\` when your program signs for a PDA it derived.

### Indepth response
**What the calling program passes**

- the callee's program ID and instruction data;
- every account the inner instruction reads or writes;
- for \`invoke_signed\`, the seeds and bump of each PDA that must sign.

**Rules to plan for**

- Signer and writable privileges extend from the caller to the callee. A callee can't gain a privilege the caller didn't pass.
- The callee's compute units come out of the same transaction budget.
- A program can call itself (A → A), but A → B → A fails with \`ReentrancyNotAllowed\`.
- The instruction stack is limited to a depth of 5, counting the top-level instruction.

**Sign for a PDA in a CPI (native Rust)**

${fence("rust", CPI_NATIVE)}

The runtime derives an address from the seeds you pass and the calling program's ID, and treats it as a signer for the inner instruction.

${FOLLOWUP_PROMPT}`,
    visual: cpiFlowGenerativeUiFixture,
    code: [
      { label: "Native Rust", language: "rust", code: CPI_NATIVE },
      { label: "Anchor", language: "rust", code: CPI_ANCHOR },
    ],
    next: "If the callee needs a PDA to sign, pass the PDA's seeds and bump to `invoke_signed`; the runtime checks that they derive the account marked as a signer. [PDA derivation](/developers/docs/core/pda/pda-derivation) explains the seeds.",
    searchQueries: ["cross program invocation", "cpi"],
    preferredUrls: [
      "/developers/docs/core/cpi",
      "/developers/docs/core/cpi/cpi-with-pda",
      "/developers/docs/core/cpi/cpi-without-pda",
      "/developers/docs/tokens/advanced/cpi",
    ],
  },
  {
    id: "token",
    label: "token",
    match: /\btokens?\b|\bmint(s|ing|ed)?\b|\bspl\b|token accounts?/i,
    answer: `### Summary response
A token on Solana is a **mint account** plus one **token account** per holder. The mint stores the supply, decimals and mint authority; each token account stores one owner's balance of that mint. Minting with \`MintTo\` adds to the supply and credits a token account in the same instruction.

### Indepth response
| Account | Owned by | Holds |
| --- | --- | --- |
| Mint | Token Program | Supply, decimals, mint and freeze authority |
| Token account | Token Program | Balance, owner and mint |
| Wallet | System Program | SOL for fees and rent |

A wallet's default token account for a mint is its **associated token account**, a PDA derived from the wallet, the token program and the mint, so anyone can find it.

**On devnet, from the CLI**

${fence(
  "bash",
  `
solana config set --url devnet
solana airdrop 2
spl-token create-token
spl-token create-account <MINT_ADDRESS>
spl-token mint <MINT_ADDRESS> 100`,
)}

**Mint in TypeScript**

${fence("ts", MINT_TS)}

Amounts are in base units: with 6 decimals, \`1_000_000n\` is one token. Only the mint authority can sign \`MintTo\`.

${FOLLOWUP_PROMPT}`,
    visual: tokenLifecycleGenerativeUiFixture,
    code: [
      { label: "TypeScript", language: "typescript", code: MINT_TS },
      { label: "Rust", language: "rust", code: MINT_RUST },
    ],
    next: "Before a wallet can receive a token it needs a token account for that mint, usually its associated token account. [Create a token account](/developers/docs/tokens/basics/create-token-account) shows how, and [Transfer tokens](/developers/docs/tokens/basics/transfer-tokens) covers sending them.",
    searchQueries: ["mint", "token account", "token"],
    preferredUrls: [
      "/developers/docs/tokens/basics",
      "/developers/docs/tokens/basics/create-mint",
      "/developers/docs/tokens/basics/create-token-account",
      "/developers/docs/tokens/basics/mint-tokens",
    ],
  },
  {
    id: "transaction",
    label: "transaction",
    match:
      /\bsign(s|ing|ed|er|ers|ature|atures)?\b|\btransactions?\b|\bblockhash\b/i,
    answer: `### Summary response
A transaction is one or more instructions, a recent blockhash and a signature from every account marked as a signer. The fee payer signs first, and its signature is the transaction's ID. Validators reject it if a required signature is missing or the blockhash is more than about 150 blocks old, roughly a minute.

### Indepth response
**What gets signed**

- Every signer signs the same bytes: the **message**, which lists the account addresses, the recent blockhash and the instructions.
- Signatures use Ed25519, so each one is 64 bytes.
- The serialized transaction, signatures included, must fit in 1,232 bytes.

**Build, sign and send with \`@solana/kit\`**

${fence("ts", TX_TS)}

Send it with \`sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })\`, then check the result from the CLI:

${fence("bash", "solana confirm -v <SIGNATURE>")}

${FOLLOWUP_PROMPT}`,
    visual: transactionSigningGenerativeUiFixture,
    code: [
      { label: "TypeScript", language: "typescript", code: TX_TS },
      { label: "Rust", language: "rust", code: TX_RUST },
    ],
    next: "If a transaction expires before it lands, fetch a new blockhash, sign again and resend. [Retrying transactions](/developers/cookbook/transactions/retry) covers when to retry and how.",
    searchQueries: ["transactions", "signatures"],
    preferredUrls: [
      "/developers/docs/core/transactions",
      "/developers/docs/core/transactions/transaction-structure",
      "/developers/docs/core/wallets",
      "/developers/cookbook/transactions/retry",
    ],
  },
  {
    id: "rpc",
    label: "RPC",
    match: /\brpc\b|json-?rpc|\bendpoint\b|websocket/i,
    answer: `### Summary response
Apps read and write chain state through an RPC node: JSON-RPC over HTTP for requests such as \`getBalance\` and \`sendTransaction\`, and WebSocket subscriptions for updates. The public endpoints, such as \`https://api.devnet.solana.com\`, are rate-limited, so production apps use a dedicated provider.

### Indepth response
**Read a balance**

${fence(
  "bash",
  `
curl https://api.devnet.solana.com -s -X POST -H "Content-Type: application/json" -d '
  {"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": ["<ADDRESS>"]}
'`,
)}

${fence("ts", RPC_TS)}

The result is in lamports; 1 SOL is 1,000,000,000 lamports.

**Commitment**: most methods take a \`commitment\` that sets how settled the data must be.

| Commitment | Meaning |
| --- | --- |
| \`processed\` | The node has processed the block; it can still be skipped |
| \`confirmed\` | A supermajority of stake has voted on the block |
| \`finalized\` | The block is rooted and won't be rolled back |`,
    visual: rpcRequestLifecycleGenerativeUiFixture,
    code: [{ label: "TypeScript", language: "typescript", code: RPC_TS }],
    next: "For production traffic, pick a provider from [Choosing an RPC provider](/developers/docs/rpc/providers); the public endpoints rate-limit heavy use.",
    searchQueries: ["rpc"],
    preferredUrls: [
      "/developers/docs/rpc",
      "/developers/docs/rpc/http",
      "/developers/docs/rpc/providers",
      "/developers/docs/rpc/websocket",
    ],
  },
  {
    id: "account",
    label: "account",
    match: /\baccounts?\b|\brent\b|\blamports?\b/i,
    answer: `### Summary response
All state on Solana lives in accounts. An account is an address with a lamport balance, a data buffer, an owner program and an executable flag. Only the owner program can change an account's data or take lamports from it, and every account needs a rent-exempt balance that grows with its data size.

### Indepth response
| Field | What it holds |
| --- | --- |
| \`lamports\` | The balance (1 SOL = 1,000,000,000 lamports) |
| \`data\` | Bytes the owner program defines, up to 10 MiB |
| \`owner\` | The program allowed to modify the account |
| \`executable\` | Whether the account is a program |

**Creating an account** takes one System Program instruction, \`CreateAccount\`, which:

1. funds the new address with the rent-exempt minimum for its size;
2. allocates the data buffer;
3. assigns the owner program, which then writes the initial data.

${fence("ts", ACCOUNT_TS)}

Check the rent-exempt minimum for a size from the CLI:

${fence("bash", "solana rent 165")}

${FOLLOWUP_PROMPT}`,
    visual: accountInitializationGenerativeUiFixture,
    code: [
      { label: "TypeScript", language: "typescript", code: ACCOUNT_TS },
      { label: "Rust", language: "rust", code: ACCOUNT_RUST },
    ],
    next: "Fund new accounts with `getMinimumBalanceForRentExemption` for their data size; the deposit comes back when the account is closed. [Rent](/developers/docs/core/rent) explains how it's calculated.",
    searchQueries: ["accounts", "rent"],
    preferredUrls: [
      "/developers/docs/core/accounts",
      "/developers/docs/core/accounts/account-types",
      "/developers/docs/core/rent",
      "/developers/cookbook/accounts/create-account",
    ],
  },
];

const TOPIC_BY_ID = new Map(TOPICS.map((topic) => [topic.id, topic]));

export function isMockTopicId(value: unknown): value is MockTopicId {
  return typeof value === "string" && TOPIC_BY_ID.has(value as MockTopicId);
}

export function topicFor(question: string): MockTopicId | null {
  return TOPICS.find((topic) => topic.match.test(question))?.id ?? null;
}

function codeFollowupsFor(topic: MockTopic): MockCodeFollowups | null {
  if (!topic.answer.endsWith(FOLLOWUP_PROMPT) || topic.code.length === 0) {
    return null;
  }
  return {
    prompt: FOLLOWUP_PROMPT,
    buttons: topic.code.map((sample) => ({
      type: "show_code",
      label: sample.label,
      language: sample.language,
      message: `Show me the code for that in ${sample.label}.`,
    })),
  };
}

// --- Code explanation ---------------------------------------------------------

const CODE_NOTES: Array<[RegExp, string]> = [
  [
    /getProgramDerivedAddress|findProgramAddress|find_program_address/,
    "derives a program derived address (PDA) from seeds and a program ID, and returns it with its bump",
  ],
  [
    /invoke_signed|with_signer/,
    "calls another program and signs for a PDA with its seeds (a CPI)",
  ],
  [/\binvoke\(|CpiContext/, "calls another program's instruction (a CPI)"],
  [/getMintTo|mint_to|MintTo/, "mints tokens into a token account"],
  [
    /getTransfer\w*Instruction|transfer_checked|system_instruction::transfer/,
    "builds a transfer instruction",
  ],
  [
    /getCreateAccountInstruction|create_account/,
    "creates an account through the System Program",
  ],
  [
    /findAssociatedTokenPda|get_associated_token_address/,
    "finds the wallet's associated token account for a mint",
  ],
  [
    /ComputeUnit(Price|Limit)|compute_budget/i,
    "sets the compute budget, which prices the prioritization fee",
  ],
  [/createSolanaRpc|new Connection|RpcClient::new/, "connects to an RPC node"],
  [
    /getLatestBlockhash|get_latest_blockhash/,
    "fetches a recent blockhash, which sets how long the transaction stays valid",
  ],
  [
    /signTransaction\w*|new_signed_with_payer|\.sign\(/,
    "signs the transaction",
  ],
  [
    /sendAndConfirm\w*|send_and_confirm\w*|sendTransaction/,
    "sends the transaction and waits for confirmation",
  ],
  [/requestAirdrop|airdrop/i, "requests devnet SOL for fees"],
  [
    /#\[program\]|#\[derive\(Accounts\)\]/,
    "declares an Anchor program and the accounts its instruction expects",
  ],
  [/^\s*(\$\s*)?(solana|spl-token)\s/m, "runs Solana CLI commands"],
];

function codeLanguage(code: string): string {
  if (/^\s*(use |fn |pub |#\[)/m.test(code)) return "Rust";
  if (/^\s*(\$\s*)?(solana|spl-token|cargo|npm|pnpm|anchor)\s/m.test(code)) {
    return "shell";
  }
  if (/\b(import|const|await|export)\b/.test(code)) return "TypeScript";
  return "code";
}

function explainCode(code: string): string {
  const language = codeLanguage(code);
  const lines = code.split("\n").map((line) => line.trim());
  const steps: string[] = [];
  const actions: string[] = [];
  const isImport = (line: string) => /^(import|use)\s/.test(line);
  for (const [pattern, note] of CODE_NOTES) {
    const line =
      lines.find(
        (candidate) => !isImport(candidate) && pattern.test(candidate),
      ) ?? lines.find((candidate) => pattern.test(candidate));
    if (!line || actions.includes(note)) continue;
    actions.push(note);
    const shown = line.length > 70 ? `${line.slice(0, 67)}…` : line;
    steps.push(`\`${shown.replace(/`/g, "'")}\` ${note}.`);
  }
  const imports = [
    ...code.matchAll(/from\s+["']([^"']+)["']|^\s*use\s+([\w:]+)/gm),
  ]
    .map((match) => match[1] ?? match[2])
    .filter(
      (name, index, all): name is string =>
        !!name && all.indexOf(name) === index,
    )
    .slice(0, 4);

  const summary =
    actions.length > 0
      ? `This ${language} snippet ${actions.slice(0, 2).join(", then ")}.`
      : `This ${language} snippet doesn't call a Solana API I recognize, so here is what each part does as written.`;
  const importLine =
    imports.length > 0
      ? `It depends on ${imports.map((name) => `\`${name}\``).join(", ")}.`
      : "";
  const stepList =
    steps.length > 0
      ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
      : lines
          .filter((line) => line && !line.startsWith("//"))
          .slice(0, 4)
          .map((line, index) => `${index + 1}. \`${line.replace(/`/g, "'")}\``)
          .join("\n");

  return `### Summary response
${summary} ${importLine}

### Indepth response
**Step by step**

${stepList}

Run it against devnet first (\`solana config set --url devnet\`), where accounts and SOL cost nothing real.`;
}

// --- Page questions -------------------------------------------------------------

function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Words worth searching for: no stop words, no short words. */
export function keywords(text: string): string[] {
  const words: string[] =
    text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
  return words.filter(
    (word, index) =>
      word.length > 2 && !STOP_WORDS.has(word) && words.indexOf(word) === index,
  );
}

const STOP_WORDS = new Set(
  "about after also and any are can could does doing done for from get has have how into its just like make more most need not now one our out should some than that the their them then there these this those use used using want was way what when where which while who why will with would you your".split(
    " ",
  ),
);

function aboutPage(page: MockPage, question: string): string {
  const link = (heading: string) =>
    `[${heading}](${page.path}#${slug(heading)})`;
  const asked = keywords(question);
  const closest = page.headings
    .map((heading) => ({
      heading,
      score: keywords(heading).filter((word) =>
        asked.some((ask) => ask.startsWith(word) || word.startsWith(ask)),
      ).length,
    }))
    .sort((a, b) => b.score - a.score)[0];
  const sections = page.headings
    .slice(0, 8)
    .map((heading) => `- ${link(heading)}`)
    .join("\n");
  return `### Summary response
The page [${page.title}](${page.path}) covers this${page.description ? `: ${page.description}` : "."}

${closest && closest.score > 0 ? `For “${question}”, read ${link(closest.heading)}.` : `For “${question}”, start with the sections below.`}

### Indepth response
${sections ? `**Sections on the page**\n\n${sections}` : `The page has no sections; read it from the top: [${page.title}](${page.path}).`}`;
}

// --- General answers ------------------------------------------------------------

function generalAnswer(citations: MockCitation[]): string {
  const pages = citations
    .slice(0, 3)
    .map((citation) => `- [${citation.title}](${citation.url})`)
    .join("\n");
  return `### Summary response
${pages ? `These docs pages match your question most closely:\n\n${pages}` : "I couldn't find a docs page that matches your question. Try naming the program, account type or API you're working with."}

### Indepth response
To try the examples locally, install the Solana CLI and point it at devnet:

${fence(
  "bash",
  `
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana config set --url devnet
solana airdrop 2`,
)}

Then connect from TypeScript with \`@solana/kit\`:

${fence(
  "ts",
  `
import { createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const slot = await rpc.getSlot().send();`,
)}

[Install dependencies](/developers/docs/intro/installation/dependencies) covers the rest of the toolchain.`;
}

// --- Plans ------------------------------------------------------------------------

function topicPlan(topic: MockTopic): MockPlan {
  return {
    topic: topic.id,
    render: () => topic.answer,
    visual: topic.visual,
    codeFollowups: codeFollowupsFor(topic),
    searchQueries: topic.searchQueries,
    preferredUrls: topic.preferredUrls,
  };
}

function summaryOnly(answer: string): string {
  const end = answer.search(/^###\s*Indepth response/im);
  return (end === -1 ? answer : answer.slice(0, end)).trim();
}

function followUpPlan(question: string, prior: MockTopic): MockPlan {
  const base = {
    topic: prior.id,
    visual: null,
    codeFollowups: null,
    searchQueries: prior.searchQueries,
    preferredUrls: prior.preferredUrls,
  };

  if (
    /\b(code|example|snippet|rust|anchor|typescript|ts|javascript|js)\b/i.test(
      question,
    )
  ) {
    const wanted =
      prior.code.find((sample) =>
        new RegExp(`\\b${sample.label.split(" ").pop()}\\b`, "i").test(
          question,
        ),
      ) ?? prior.code[0];
    if (wanted) {
      const language =
        wanted.language === "typescript" ? "ts" : wanted.language;
      return {
        ...base,
        render: () => `### Summary response
Here is the ${prior.label} example in ${wanted.label}.

${fence(language, wanted.code)}

${prior.next}`,
      };
    }
  }

  const other = TOPICS.find((topic) => topic.match.test(question));
  if (other && other.id !== prior.id) {
    return {
      ...topicPlan(other),
      visual: null,
      codeFollowups: null,
      render: () => summaryOnly(other.answer),
    };
  }

  return {
    ...base,
    render: () => `### Summary response
Building on the ${prior.label} answer above: ${prior.next}`,
  };
}

/**
 * Picks the answer for one turn. `priorTopic` is the conversation's topic on
 * a follow-up turn (undefined on a first turn); `page` is set when the
 * question is about a docs page.
 */
export function planMockAnswer(options: {
  question: string;
  priorTopic?: MockTopicId | null;
  followUp?: boolean;
  page?: MockPage | null;
}): MockPlan {
  const { question, page } = options;
  const code = /```[\w-]*\n([\s\S]*?)```/.exec(question)?.[1];
  if (code?.trim()) {
    const related = TOPICS.find((topic) => topic.match.test(code));
    return {
      topic: related?.id ?? null,
      render: () => explainCode(code),
      visual: null,
      codeFollowups: null,
      searchQueries: related?.searchQueries ?? ["programs", "transactions"],
      preferredUrls: related?.preferredUrls ?? [],
    };
  }

  if (page) {
    const ask = question.trim() || page.title;
    return {
      topic: topicFor(`${page.title} ${ask}`),
      render: () => aboutPage(page, ask),
      visual: null,
      codeFollowups: null,
      searchQueries: [page.title],
      preferredUrls: [page.path],
    };
  }

  if (options.followUp) {
    const prior = options.priorTopic
      ? TOPIC_BY_ID.get(options.priorTopic)
      : undefined;
    if (prior) return followUpPlan(question, prior);
  }

  const topic = TOPICS.find((candidate) => candidate.match.test(question));
  if (topic) {
    const plan = topicPlan(topic);
    return options.followUp
      ? {
          ...plan,
          visual: null,
          codeFollowups: null,
          render: () => summaryOnly(topic.answer),
        }
      : plan;
  }

  const words = keywords(question);
  return {
    topic: null,
    render: generalAnswer,
    visual: null,
    codeFollowups: null,
    // The index holds titles and descriptions, so search the key words.
    searchQueries: [
      words.join(" "),
      ...[...words].sort((a, b) => b.length - a.length).slice(0, 2),
    ].filter(Boolean),
    preferredUrls: [],
  };
}
