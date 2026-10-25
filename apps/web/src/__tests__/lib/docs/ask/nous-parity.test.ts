import { describe, expect, it } from "vitest";
import {
  templateVisual,
  type TemplateVisualName,
} from "@/lib/docs/ask/fixtures/template-visuals";
import { normalizeAskVisual } from "@/lib/docs/ask/generative-ui/schema";
import {
  docsLinkPaths,
  sanitizeDocsLinks,
  withoutSourceList,
} from "@/lib/docs/ask/server/answer-links";
import {
  decodeErrors,
  errorReference,
  programFamilyIn,
} from "@/lib/docs/ask/server/error-catalog";
import {
  CONCEPTUAL_CODE_PROMPT,
  availableCodeLanguages,
  codeFollowupsFor,
  docTopics,
  finalAnswer,
  suggestFollowups,
} from "@/lib/docs/ask/server/followups";
import {
  guidanceFor,
  guidanceLinks,
  guidancePacks,
} from "@/lib/docs/ask/server/guidance";
import { visualIntent } from "@/lib/docs/ask/server/intent";
import {
  CODE_FOLLOWUP,
  pinnedPaths,
  rpcMethods,
  workflowFor,
} from "@/lib/docs/ask/server/pins";
import { templateFor } from "@/lib/docs/ask/server/templates";
import {
  extractJson,
  parseVisualReply,
  visualUserMessage,
} from "@/lib/docs/ask/server/visual-llm";

describe("visual intent (the agent's visualIntent)", () => {
  it.each([
    ["What is a PDA?", "conceptual"],
    ["Why do transactions need recent blockhashes?", "conceptual"],
    ["Explain rent", "conceptual"],
    ["How do I create a token?", "procedural"],
    ["Send SOL to another wallet", "procedural"],
    ["PDA vs keypair", "comparison"],
    ["What's the difference between processed and confirmed?", "comparison"],
    ["Compare two ways to create a mint", "procedural"],
    [
      "Why does my transaction fail with custom program error 0x1771?",
      "debugging",
    ],
    ["Can’t deserialize the account", "debugging"],
    ["hello there", "weak"],
  ] as const)("%s → %s", (question, intent) => {
    expect(visualIntent(question)).toBe(intent);
  });

  it("lets the answer settle an unclear question", () => {
    expect(visualIntent("Tell me about rent", "Rent is why accounts …")).toBe(
      "conceptual",
    );
  });
});

describe("template visuals (GenerativeUiTemplateService)", () => {
  const name = (question: string) =>
    templateFor(question, visualIntent(question), workflowFor(question))
      ?.name ?? null;

  it.each([
    ["How do I create a token?", "tokenLifecycle"],
    ["What is an associated token account?", "tokenLifecycle"],
    ["How do I derive a PDA?", "pdaDerivation"],
    ["What is a CPI?", "cpiFlow"],
    ["How do I sign and send a transaction?", "transactionSigning"],
    ["How do I fetch account data over RPC?", "rpcRequestLifecycle"],
    ["How do I create account space for my program?", "accountInitialization"],
    ["Why does my transaction fail?", "debuggingFlow"],
    // Workflow routes stand in for the agent's answer plan.
    ["How do I make a new SPL token?", "tokenLifecycle"],
    // "update" is not a PDA; comparisons and weak questions get nothing.
    ["How do I update a counter?", null],
    ["PDA vs keypair account", null],
    ["Tell me a story", null],
    // The empty state's plain-words CPI question.
    ["How does one program call another?", "cpiFlow"],
    // The token template draws the classic Token Program.
    ["How do I create a token with Token Extensions?", null],
    ["How do I create a Token-2022 mint?", null],
  ] as const)("%s → %s", (question, expected) => {
    expect(name(question)).toBe(expected);
  });

  it("falls back to the titles of the canonical pages read", () => {
    expect(
      templateFor("What does it return?", "conceptual", null, [
        "getAccountInfo",
      ])?.name,
    ).toBe("rpcRequestLifecycle");
    expect(
      templateFor("What does it return?", "conceptual", null, [
        "What is Staking?",
      ]),
    ).toBeNull();
  });

  it("trims a conceptual question's visual to the intro and model", () => {
    const concept = templateFor("What is a token account?", "conceptual")!.ui;
    expect(concept.components.map((c) => c.type)).toEqual([
      "answer_intro",
      "concept_model",
    ]);
    expect(concept.components[0]).toMatchObject({
      body: expect.stringContaining("A token is a mint account"),
    });
    const full = templateFor("How do I create a token?", "procedural")!.ui;
    expect(full.components.map((c) => c.type)).toContain("step_flow");
  });

  it.each<TemplateVisualName>([
    "tokenLifecycle",
    "pdaDerivation",
    "cpiFlow",
    "transactionSigning",
    "rpcRequestLifecycle",
    "accountInitialization",
    "debuggingFlow",
  ])("%s renders whole and concept-only", (template) => {
    for (const conceptOnly of [false, true]) {
      const visual = normalizeAskVisual(templateVisual(template, conceptOnly));
      expect(visual.skipped).toEqual([]);
      expect(visual.intro?.body).toBeTruthy();
      expect(visual.model?.nodes.length).toBeGreaterThan(0);
      expect(Boolean(visual.flow)).toBe(
        !conceptOnly || template === "debuggingFlow",
      );
    }
  });
});

