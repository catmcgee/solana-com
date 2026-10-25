import "server-only";

import type { AskGenerativeUi } from "../generative-ui/types";
import { isSetupOnlyStep, validateAskVisual } from "../generative-ui/validate";
import type { VisualIntent } from "./intent";

/**
 * A visual written by the model when no template fits: the docs agent's
 * second, structured call (GenerativeUiService::generate, "early" mode: the
 * question, the docs and no answer yet), run beside the answer. Its system
 * prompt is the agent's, with edits: JSON mode cannot return a bare `null`;
 * the archetypes are our renderer's (no `rpc-client`; signer, instruction
 * and validator added); and the field names and the validator's
 * model/flow contract are spelled out, as GLM otherwise writes `text` for
 * `body`, leaves out step results and draws nodes no step touches.
 * Whatever comes back must pass ../generative-ui/validate.ts.
 */

export const VISUAL_SYSTEM_PROMPT = `Create the first structured visual payload for a Solana docs chat answer. Return only JSON:
{"version":"solana-docs-ui/v1","kind":"answer","components":[...]}

Use only these component types for this first payload: answer_intro, concept_model, step_flow, callout.
Prefer answer_plan when present; otherwise use the answer plus retrieved_context. Do not rediscover structure from scratch.
Keep it compact. Generate the smallest useful visual answer.
answer_intro must be one short mental-model sentence. concept_model should include only the core entities. step_flow must be 3-4 primary steps max. callout is only for important prerequisite or warning notes.
Prioritize the mental model and real state transitions over prose.
Do not invent a new diagram layout. Select from supported archetypes and fill only labels, fields, relationships, steps, commands, and effects.
Intent routing: procedural answers should use answer_intro, concept_model, and step_flow. Conceptual answers should usually use answer_intro plus concept_model. Debugging answers should use a cause/fix step_flow. Comparison answers should usually return null. If structure is weak, return null.
For token creation, put devnet selection and wallet funding in a compact prerequisite callout. Keep the main flow to: create mint, create token account, mint supply.
Mark closing accounts, burning, metadata, and transfers as optional only when the user asked for them; otherwise omit them from the visual.
Do not include command_list, code_tabs, cards, definition_grid, comparison, source_links, long code blocks, HTML, CSS, JavaScript, JSX, SVG, markdown, event handlers, or executable UI code.
Use plain-text field values only. Never include secrets, private keys, seed phrases, auth tokens, or commands that expose credentials.
Never invent commands, package APIs, facts, or URLs. Commands and claims must come from the answer, answer_plan, or retrieved_context.
Sources stay in the markdown answer and citations. Do not include URLs, source_links, source_url, source_urls, links, or per-step sources in the visual payload.
Use only these preferred node archetypes: wallet, signer, mint-account, token-account, pda, program, instruction, transaction, rpc-node, validator.
Use only these relationship kinds: owns, signs, derives, initializes, invokes, writes, reads, mints-to, transfers-to.
Each concept_model node needs id, archetype, label, and optional fields as an array of {label,value} string objects.
Each concept_model relationship needs from, to, and kind.
Use these exact field names: answer_intro has title and body; callout has tone (info, warning, or success), title, and body; concept_model has title, nodes, and relationships; step_flow has title and steps. Every step needs title, body, result, and effects; command is optional. Never use text in place of body.
With a step_flow, every concept_model node must appear in at least one step's effects, and every step's effects must touch at least one node. Leave out nodes the steps never touch.
Each procedural step_flow step must include effects that describe real state changes. Do not emit setup effects for devnet, airdrop, install, or funding unless they are visually meaningful. Commands are optional and should be one short command when possible. Use effects objects with node_id plus action reveal, update, connect, or close. For update include field and value. For connect include to_node_id and kind.
Keep step titles as action phrases. Keep body and result to one short sentence each. Use stable kebab-case node IDs such as mint-account, token-account, wallet, program, pda, and rpc-node.
Keep labels short and docs-native. If structure beyond a short orientation is not justified, return null.
This response is in JSON mode: wherever these instructions say to return null, return {"generative_ui": null} instead.`;

export const VISUAL_LIMITS = {
  maxTokens: 800,
  /** retrieved_context, as the agent's max_tool_context_bytes. */
  contextChars: 12_000,
  timeoutMs: 25_000,
} as const;

const FIRST_PAYLOAD_TYPES = new Set([
  "answer_intro",
  "concept_model",
  "step_flow",
  "callout",
]);
const SOURCE_KEYS = ["source_url", "source_urls", "sources", "links"];

export type VisualInput = {
  question: string;
  intent: VisualIntent;
  pages: Array<{ title: string; url: string; text: string }>;
};

