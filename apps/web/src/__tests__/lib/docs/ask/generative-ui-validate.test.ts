import { describe, expect, it } from "vitest";
import { debuggingFlowGenerativeUiFixture } from "@/lib/docs/ask/fixtures/template-visuals";
import { validateAskVisual } from "@/lib/docs/ask/generative-ui/validate";

/** The docs agent's token template, as its GenerativeUiTemplateService writes it. */
function tokenTemplate() {
  return {
    version: "solana-docs-ui/v1",
    kind: "answer",
    components: [
      {
        type: "answer_intro",
        title: "Token mental model",
        body: "A token is a mint-account plus token-account balances that point back to that mint.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Prerequisite",
        body: "Use devnet and fund your wallet before running the token commands.",
      },
      {
        type: "concept_model",
        title: "Core entities",
        nodes: [
          {
            id: "wallet",
            archetype: "wallet",
            label: "Wallet",
            fields: [{ label: "role", value: "payer and owner" }],
          },
          {
            id: "mint-account",
            archetype: "mint-account",
            label: "Mint account",
            fields: [{ label: "supply", value: "0" }],
          },
          {
            id: "token-account",
            archetype: "token-account",
            label: "Token account",
            fields: [{ label: "balance", value: "0" }],
          },
        ],
        relationships: [
          { from: "wallet", to: "token-account", kind: "owns" },
          { from: "token-account", to: "mint-account", kind: "reads" },
        ],
      },
      {
        type: "step_flow",
        title: "Token creation flow",
        steps: [
          {
            title: "Create mint",
            body: "Create mint-account as the token definition.",
            command: "spl-token create-token",
            result: "mint-account exists with supply 0.",
            effects: [
              { node_id: "mint-account", action: "reveal" },
              {
                node_id: "mint-account",
                action: "update",
                field: "supply",
                value: "0",
              },
            ],
          },
          {
            title: "Create token account",
            body: "Create token-account for wallet using the mint-account address.",
            command: "spl-token create-account <MINT_ADDRESS>",
            result: "token-account exists with balance 0.",
            effects: [
              { node_id: "token-account", action: "reveal" },
              {
                node_id: "wallet",
                action: "connect",
                to_node_id: "token-account",
                kind: "owns",
              },
            ],
          },
          {
            title: "Mint supply",
            body: "Mint from mint-account into token-account.",
            command: "spl-token mint <MINT_ADDRESS> <AMOUNT>",
            result: "mint-account supply and token-account balance increase.",
            effects: [
              {
                node_id: "token-account",
                action: "update",
                field: "balance",
                value: "<AMOUNT>",
              },
            ],
          },
        ],
      },
    ],
  };
}

type Payload = ReturnType<typeof tokenTemplate>;
type Component = Payload["components"][number] & Record<string, unknown>;

function withComponents(
  update: (components: Component[]) => unknown[],
): unknown {
  const payload = tokenTemplate();
  return { ...payload, components: update(payload.components as Component[]) };
}