describe("canonical pages (DocsWorkflowRouter as pins)", () => {
  it.each([
    ["How do I create a new token?", "token_lifecycle"],
    ["What is a PDA?", "pda_derivation"],
    ["How do I sign and send a transaction?", "transaction_signing"],
    ["How does invoke_signed work?", "cpi_flow"],
    ["How do I initialize a state account?", "account_initialization"],
    ["Walk me through the RPC request lifecycle", "rpc_request_lifecycle"],
    ["Which is better, a PDA or a keypair?", null],
    ["What is rent?", null],
    ["How does one program call another?", "cpi_flow"],
  ] as const)("%s → %s", (question, key) => {
    expect(workflowFor(question)?.key ?? null).toBe(key);
  });

  it("gives each route its topic and the pages with its code", () => {
    expect(workflowFor("What is a PDA?")).toMatchObject({
      topic: "pda",
      code: [
        "/developers/docs/core/pda/pda-derivation",
        "/developers/docs/core/pda/pda-accounts",
      ],
    });
    expect(workflowFor("How do I create a token?")!.code).toContain(
      "/developers/docs/tokens/basics/create-mint",
    );
    expect(workflowFor("What is a CPI?")!.code).toContain(
      "/developers/docs/core/cpi/cpi-with-pda",
    );
  });

  it.each([
    ["Show me the code for that in TypeScript.", true],
    ["Can I see a code example?", true],
    ["And in Rust?", true],
    ["What is a PDA?", false],
    ["Where is the source code hosted?", false],
  ] as const)("code request: %s → %s", (question, expected) => {
    expect(CODE_FOLLOWUP.test(question)).toBe(expected);
  });

  it("reads the lesson a Next lesson button names", () => {
    expect(
      pinnedPaths("Teach me the next lesson: What is Staking?."),
    ).toContain("/learn/what-is-staking");
    expect(pinnedPaths("What is a Wallet?")).not.toContain(
      "/learn/what-is-a-wallet",
    );
  });

  it("uses /developers/docs paths and puts RPC method pages first", () => {
    expect(workflowFor("What is a PDA?")!.docs).toEqual([
      "/developers/docs/core/pda",
      "/developers/docs/core/accounts",
      "/developers/docs/core/cpi",
    ]);
    expect(
      rpcMethods(
        "Is getAccountInfo or accountSubscribe better than getting logs?",
      ),
    ).toEqual(["getaccountinfo", "accountsubscribe", "getting"]);
    expect(
      pinnedPaths("How do I derive a PDA with getAccountInfo?").slice(0, 3),
    ).toEqual([
      "/developers/docs/rpc/http/getaccountinfo",
      "/developers/docs/rpc/websocket/getaccountinfo",
      "/developers/docs/core/pda",
    ]);
  });

  it.each([
    [
      "How do I install the Solana command line tools?",
      "/developers/docs/intro/installation/dependencies",
    ],
    ["What is staking and how do I stake SOL?", "/learn/what-is-staking"],
    [
      "Why do my transactions expire before confirming?",
      "/developers/cookbook/transactions/confirmation",
    ],
  ])("pins a page search misses: %s", (question, page) => {
    expect(pinnedPaths(question)).toContain(page);
  });

  it("pins nothing for questions without a route", () => {
    expect(pinnedPaths("What is rent?")).toEqual([]);
    expect(pinnedPaths("How does a validator vote?")).toEqual([]);
  });
});