/** The user message: the agent's JSON, with the excerpts cut to 12K characters. */
export function visualUserMessage(input: VisualInput): string {
  let budget: number = VISUAL_LIMITS.contextChars;
  const context = input.pages.flatMap(({ title, url, text }) => {
    if (budget <= 200) return [];
    const cut = text.slice(0, budget);
    budget -= cut.length;
    return [{ title, url, text: cut }];
  });
  return JSON.stringify({
    question: input.question,
    answer: "",
    answer_plan: null,
    visual_intent: input.intent,
    citations: input.pages.map(({ title, url }) => ({ title, url })),
    retrieved_context: context,
  });
}

/** The JSON in a reply: bare, fenced, or the outermost {...}. */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "null") return "null";
  const fenced = /```(?:json)?\s*(null|\{[\s\S]*\})\s*```/i.exec(text);
  if (fenced) return fenced[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start === -1 || end <= start ? null : text.slice(start, end + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutSources(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !SOURCE_KEYS.includes(key)),
  );
}

/** First-payload components only, without source fields (the answer cites). */
function firstPayload(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.components)) return payload;
  return {
    ...payload,
    components: payload.components
      .filter(
        (component) =>
          isRecord(component) &&
          FIRST_PAYLOAD_TYPES.has(String(component.type ?? "")),
      )
      .map((component) => {
        const clean = withoutSources(component as Record<string, unknown>);
        if (clean.type !== "step_flow" || !Array.isArray(clean.steps)) {
          return clean;
        }
        return {
          ...clean,
          steps: clean.steps.map((step) => {
            if (!isRecord(step)) return step;
            const next = withoutSources(step);
            return isRecord(next.command)
              ? { ...next, command: withoutSources(next.command) }
              : next;
          }),
        };
      }),
  };
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : null;

/** Node fields with an empty label or value, which sink the whole model. */
function withoutEmptyFields(node: unknown) {
  if (!isRecord(node) || !Array.isArray(node.fields)) return node;
  return {
    ...node,
    fields: node.fields.filter(
      (field) =>
        !isRecord(field) ||
        (!!text(field.label)?.trim() && !!text(field.value)?.trim()),
    ),
  };
}

/**
 * Two fixes GLM needs and the agent's model did not, both removals only
 * (everything left must still pass the validator): node fields without a
 * value, and model nodes (with their relationships) that no step mentions,
 * which GLM draws even when told not to. Setup steps don't count: the
 * validator leaves them out.
 */
function withoutUntouchedNodes(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.components)) return payload;
  payload = {
    ...payload,
    components: payload.components.map((component) =>
      isRecord(component) &&
      component.type === "concept_model" &&
      Array.isArray(component.nodes)
        ? { ...component, nodes: component.nodes.map(withoutEmptyFields) }
        : component,
    ),
  };
  const steps = (payload.components as unknown[]).flatMap((component) =>
    isRecord(component) &&
    component.type === "step_flow" &&
    Array.isArray(component.steps)
      ? component.steps
          .filter(isRecord)
          .filter(
            (step) =>
              !isSetupOnlyStep([
                text(step.title),
                text(step.body),
                isRecord(step.command)
                  ? text(step.command.copy)
                  : text(step.command),
                text(step.result),
              ]),
          )
      : [],
  );
  if (steps.length === 0) return payload;
  const flowText = steps
    .flatMap((step) => [
      step.body,
      step.result,
      ...(Array.isArray(step.effects) ? step.effects : []).flatMap((effect) =>
        isRecord(effect)
          ? [effect.node_id, effect.to_node_id, effect.target_node_id]
          : [],
      ),
    ])
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .toLowerCase();
  return {
    ...payload,
    components: (payload.components as unknown[]).map((component) => {
      if (
        !isRecord(component) ||
        component.type !== "concept_model" ||
        !Array.isArray(component.nodes)
      ) {
        return component;
      }
      const kept = component.nodes.filter(
        (node) =>
          !isRecord(node) ||
          typeof node.id !== "string" ||
          flowText.includes(node.id.toLowerCase()),
      );
      if (kept.length === 0 || kept.length === component.nodes.length) {
        return component;
      }
      const ids = new Set(
        kept.flatMap((node) => (isRecord(node) ? [node.id] : [])),
      );
      const key = Array.isArray(component.relationships)
        ? "relationships"
        : "edges";
      const edges = component[key];
      return {
        ...component,
        nodes: kept,
        ...(Array.isArray(edges)
          ? {
              [key]: edges.filter(
                (edge) =>
                  !isRecord(edge) || (ids.has(edge.from) && ids.has(edge.to)),
              ),
            }
          : {}),
      };
    }),
  };
}

/**
 * Steps' effects only mean something on a model's nodes: a flow without a
 * concept_model keeps its steps and loses the effects (the validator only
 * checks them against a model).
 */