describe("validateAskVisual (the agent's GenerativeUiValidator)", () => {
  it("accepts the agent's template and keeps only the contract's fields", () => {
    const payload = tokenTemplate() as Record<string, unknown> & Payload;
    (payload.components[0] as Record<string, unknown>).links = [
      { url: "https://example.com" },
    ];
    (
      payload.components[3] as { steps: Array<Record<string, unknown>> }
    ).steps[0]!.setup = true;
    const result = validateAskVisual(payload);
    expect(result.ok).toBe(true);
    expect(result.payload!.components.map((c) => c.type)).toEqual([
      "answer_intro",
      "callout",
      "concept_model",
      "step_flow",
    ]);
    expect(result.payload!.components[0]).toEqual({
      type: "answer_intro",
      title: "Token mental model",
      body: "A token is a mint-account plus token-account balances that point back to that mint.",
    });
    const flow = result.payload!.components[3] as unknown as {
      steps: unknown[];
    };
    expect(flow.steps[0]).not.toHaveProperty("setup");
  });

  it("refuses payloads with the wrong version, kind or no components", () => {
    expect(validateAskVisual(null).ok).toBe(false);
    expect(validateAskVisual([]).ok).toBe(false);
    expect(
      validateAskVisual({ ...tokenTemplate(), version: "v2" }).errors,
    ).toContain("version must be solana-docs-ui/v1");
    expect(validateAskVisual({ ...tokenTemplate(), kind: "card" }).ok).toBe(
      false,
    );
    expect(validateAskVisual({ ...tokenTemplate(), components: [] }).ok).toBe(
      false,
    );
    // A missing kind is an answer.
    const { kind: _kind, ...noKind } = tokenTemplate();
    expect(validateAskVisual(noKind).ok).toBe(true);
  });

  it("drops unknown or broken components but keeps the rest", () => {
    const result = validateAskVisual(
      withComponents((components) => [
        { type: "code_tabs", tabs: [{ code: "x" }] },
        components[0],
        { type: "callout", body: "<script>alert(1)</script>" },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.payload!.components.map((c) => c.type)).toEqual([
      "answer_intro",
    ]);
    expect(result.errors).toContain(
      "components.0.type is unsupported and was omitted",
    );
    expect(result.errors).toContain("components.2.body contains unsafe markup");
  });

  it("fails a model and flow when either does not survive", () => {
    const result = validateAskVisual(
      withComponents((components) => [
        components[2],
        { ...components[3], steps: [{ title: "No body" }] },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toBe(
      "procedural generative UI payloads require valid concept_model and step_flow components",
    );
  });

  it("holds the flow to the model: real node ids, every node and step referenced", () => {
    const ghost = validateAskVisual(
      withComponents((components) => {
        const flow = structuredClone(components[3]) as {
          steps: Array<{ effects: Array<Record<string, unknown>> }>;
        };
        flow.steps[2]!.effects = [
          { node_id: "ghost", action: "update", field: "x", value: "y" },
        ];
        return [components[2], flow];
      }),
    );
    expect(ghost.ok).toBe(false);
    expect(ghost.errors).toContain(
      "step_flow step 2 effects 0 must reference an existing concept_model node id",
    );

    const unused = validateAskVisual(
      withComponents((components) => {
        const model = structuredClone(components[2]) as {
          nodes: Array<Record<string, unknown>>;
        };
        model.nodes.push({
          id: "validator",
          archetype: "validator",
          label: "Validator",
        });
        return [model, components[3]];
      }),
    );
    expect(unused.errors).toContain(
      "concept_model node id validator must be referenced by step_flow text",
    );

    const noEffects = validateAskVisual(
      withComponents((components) => {
        const flow = structuredClone(components[3]) as {
          steps: Array<Record<string, unknown>>;
        };
        delete flow.steps[1]!.effects;
        return [components[2], flow];
      }),
    );
    expect(noEffects.errors).toContain("step_flow step 1 must include effects");
  });

  it("skips setup-only steps and caps steps and components", () => {
    const result = validateAskVisual(
      withComponents((components) => {
        const flow = structuredClone(components[3]) as {
          steps: Array<Record<string, unknown>>;
        };
        flow.steps.unshift({
          title: "Fund wallet",
          body: "Airdrop devnet SOL to wallet.",
          command: "solana airdrop 2",
          result: "wallet is funded.",
          effects: [{ node_id: "wallet", action: "reveal" }],
        });
        flow.steps.push(
          ...[1, 2].map((n) => ({
            title: `Extra ${n}`,
            body: "Update token-account again.",
            result: "token-account changed.",
            effects: [
              {
                node_id: "token-account",
                action: "update",
                field: "balance",
                value: String(n),
              },
            ],
          })),
        );
        return [...components.slice(0, 3), flow, components[0], components[1]];
      }),
    );
    expect(result.ok).toBe(true);
    const flow = result.payload!.components[3] as unknown as {
      steps: Array<{ title: string }>;
    };
    expect(flow.steps.map((step) => step.title)).toEqual([
      "Create mint",
      "Create token account",
      "Mint supply",
      "Extra 1",
    ]);
    expect(result.payload!.components).toHaveLength(5);
    expect(result.errors).toContain("components truncated to 5 items");
  });

  it("reads state_changes, aliases and inferred archetypes", () => {
    const result = validateAskVisual({
      version: "solana-docs-ui/v1",
      kind: "answer",
      components: [
        {
          type: "concept_model",
          nodes: [
            { id: "payer", title: "Payer wallet" },
            { id: "vault-pda", label: "Vault PDA" },
          ],
          edges: [{ from: "payer", to: "vault-pda", label: "writes data" }],
        },
        {
          type: "step_flow",
          steps: [
            {
              title: "Fund vault",
              body: "payer funds vault-pda.",
              result: "vault-pda has lamports.",
              command: { copy: "solana transfer <VAULT> 1" },
              state_changes: [
                "connect payer -> vault-pda: transfers to",
                "update vault-pda.lamports: 1 SOL",
              ],
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    const [model, flow] = result.payload!.components as Array<
      Record<string, unknown>
    >;
    expect(model!.nodes).toEqual([
      { id: "payer", archetype: "wallet", label: "Payer wallet" },
      { id: "vault-pda", archetype: "pda", label: "Vault PDA" },
    ]);
    expect(model!.relationships).toEqual([
      { from: "payer", to: "vault-pda", kind: "writes", label: "writes data" },
    ]);
    expect(flow!.steps).toEqual([
      {
        title: "Fund vault",
        body: "payer funds vault-pda.",
        command: "solana transfer <VAULT> 1",
        result: "vault-pda has lamports.",
        effects: [
          {
            action: "connect",
            node_id: "payer",
            to_node_id: "vault-pda",
            kind: "transfers-to",
            label: "transfers to",
          },
          {
            action: "update",
            node_id: "vault-pda",
            field: "lamports",
            value: "1 SOL",
          },
        ],
      },
    ]);
  });

  it("refuses bad enums, ids and a model without nodes", () => {
    const bad = validateAskVisual(
      withComponents((components) => {
        const model = structuredClone(components[2]) as {
          nodes: Array<Record<string, unknown>>;
        };
        model.nodes[0]!.archetype = "dragon";
        return [model];
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain("components.0.nodes.0.archetype is invalid");
    expect(
      validateAskVisual({
        version: "solana-docs-ui/v1",
        kind: "answer",
        components: [
          {
            type: "concept_model",
            nodes: [{ id: "Not Kebab", label: "x", archetype: "pda" }],
          },
        ],
      }).errors,
    ).toContain("components.0.nodes.0.id must be stable kebab-case");
    expect(
      validateAskVisual({
        version: "solana-docs-ui/v1",
        kind: "answer",
        components: [{ type: "concept_model", nodes: [] }],
      }).ok,
    ).toBe(false);
  });

  it("sheds trailing components to fit the byte cap", () => {
    const result = validateAskVisual(
      withComponents((components) => [
        components[0],
        { type: "callout", body: "x".repeat(3_000) },
      ]),
      { components: 5, steps: 4, bytes: 1_000 },
    );
    expect(result.ok).toBe(true);
    expect(result.payload!.components).toHaveLength(1);
    expect(result.errors).toContain(
      "components dropped to fit the 1000-byte cap",
    );
  });

  it("passes our debugging-flow template", () => {
    expect(validateAskVisual(debuggingFlowGenerativeUiFixture).ok).toBe(true);
  });
});