describe("code follow-ups (conceptualCodeFollowups)", () => {
  it("finds languages in fences and names, in the agent's order", () => {
    expect(
      availableCodeLanguages(
        "```ts\nx\n```\nAnchor and @solana/web3.js and py",
      ),
    ).toEqual(["rust", "typescript", "javascript", "python"]);
    expect(availableCodeLanguages("no code here")).toEqual([]);
    expect(availableCodeLanguages("trust the docs")).toEqual([]);
  });

  it("offers code after a cited conceptual answer", () => {
    const followups = codeFollowupsFor({
      question: "What is a PDA?",
      answer: "A PDA is an address. See [PDAs](/developers/docs/core/pda).",
      context: "```rust\nfn x() {}\n```",
      grounded: true,
    });
    expect(followups).toEqual({
      prompt: CONCEPTUAL_CODE_PROMPT,
      buttons: [
        {
          type: "show_code",
          label: "Rust",
          language: "rust",
          message: "Show me the code for that in Rust.",
        },
        {
          type: "show_code",
          label: "TypeScript",
          language: "typescript",
          message: "Show me the code for that in TypeScript.",
        },
      ],
    });
    // Always Rust and TypeScript (the excerpts often show one language),
    // plus what the whole pages show, in the agent's order.
    expect(
      codeFollowupsFor({
        question: "What is a PDA?",
        answer: "A PDA is an address.",
        context: "",
        grounded: true,
      })!.buttons.map((b) => b.label),
    ).toEqual(["Rust", "TypeScript"]);
    expect(
      codeFollowupsFor({
        question: "What is a PDA?",
        answer: "A PDA is an address.",
        context: "",
        languages: ["python", "javascript"],
        grounded: true,
      })!.buttons.map((b) => b.label),
    ).toEqual(["Rust", "TypeScript", "JavaScript", "Python"]);
  });

  it("offers none for declines, code answers and how-to questions", () => {
    const base = { context: "", grounded: true };
    expect(
      codeFollowupsFor({
        ...base,
        question: "What is a PDA?",
        answer: "No.",
        grounded: false,
      }),
    ).toBeNull();
    expect(
      codeFollowupsFor({
        ...base,
        question: "What is a PDA?",
        answer: "```ts\nconst x = 1;\n```",
      }),
    ).toBeNull();
    expect(
      codeFollowupsFor({
        ...base,
        question: "How do I create a token?",
        answer: "Run the CLI.",
      }),
    ).toBeNull();
    // Nor for pasted code, or a user answer from the Learn track.
    expect(
      codeFollowupsFor({
        ...base,
        question: "Explain this code",
        answer: "It derives a PDA.",
        aboutCode: true,
      }),
    ).toBeNull();
    expect(
      codeFollowupsFor({
        ...base,
        question: "What is staking?",
        answer: "Staking delegates SOL to a validator.",
        citations: [{ url: "/learn/what-is-staking" }],
      }),
    ).toBeNull();
    // Unless the model asked the code question itself, anywhere…
    expect(
      codeFollowupsFor({
        ...base,
        question: "How do I create a token?",
        answer: `Run the CLI.\n\n${CONCEPTUAL_CODE_PROMPT}`,
      }),
    ).not.toBeNull();
    // …but never after explaining pasted code: the question is dropped.
    expect(
      codeFollowupsFor({
        ...base,
        question: "Explain this code",
        answer: `It derives a PDA.\n\n${CONCEPTUAL_CODE_PROMPT}\n\n[PDAs](/x)`,
        aboutCode: true,
      }),
    ).toBeNull();
  });

  it("ends the answer with the code question once, or drops it", () => {
    const asked = `A PDA has no key.\n\n${CONCEPTUAL_CODE_PROMPT}\n\nSee [PDAs](/developers/docs/core/pda).`;
    expect(finalAnswer(asked, true)).toBe(
      `A PDA has no key.\n\nSee [PDAs](/developers/docs/core/pda).\n\n${CONCEPTUAL_CODE_PROMPT}`,
    );
    expect(finalAnswer("A PDA has no key.", true)).toBe(
      `A PDA has no key.\n\n${CONCEPTUAL_CODE_PROMPT}`,
    );
    expect(finalAnswer(`No.\n\n${CONCEPTUAL_CODE_PROMPT}`, false)).toBe("No.");
    expect(finalAnswer("  Plain answer.\n", false)).toBe("Plain answer.");
  });
});