function withModelEffectsOnly(ui: AskGenerativeUi): AskGenerativeUi {
  if (ui.components.some((component) => component.type === "concept_model")) {
    return ui;
  }
  return {
    ...ui,
    components: ui.components.map((component) =>
      component.type === "step_flow" && Array.isArray(component.steps)
        ? {
            ...component,
            steps: component.steps.map((step) => {
              if (!isRecord(step)) return step;
              const { effects: _effects, ...rest } = step;
              return rest;
            }),
          }
        : component,
    ),
  };
}

export type VisualOutcome =
  | "valid"
  | "null"
  | "invalid"
  | "failed"
  | "timeout"
  | "aborted";

export type VisualResult = {
  ui: AskGenerativeUi | null;
  outcome: VisualOutcome;
  errors: string[];
};

/** The model's reply as a validated visual (or why there is none). */
export function parseVisualReply(text: string): VisualResult {
  const json = extractJson(text);
  if (json === null) {
    return { ui: null, outcome: "invalid", errors: ["no JSON object"] };
  }
  if (json.toLowerCase() === "null") {
    return { ui: null, outcome: "null", errors: [] };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    return { ui: null, outcome: "invalid", errors: ["not valid JSON"] };
  }
  if (isRecord(decoded) && Object.hasOwn(decoded, "generative_ui")) {
    if (decoded.generative_ui === null) {
      return { ui: null, outcome: "null", errors: [] };
    }
    decoded = decoded.generative_ui;
  }
  if (!isRecord(decoded)) {
    return { ui: null, outcome: "invalid", errors: ["not an object"] };
  }
  const result = validateAskVisual(
    withoutUntouchedNodes(firstPayload(decoded)),
  );
  return result.ok
    ? {
        ui: withModelEffectsOnly(result.payload),
        outcome: "valid",
        errors: result.errors,
      }
    : { ui: null, outcome: "invalid", errors: result.errors };
}

export type VisualCall = {
  result: Promise<VisualResult & { usage: VisualUsage; ms: number }>;
  abort: () => void;
};

export type VisualUsage = { input: number; output: number; cached: number };

const NO_USAGE: VisualUsage = { input: 0, output: 0, cached: 0 };

function usageOf(value: unknown): VisualUsage {
  if (!isRecord(value)) return NO_USAGE;
  const details = isRecord(value.prompt_tokens_details)
    ? value.prompt_tokens_details
    : {};
  const number = (n: unknown) => (typeof n === "number" ? n : 0);
  return {
    input: number(value.prompt_tokens),
    output: number(value.completion_tokens),
    cached: number(details.cached_tokens),
  };
}

/**
 * Starts the visual call. The key only goes into the Authorization header;
 * nothing from the upstream reply but the validated payload leaves here.
 */
export function startVisualCall(
  config: { apiKey: string; endpoint: string; model: string },
  input: VisualInput,
  requestSignal: AbortSignal,
): VisualCall {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromRequest = () => controller.abort();
  requestSignal.addEventListener("abort", abortFromRequest, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, VISUAL_LIMITS.timeoutMs);
  const startedAt = performance.now();
  const done = (
    result: VisualResult,
    usage: VisualUsage = NO_USAGE,
  ): VisualResult & { usage: VisualUsage; ms: number } => {
    clearTimeout(timer);
    requestSignal.removeEventListener("abort", abortFromRequest);
    return { ...result, usage, ms: Math.round(performance.now() - startedAt) };
  };
  const result = (async () => {
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0.2,
          max_tokens: VISUAL_LIMITS.maxTokens,
          reasoning: { enabled: false },
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: VISUAL_SYSTEM_PROMPT },
            { role: "user", content: visualUserMessage(input) },
          ],
        }),
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return done({
          ui: null,
          outcome: "failed",
          errors: [`status ${response.status}`],
        });
      }
      const reply: unknown = await response.json();
      const choice =
        isRecord(reply) && Array.isArray(reply.choices)
          ? reply.choices[0]
          : null;
      const message = isRecord(choice) ? choice.message : null;
      const content =
        isRecord(message) && typeof message.content === "string"
          ? message.content
          : "";
      const usage = usageOf(isRecord(reply) ? reply.usage : null);
      // Cut off at max_tokens: the JSON is unfinished.
      if (isRecord(choice) && choice.finish_reason === "length") {
        return done(
          { ui: null, outcome: "invalid", errors: ["max_tokens"] },
          usage,
        );
      }
      return done(parseVisualReply(content), usage);
    } catch {
      return done({
        ui: null,
        outcome: timedOut
          ? "timeout"
          : controller.signal.aborted
            ? "aborted"
            : "failed",
        errors: [],
      });
    }
  })();
  return { result, abort: () => controller.abort() };
}