describe("suggested follow-ups (FollowupSuggestionService)", () => {
  const page = (url: string, title: string, text: string) => ({
    url,
    title,
    topics: docTopics(`${url}\n${text}`),
  });

  it("tags pages with the agent's topic facets", () => {
    expect(
      docTopics("/developers/docs/core/pda\nA PDA has an owner program."),
    ).toEqual(["accounts", "pda", "programs"]);
    // Word needles start a word: "current" is not about rent.
    expect(
      docTopics("/learn/what-is-a-wallet\nThe current, different view."),
    ).toEqual(["wallets"]);
    expect(docTopics("/developers/docs/rpc/http/getbalance")).toEqual(["rpc"]);
  });

  it("offers a user's answer the next lesson and other lessons, not developer questions", () => {
    const pages = [
      page(
        "/learn/what-is-a-wallet",
        "What is a Wallet?",
        "A wallet holds keys.",
      ),
      page(
        "/developers/docs/tools/commerce-kit/quickstart/wallet-connection",
        "Wallet connection",
        "Connect a wallet signer.",
      ),
      page(
        "/learn/staying-safe-on-solana",
        "Staying Safe on Solana",
        "Never share a seed phrase.",
      ),
    ];
    const suggested = suggestFollowups({
      question: "What is a wallet?",
      answer: "See [wallets](/learn/what-is-a-wallet).",
      pages,
      citations: [{ url: "/learn/what-is-a-wallet" }],
    });
    expect(suggested).toEqual({
      prompt: "Want to keep going? Try one of these:",
      buttons: [
        {
          type: "ask",
          label: "Next lesson: Understanding Solana Transaction Fees",
          message:
            "Teach me the next lesson: Understanding Solana Transaction Fees.",
        },
        {
          type: "ask",
          label: "Staying Safe on Solana",
          message: "Tell me more about Staying Safe on Solana.",
        },
      ],
    });
    // A developer answer that also cites a lesson keeps its topic questions.
    expect(
      suggestFollowups({
        question: "Who signs for an account?",
        answer: "Its owner program.",
        pages: [
          page("/developers/docs/core/accounts", "Accounts", "Accounts."),
          ...pages,
        ],
        citations: [
          { url: "/developers/docs/core/accounts" },
          { url: "/learn/what-is-a-wallet" },
        ],
      })!.buttons.map((b) => b.label),
    ).toContain("Rent exemption");
  });

  it("ranks the question's own topic first, and skips what a cited title names", () => {
    const text = "Accounts have owners; a program can invoke another.";
    const pages = [
      page("/developers/docs/core/cpi", "Cross-program invocation", text),
      page(
        "/developers/docs/core/cpi/cpi-execution",
        "CPI Execution and Privileges",
        text,
      ),
      page("/developers/docs/core/accounts", "Accounts", text),
      page("/developers/docs/core/accounts/rent", "Rent", text),
    ];
    const suggested = suggestFollowups({
      question: "What is a PDA?",
      answer: "A PDA is an address.",
      pages,
      citations: [
        { url: "/developers/docs/core/accounts" },
        { url: "/developers/docs/core/accounts/rent" },
      ],
      topics: ["pda"],
    });
    expect(suggested!.buttons.map((b) => b.label).slice(0, 2)).toEqual([
      "PDA signing",
      "Canonical bumps",
    ]);
    const cpi = suggestFollowups({
      question: "How does one program call another?",
      answer: "With a CPI.",
      pages,
      citations: [
        { url: "/developers/docs/core/cpi" },
        { url: "/developers/docs/core/cpi/cpi-execution" },
      ],
      topics: ["cpi"],
    });
    expect(cpi!.buttons.map((b) => b.label)).not.toContain("CPI privileges");
  });

  it("ranks the topics the pages are about above ones their text mentions", () => {
    // Token pages mention accounts, owners and programs throughout.
    const text = "The mint account and token accounts are owned by a program.";
    const suggested = suggestFollowups({
      question: "How do I create a token?",
      answer: "Use the CLI.",
      pages: [
        page("/developers/docs/tokens/quickstart", "Quickstart", text),
        page(
          "/developers/docs/tokens/basics/create-mint",
          "Create a Token Mint",
          text,
        ),
      ],
      citations: [
        { url: "/developers/docs/tokens/quickstart" },
        { url: "/developers/docs/tokens/basics/create-mint" },
      ],
    });
    expect(suggested!.buttons.map((b) => b.label)).toEqual([
      "Associated token accounts",
      "Token-2022 extensions",
      "Rent exemption",
    ]);

    // A title naming programs doesn't make a PDA page about programs.
    const pda = suggestFollowups({
      question: "What is a program derived address?",
      answer: "A PDA has no private key.",
      pages: [
        page(
          "/developers/docs/core/pda",
          "Program-derived addresses (PDAs)",
          text,
        ),
        page("/developers/docs/programs/anchor/pda", "PDAs with Anchor", text),
        page("/developers/docs/programs/rust", "Rust programs", text),
      ],
      citations: [{ url: "/developers/docs/core/pda" }],
    });
    expect(pda!.buttons.map((b) => b.label).slice(0, 2)).toEqual([
      "PDA signing",
      "Canonical bumps",
    ]);
  });

  it("never repeats the question and gives null rather than filler", () => {
    const suggested = suggestFollowups({
      question: "How does rent exemption affect creating accounts?",
      answer: "[Rent](/developers/docs/core/rent)",
      pages: [page("/developers/docs/core/rent", "Rent", "Accounts and rent.")],
      citations: [{ url: "/developers/docs/core/rent" }],
    });
    expect(suggested!.buttons.map((b) => b.label)).toEqual([
      "Account ownership",
    ]);
    expect(
      suggestFollowups({
        question: "x",
        answer: "y",
        pages: [],
        citations: [],
      }),
    ).toBeNull();
  });
});

describe("error decoding (ErrorCatalog + decode_error)", () => {
  it("decodes Anchor custom and framework errors", () => {
    const custom = decodeErrors("custom program error: 0x1771").matches;
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({
      family: "anchor-custom",
      code: 6001,
      hex: "0x1771",
    });
    expect(custom[0]!.explanation).toContain("the 2nd error declared");
    expect(custom[0]!.fix).not.toContain("inspect_entity");

    for (const text of [
      "Error Number: 2006. Error Message: A seeds constraint was violated.",
      "Why do I get ConstraintSeeds?",
      "ConstraintSeeds",
    ]) {
      expect(decodeErrors(text).matches[0]).toMatchObject({
        family: "anchor",
        name: "ConstraintSeeds",
        code: 2006,
        explanation: expect.stringContaining("seeds"),
      });
    }
  });

  it("lists every program for an ambiguous code, and Token-2022-only codes", () => {
    const ambiguous = decodeErrors("custom program error: 0x1");
    expect(ambiguous.matches.map((m) => m.name)).toEqual([
      "InsufficientFunds",
      "ResultWithNegativeLamports",
    ]);
    expect(ambiguous.notes.join(" ")).toContain("namespaced per program");
    const token2022 = decodeErrors("custom program error: 0x26");
    expect(token2022.matches[0]).toMatchObject({
      family: "token-2022",
      name: "NonTransferableNeedsImmutableOwnership",
    });
    expect(token2022.notes[0]).toContain("only exists on Token-2022");
    expect(
      decodeErrors("custom program error: 0x1", "system").matches.map(
        (m) => m.name,
      ),
    ).toEqual(["ResultWithNegativeLamports"]);
  });

  it("matches runtime messages and points at /developers pages", () => {
    const reference = errorReference("Error: Blockhash not found when I send")!;
    expect(reference.text).toContain("BlockhashNotFound");
    expect(reference.text).toMatch(
      /^<reference title="Decoded Solana errors">\n/,
    );
    expect(reference.docs).toEqual([
      "/developers/cookbook/transactions/confirmation",
    ]);
    expect(reference.sources).toEqual([]);
    expect(errorReference("custom program error: 0x1771")!.sources).toEqual([
      {
        title: "Anchor error codes",
        url: "https://github.com/otter-sec/anchor/blob/master/lang/error/src/lib.rs",
      },
    ]);
  });

  it("does not guess from prose", () => {
    expect(
      errorReference("A stack Overflow, not confirmed in 30 blocks"),
    ).toBeNull();
    expect(errorReference("What is a PDA?")).toBeNull();
    expect(decodeErrors("0xdeadbeefdeadbeef").matches).toEqual([]);
    expect(programFamilyIn("a Token-2022 mint")).toBe("token-2022");
    expect(
      programFamilyIn("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed"),
    ).toBe("spl-token");
  });
});

describe("guidance packs", () => {
  it.each([
    ["How do I use surfpool cheatcodes?", ["surfpool"]],
    ["Set up an integration test with LiteSVM", ["surfpool"]],
    ["I'm new to Solana, where do I start?", ["learn"]],
    ["I finished the wallet lesson, what's next?", ["learn"]],
    ["Teach me the next lesson: What is Staking?.", ["learn"]],
    ["What is a PDA?", []],
  ] as const)("%s → %j", (question, packs) => {
    expect(guidancePacks(question)).toEqual(packs);
  });

  it("follows the previous question and uses /developers paths only", () => {
    expect(guidancePacks("And in Rust?", "How do I start surfpool?")).toEqual([
      "surfpool",
    ]);
    const text = guidanceFor("surfpool and where do I start");
    expect(text.startsWith("<guidance>\n")).toBe(true);
    expect(text).not.toMatch(/[\s(]\/docs\//);
    expect(text).not.toContain("bootcamp");
    expect(text).not.toContain("search_docs");
    expect(guidanceFor("What is rent?")).toBe("");
  });

  it("lists the pages a pack links, for citations", () => {
    const learn = guidanceLinks("I'm new to Solana, where do I start?");
    expect(learn).toContain("/learn/what-is-solana");
    expect(learn).toContain("/developers/docs/quickstart");
    const surfpool = guidanceLinks("How do I use surfpool cheatcodes?");
    expect(surfpool).toContain(
      "/developers/docs/tools/surfpool/rpc/cheatcodes",
    );
    expect(surfpool.every((path) => path.startsWith("/developers/docs/"))).toBe(
      true,
    );
    expect(guidanceLinks("What is rent?")).toEqual([]);
  });
});

describe("model visuals (GenerativeUiService)", () => {
  it("finds the JSON in a reply", () => {
    expect(extractJson("null")).toBe("null");
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Sure: {"a":{"b":1}} done')).toBe('{"a":{"b":1}}');
    expect(extractJson("nothing")).toBeNull();
  });

  it("unwraps, filters to first-payload components and validates", () => {
    expect(parseVisualReply('{"generative_ui": null}')).toMatchObject({
      ui: null,
      outcome: "null",
    });
    expect(parseVisualReply("{nope")).toMatchObject({ outcome: "invalid" });
    const reply = parseVisualReply(
      JSON.stringify({
        generative_ui: {
          version: "solana-docs-ui/v1",
          kind: "answer",
          components: [
            { type: "source_links", links: [{ url: "https://x.example" }] },
            {
              type: "answer_intro",
              body: "Rent is a deposit.",
              sources: [{ url: "https://x.example" }],
            },
          ],
        },
      }),
    );
    expect(reply).toMatchObject({
      outcome: "valid",
      ui: {
        components: [{ type: "answer_intro", body: "Rent is a deposit." }],
      },
    });
  });

  it("drops model nodes no step touches, then still validates", () => {
    const reply = parseVisualReply(
      JSON.stringify({
        version: "solana-docs-ui/v1",
        kind: "answer",
        components: [
          {
            type: "concept_model",
            nodes: [
              { id: "wallet", archetype: "wallet", label: "Wallet" },
              { id: "rpc-node", archetype: "rpc-node", label: "Surfpool" },
            ],
            relationships: [{ from: "wallet", to: "rpc-node", kind: "signs" }],
          },
          {
            type: "step_flow",
            steps: [
              {
                title: "Start Surfpool",
                body: "Start the local network.",
                result: "rpc-node is running.",
                effects: [{ node_id: "rpc-node", action: "reveal" }],
              },
            ],
          },
        ],
      }),
    );
    expect(reply.outcome).toBe("valid");
    expect(reply.ui!.components[0]).toMatchObject({
      nodes: [{ id: "rpc-node" }],
    });
    expect(reply.ui!.components[0]).not.toHaveProperty("relationships");
  });

  it("drops empty node fields and ignores setup steps when pruning", () => {
    const reply = parseVisualReply(
      JSON.stringify({
        version: "solana-docs-ui/v1",
        kind: "answer",
        components: [
          {
            type: "concept_model",
            nodes: [
              {
                id: "wallet",
                archetype: "wallet",
                label: "Wallet",
                fields: [{ label: "role", value: "" }],
              },
              { id: "program", archetype: "program", label: "Program" },
            ],
          },
          {
            type: "step_flow",
            steps: [
              {
                title: "Fund wallet",
                body: "Airdrop SOL to wallet.",
                result: "wallet is funded.",
                effects: [{ node_id: "wallet", action: "reveal" }],
              },
              {
                title: "Deploy",
                body: "Deploy the program.",
                result: "program is live.",
                effects: [{ node_id: "program", action: "reveal" }],
              },
            ],
          },
        ],
      }),
    );
    expect(reply.outcome).toBe("valid");
    expect(reply.ui!.components[0]).toMatchObject({
      nodes: [{ id: "program" }],
    });
  });

  it("keeps a flow without a model but drops its effects", () => {
    const reply = parseVisualReply(
      JSON.stringify({
        version: "solana-docs-ui/v1",
        kind: "answer",
        components: [
          {
            type: "step_flow",
            steps: [
              {
                title: "Deploy the program",
                body: "Run solana program deploy.",
                result: "The program is live.",
                effects: [
                  {
                    node_id: "rpc-node",
                    action: "connect",
                    to_node_id: "wallet",
                    kind: "invokes",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(reply.outcome).toBe("valid");
    expect(reply.ui!.components[0]).toEqual({
      type: "step_flow",
      steps: [
        {
          title: "Deploy the program",
          body: "Run solana program deploy.",
          result: "The program is live.",
        },
      ],
    });
  });

  it("sends the question and up to 12K characters of docs", () => {
    const input = JSON.parse(
      visualUserMessage({
        question: "What is rent?",
        intent: "conceptual",
        pages: [
          { title: "A", url: "/a", text: "a".repeat(9_000) },
          { title: "B", url: "/b", text: "b".repeat(9_000) },
          { title: "C", url: "/c", text: "c".repeat(9_000) },
        ],
      }),
    );
    expect(input.citations).toHaveLength(3);
    expect(
      input.retrieved_context.map((page: { text: string }) => page.text.length),
    ).toEqual([9_000, 3_000]);
    expect(input).toMatchObject({ answer: "", answer_plan: null });
  });
});

describe("closing source lists", () => {
  const cited = ["/developers/docs/core/pda", "/developers/docs/core/cpi"];

  it("finds the docs pages an answer links, outside code", () => {
    expect(
      docsLinkPaths(
        "[A](https://solana.com/ja/developers/docs/core/pda#seeds) [B](/learn/) [`getBalance`](/developers/docs/rpc/http/getbalance) [D](https://x.example)\n\n```md\n[C](/developers/docs/x)\n```",
      ),
    ).toEqual([
      "/developers/docs/core/pda",
      "/developers/docs/rpc/http/getbalance",
    ]);
  });

  it.each([
    "Sources: [PDAs](/developers/docs/core/pda), [CPI](/developers/docs/core/cpi)",
    "**Learn more:** [PDAs](/developers/docs/core/pda) and [CPI](https://solana.com/developers/docs/core/cpi).",
    "Sources:\n- [PDAs](/developers/docs/core/pda)\n- [CPI](/developers/docs/core/cpi)",
    "**Sources**\n\n- [PDAs](/developers/docs/core/pda)",
  ])("drops a closing list of cited pages: %s", (list) => {
    expect(withoutSourceList(`A PDA has no key.\n\n${list}`, cited)).toBe(
      "A PDA has no key.",
    );
  });

  it.each([
    // A link the panel would not list, or a sentence.
    "Sources: [PDAs](/developers/docs/core/pda), [Rent](/developers/docs/core/rent)",
    "Sources: [PDAs](/developers/docs/core/pda), [Stack Exchange](https://solana.stackexchange.com)",
    "Learn more in [PDAs](/developers/docs/core/pda).",
  ])("keeps anything else: %s", (list) => {
    const answer = `A PDA has no key.\n\n${list}`;
    expect(withoutSourceList(answer, cited)).toBe(answer);
  });
});

describe("made-up docs links (DocsCitationValidator::sanitizeAnswerUrls)", () => {
  const pages = new Set([
    "/developers/docs/core/pda",
    "/learn/understanding-solana-transaction-fees",
  ]);
  const exists = (path: string) => pages.has(path);

  it("unlinks docs paths with no page and keeps the rest", () => {
    const result = sanitizeDocsLinks(
      [
        "Read [Fees](/learn/understanding-solana-transactions-fees) first.",
        "Then [PDAs](https://solana.com/developers/docs/core/pda#seeds) and [Playground](https://beta.solpg.io/).",
        "Old path: [PDAs](/docs/core/pda). Templates: [x](/developers/templates).",
        "Bare: see /developers/docs/core/nope for more. And [/learn/nope](/learn/nope) too.",
        "`/developers/docs/core/nope` stays in code.",
      ].join("\n"),
      exists,
    );
    expect(result.answer).toBe(
      [
        "Read Fees first.",
        "Then [PDAs](https://solana.com/developers/docs/core/pda#seeds) and [Playground](https://beta.solpg.io/).",
        "Old path: [PDAs](/developers/docs/core/pda). Templates: [x](/developers/templates).",
        "Bare: see for more. And too.",
        "`/developers/docs/core/nope` stays in code.",
      ].join("\n"),
    );
    expect(result).toMatchObject({ removed: 3, moved: 1 });
  });

  it("leaves an answer with good links untouched", () => {
    const answer =
      "- item\n  - nested  [PDAs](/developers/docs/core/pda)\n\n```ts\nconst a  = 1;\n```";
    expect(sanitizeDocsLinks(answer, exists)).toEqual({
      answer,
      removed: 0,
      moved: 0,
    });
  });
});
